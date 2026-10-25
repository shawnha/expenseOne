import { db } from "@/lib/db";
import {
  recurringExpenses,
  recurringExpenseAttachments,
  recurringOccurrences,
  attachments,
  companies,
  expenses,
  users,
} from "@/lib/db/schema";
import { planBrands, planProjects } from "@/lib/db/schema-plans";
import { and, eq, lte, asc, desc, count, isNotNull, sql } from "drizzle-orm";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createExpense } from "@/services/expense.service";
import { createNotification } from "@/services/notification.service";
import { sendPushToUser } from "@/services/push.service";
import { AppError, validateUploadFile } from "@/services/attachment.service";
import {
  attachExpenseToOccurrence,
  claimOccurrence,
  getOccurrence,
  releaseOccurrence,
  releaseReservation,
  reserveOccurrence,
  syncRecurringPlans,
  todayKST,
  type SyncResult,
} from "@/services/recurring-plan.service";
import { withPlanTx } from "@/lib/db/plans-client";
import { loadAccess, requireProjectAccess } from "@/lib/plans/permissions";
import { isCostPlanningAllowed } from "@/lib/plans/flag";
import { PlanError } from "@/lib/plans/errors";
import { rowsOf } from "@/lib/plans/rows";
import {
  nextRunAfter,
  describeSchedule,
  dueDateFor,
  type Schedule,
} from "@/lib/recurring-schedule";
import {
  firstMatchingOnOrAfter,
  firstOnOrAfterFromAnchor,
  monthStartOf,
  recurringConfigError,
  restartAnchor,
  toRequestMode,
  type RequestMode,
} from "@/lib/recurring-occurrences";
import {
  recurringScheduleIssue,
  type RecurringExpenseInput,
  type RecurringExpenseUpdateInput,
} from "@/lib/validations/expense";

// ---------------------------------------------------------------------------
// 반복 지급(0017 반복 입금요청 + 0029) — 등록/수정과 예정일 처리
//
// 예정일 처리는 `nextRunDate` 커서와 회차 줄(recurring_occurrences)로 돈다. cron 은 커서가 오늘 이하인
// 반복을 고르고, 회차마다 claimOccurrence 로 "처리함"을 먼저 적은 뒤 일을 한다. 같은 날 두 번 돌거나
// 중간에 실패해 다음 날 다시 돌아도 같은 회차를 두 번 처리하지 않는다.
//
// 처리 방식(request_mode)
//   AUTO   같은 금액으로 입금요청을 자동 제출(0017 동작). 회차에 비용계획이 있으면 연결한다.
//   REMIND 등록자에게 "이번 회차 입금요청을 올려 주세요" 알림 + 미리 채운 폼 링크. 자동 제출하지 않는다 —
//          승인은 곧 송금이라, 추정 금액이 그대로 승인되면 잘못 송금된다. 실제 반복 지급은 대부분 금액이 매달 다르다.
//   NONE   아무것도 안 한다(비용계획에만 표시).
// ---------------------------------------------------------------------------

export { todayKST };

const STORAGE_BUCKET = "attachments";

function storageClient() {
  // 서비스 롤 — Storage 작업은 RLS 를 우회해야 한다(attachment.service 와 같다).
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export interface RecurringActor {
  id: string;
  role: "MEMBER" | "ADMIN";
}

function toSchedule(r: {
  frequency: string;
  intervalCount: number;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  weekday: number | null;
}): Schedule {
  return {
    frequency: r.frequency as Schedule["frequency"],
    intervalCount: r.intervalCount,
    dayOfMonth: r.dayOfMonth,
    monthOfYear: r.monthOfYear,
    weekday: r.weekday,
  };
}

/** 이 반복에서 마지막으로 처리(자동 제출·알림)한 회차 날짜. 없으면 null. */
async function lastRunOccurrenceDate(recurringId: string): Promise<string | null> {
  const [row] = await db
    .select({ d: sql<string | null>`max(${recurringOccurrences.occurrenceDate})::text` })
    .from(recurringOccurrences)
    .where(and(eq(recurringOccurrences.recurringExpenseId, recurringId), isNotNull(recurringOccurrences.runAt)));
  return row?.d ?? null;
}

function planErrorToApp(err: unknown): never {
  if (err instanceof PlanError) {
    throw new AppError(
      err.code === "NOT_FOUND" ? "NOT_FOUND" : err.code === "FORBIDDEN" ? "FORBIDDEN" : "VALIDATION_ERROR",
      err.code === "NOT_FOUND" ? "비용계획 프로젝트를 찾을 수 없거나 참여자가 아닙니다." : err.message,
    );
  }
  throw err;
}

/**
 * 비용계획 칸 검사: 고른 사람이 그 프로젝트 참여자(또는 대표)이고, 프로젝트·분류가 반복의 법인 것인지.
 * DB 의 복합 FK 도 같은 걸 막지만, 거기 걸리면 사용자에게 "서버 오류"로만 보인다.
 */
async function assertPlanTarget(
  actor: RecurringActor,
  t: { companyId: string; planProjectId: string | null; planBrandId: string | null },
): Promise<void> {
  if (!t.planProjectId) return;
  if (!(await isCostPlanningAllowed(actor.id))) {
    throw new AppError("FORBIDDEN", "비용계획을 쓸 수 없는 계정입니다.");
  }
  try {
    await withPlanTx(
      async (tx) => {
        const access = await loadAccess(tx, { userId: actor.id, role: actor.role });
        const project = await requireProjectAccess(tx, access, t.planProjectId!);
        if (project.companyId !== t.companyId) {
          throw new PlanError("VALIDATION_ERROR", "반복의 회사와 비용계획 프로젝트의 법인이 다릅니다.");
        }
        // 계획 화면(createPlan)과 같은 규칙 — 활성 원화 법인, 활성 분류.
        const ok = rowsOf<{ company_ok: boolean; brand_ok: boolean }>(
          await tx.execute(sql`SELECT EXISTS (SELECT 1 FROM expenseone.companies c
                                               WHERE c.id = ${t.companyId}::uuid AND c.is_active = true
                                                 AND coalesce(c.currency, 'KRW') = 'KRW') AS company_ok,
                                      (${t.planBrandId}::uuid IS NULL OR EXISTS (
                                         SELECT 1 FROM expenseone.plan_brands b
                                          WHERE b.id = ${t.planBrandId}::uuid AND b.company_id = ${t.companyId}::uuid
                                            AND b.is_active = true)) AS brand_ok`),
        )[0];
        if (!ok?.company_ok) throw new PlanError("VALIDATION_ERROR", "이 회사는 비용계획에 쓸 수 없습니다.");
        if (!ok?.brand_ok) throw new PlanError("VALIDATION_ERROR", "분류가 이 법인 것이 아니거나 꺼져 있습니다.");
      },
      { readOnly: true },
    );
  } catch (err) {
    planErrorToApp(err);
  }
}

/** 반복을 만들거나 고친 뒤 비용계획을 맞춘다. 실패해도 반복 저장은 그대로 — 다음 cron 이 다시 맞춘다. */
async function syncPlansQuietly(
  recurringId: string,
  actorId: string,
  floor?: string,
): Promise<SyncResult | { error: string }> {
  try {
    return await syncRecurringPlans(recurringId, { actorId, floor });
  } catch (err) {
    console.error("[Recurring] 비용계획 맞추기 실패:", err);
    return { error: "비용계획 반영에 실패했습니다. 내일 아침 자동으로 다시 시도합니다." };
  }
}

// ---------------------------------------------------------------------------
// 조회
// ---------------------------------------------------------------------------

export async function listRecurringExpenses(userId: string, isAdmin: boolean) {
  const attachmentCounts = db
    .select({
      recurringExpenseId: recurringExpenseAttachments.recurringExpenseId,
      n: count().as("n"),
    })
    .from(recurringExpenseAttachments)
    .groupBy(recurringExpenseAttachments.recurringExpenseId)
    .as("ac");

  const rows = await db
    .select({
      id: recurringExpenses.id,
      title: recurringExpenses.title,
      description: recurringExpenses.description,
      amount: recurringExpenses.amount,
      currency: recurringExpenses.currency,
      category: recurringExpenses.category,
      bankName: recurringExpenses.bankName,
      accountHolder: recurringExpenses.accountHolder,
      accountNumber: recurringExpenses.accountNumber,
      companyId: recurringExpenses.companyId,
      frequency: recurringExpenses.frequency,
      intervalCount: recurringExpenses.intervalCount,
      dayOfMonth: recurringExpenses.dayOfMonth,
      monthOfYear: recurringExpenses.monthOfYear,
      weekday: recurringExpenses.weekday,
      dueDateOffsetDays: recurringExpenses.dueDateOffsetDays,
      attachFiles: recurringExpenses.attachFiles,
      isActive: recurringExpenses.isActive,
      nextRunDate: recurringExpenses.nextRunDate,
      lastRunAt: recurringExpenses.lastRunAt,
      requestMode: recurringExpenses.requestMode,
      planProjectId: recurringExpenses.planProjectId,
      planBrandId: recurringExpenses.planBrandId,
      planDatePrecision: recurringExpenses.planDatePrecision,
      startsOn: recurringExpenses.startsOn,
      endsOn: recurringExpenses.endsOn,
      planProjectName: planProjects.name,
      planBrandName: planBrands.name,
      companyName: companies.name,
      submitterName: users.name,
      submittedById: recurringExpenses.submittedById,
      attachmentCount: attachmentCounts.n,
    })
    .from(recurringExpenses)
    .leftJoin(companies, eq(recurringExpenses.companyId, companies.id))
    .leftJoin(users, eq(recurringExpenses.submittedById, users.id))
    .leftJoin(planProjects, eq(recurringExpenses.planProjectId, planProjects.id))
    .leftJoin(planBrands, eq(recurringExpenses.planBrandId, planBrands.id))
    .leftJoin(attachmentCounts, eq(attachmentCounts.recurringExpenseId, recurringExpenses.id))
    // 관리자는 전체를, 그 외에는 본인이 등록한 것만 본다.
    .where(isAdmin ? undefined : eq(recurringExpenses.submittedById, userId))
    .orderBy(desc(recurringExpenses.isActive), asc(recurringExpenses.nextRunDate));

  return rows.map((r) => ({
    ...r,
    requestMode: toRequestMode(r.requestMode),
    attachmentCount: Number(r.attachmentCount ?? 0),
    scheduleLabel: describeSchedule(toSchedule(r)),
  }));
}

export type RecurringListItem = Awaited<ReturnType<typeof listRecurringExpenses>>[number];

export async function listRecurringAttachments(recurringId: string, actor: RecurringActor) {
  await requireOwnTemplate(recurringId, actor);
  return db
    .select({
      id: recurringExpenseAttachments.id,
      fileName: recurringExpenseAttachments.fileName,
      documentType: recurringExpenseAttachments.documentType,
      fileSize: recurringExpenseAttachments.fileSize,
      mimeType: recurringExpenseAttachments.mimeType,
      createdAt: recurringExpenseAttachments.createdAt,
    })
    .from(recurringExpenseAttachments)
    .where(eq(recurringExpenseAttachments.recurringExpenseId, recurringId))
    .orderBy(asc(recurringExpenseAttachments.createdAt));
}

async function requireOwnTemplate(id: string, actor: RecurringActor) {
  const [existing] = await db.select().from(recurringExpenses).where(eq(recurringExpenses.id, id));
  if (!existing) throw new AppError("NOT_FOUND", "반복 설정을 찾을 수 없습니다.");
  if (actor.role !== "ADMIN" && existing.submittedById !== actor.id) {
    throw new AppError("FORBIDDEN", "본인이 등록한 반복만 바꿀 수 있습니다.");
  }
  return existing;
}

// ---------------------------------------------------------------------------
// 등록 / 수정 / 삭제
// ---------------------------------------------------------------------------

export async function createRecurringExpense(input: RecurringExpenseInput, actor: RecurringActor) {
  const today = todayKST();
  const requestMode: RequestMode = input.requestMode ?? "AUTO"; // 예전 화면은 칸을 안 보낸다 = 0017 동작
  const t = {
    companyId: input.companyId,
    currency: input.currency ?? "KRW",
    category: input.category ?? null,
    bankName: input.bankName ?? null,
    accountHolder: input.accountHolder ?? null,
    accountNumber: input.accountNumber ?? null,
    requestMode,
    planProjectId: input.planProjectId ?? null,
    planBrandId: input.planProjectId ? (input.planBrandId ?? null) : null,
    startsOn: input.startsOn ?? null,
    endsOn: input.endsOn ?? null,
  };
  const configError = recurringConfigError(t);
  if (configError) throw new AppError("VALIDATION_ERROR", configError);
  await assertPlanTarget(actor, t);

  const schedule = toSchedule({
    frequency: input.frequency,
    intervalCount: input.intervalCount ?? 1,
    dayOfMonth: input.dayOfMonth ?? null,
    monthOfYear: input.monthOfYear ?? null,
    weekday: input.weekday ?? null,
  });
  // 시작일 = 기준 회차. 고른 날(주기에 맞는 날로 맞춤) 또는 오늘 이후 첫 회차.
  // 처리는 오늘 이전으로 거슬러 가지 않는다 — 기준 회차에서 이어 가며 오늘 이상인 첫 회차부터.
  const startsOn = firstMatchingOnOrAfter(schedule, t.startsOn ?? today);
  if (t.endsOn && t.endsOn < startsOn) {
    throw new AppError("VALIDATION_ERROR", "끝나는 날이 첫 회차보다 앞입니다.");
  }
  const nextRunDate = firstOnOrAfterFromAnchor(schedule, startsOn, today);

  const [created] = await db
    .insert(recurringExpenses)
    .values({
      title: input.title,
      description: input.description ?? null,
      amount: input.amount,
      currency: t.currency,
      category: t.category,
      bankName: t.bankName,
      accountHolder: t.accountHolder,
      accountNumber: t.accountNumber,
      companyId: input.companyId,
      submittedById: actor.id,
      frequency: input.frequency,
      intervalCount: schedule.intervalCount,
      dayOfMonth: schedule.dayOfMonth ?? null,
      monthOfYear: schedule.monthOfYear ?? null,
      weekday: schedule.weekday ?? null,
      dueDateOffsetDays: input.dueDateOffsetDays ?? null,
      attachFiles: input.attachFiles ?? false,
      isActive: input.isActive ?? true,
      requestMode,
      planProjectId: t.planProjectId,
      planBrandId: t.planBrandId,
      planDatePrecision: input.planDatePrecision ?? "DAY",
      startsOn,
      endsOn: t.endsOn,
      nextRunDate,
    })
    .returning();

  let copiedAttachments = 0;
  if (input.copyAttachmentsFromExpenseId) {
    copiedAttachments = await copyExpenseAttachmentsToTemplate(input.copyAttachmentsFromExpenseId, created.id, actor);
    if (copiedAttachments > 0 && requestMode === "AUTO" && !created.attachFiles) {
      await db.update(recurringExpenses).set({ attachFiles: true }).where(eq(recurringExpenses.id, created.id));
      created.attachFiles = true;
    }
  }

  // 처음 만들 때는 시작일이 이번 달 앞쪽이어도(계획 화면에서 지난 날짜로 만든 경우) 그날부터 깐다.
  // 지난달 이전까지는 내려가지 않는다 — 아무도 처리하지 않을 지난 카드가 쌓이고, 매주 반복이면 상한(24)을 지난 카드가 채운다.
  const monthStart = monthStartOf(today);
  const planFloor = startsOn > monthStart ? startsOn : monthStart;
  const planSync = created.planProjectId ? await syncPlansQuietly(created.id, actor.id, planFloor) : null;
  return { ...created, copiedAttachments, planSync };
}

const SCHEDULE_KEYS = ["frequency", "intervalCount", "dayOfMonth", "monthOfYear", "weekday"] as const;

export async function updateRecurringExpense(id: string, input: RecurringExpenseUpdateInput, actor: RecurringActor) {
  const existing = await requireOwnTemplate(id, actor);
  const today = todayKST();

  const merged = { ...existing, ...stripUndefined(input) };
  if (!merged.planProjectId) merged.planBrandId = null;
  const issue = recurringScheduleIssue(merged);
  if (issue) throw new AppError("VALIDATION_ERROR", issue.message);
  const configError = recurringConfigError({ ...merged, requestMode: toRequestMode(merged.requestMode) });
  if (configError) throw new AppError("VALIDATION_ERROR", configError);
  if (
    merged.planProjectId &&
    (merged.planProjectId !== existing.planProjectId ||
      merged.planBrandId !== existing.planBrandId ||
      merged.companyId !== existing.companyId)
  ) {
    await assertPlanTarget(actor, merged);
  }

  // 기준 회차(starts_on)·다음 처리일을 다시 잡는 경우:
  //  - 시작일을 직접 고름 → 그날(주기에 맞춤)이 새 기준.
  //  - 주기만 바뀜 → 옛 시작일은 새 주기의 회차가 아니다. restartAnchor 가 오늘·옛 시작 달·마지막 처리 회차를 보고 새 기준을 잡는다
  //    (입금요청 폼에서 다음 달부터로 만든 반복의 날짜를 바꿔도 한 달 건너뛰지 않고, 이번 달 처리를 마친 반복이 같은 달에 또 나가지 않게).
  //  - 멈췄다가 다시 켬 → 밀린 회차를 한꺼번에 따라잡지 않고 오늘 이후 첫 회차부터.
  const schedule = toSchedule(merged);
  const scheduleChanged = SCHEDULE_KEYS.some((k) => input[k] !== undefined && input[k] !== existing[k]);
  const startPicked = input.startsOn != null && input.startsOn !== existing.startsOn;
  const resumed = input.isActive === true && !existing.isActive;
  let startsOn = merged.startsOn;
  if (startPicked) {
    startsOn = firstMatchingOnOrAfter(schedule, input.startsOn!);
  } else if (scheduleChanged) {
    startsOn = restartAnchor({
      schedule,
      today,
      previousStartsOn: existing.startsOn,
      lastRunDate: await lastRunOccurrenceDate(id),
    });
  }
  const nextRunDate =
    startPicked || scheduleChanged || resumed
      ? firstOnOrAfterFromAnchor(schedule, startsOn ?? existing.nextRunDate, today)
      : existing.nextRunDate;
  if (merged.endsOn && startsOn && merged.endsOn < startsOn) {
    throw new AppError("VALIDATION_ERROR", "끝나는 날이 첫 회차보다 앞입니다.");
  }
  if (merged.isActive && merged.endsOn && nextRunDate > merged.endsOn && (resumed || startPicked || scheduleChanged)) {
    throw new AppError("VALIDATION_ERROR", "끝나는 날이 지났어요. 끝나는 날을 먼저 바꿔 주세요.");
  }

  const [updated] = await db
    .update(recurringExpenses)
    .set({
      ...stripUndefined(input),
      planBrandId: merged.planBrandId,
      startsOn,
      nextRunDate,
      updatedAt: new Date(),
    })
    .where(eq(recurringExpenses.id, id))
    .returning();

  // 비용계획을 쓰거나 썼던 반복만 맞춘다(끈 경우 = 안 건드린 미래 계획 정리).
  const planSync =
    updated.planProjectId || existing.planProjectId ? await syncPlansQuietly(id, actor.id) : null;
  return { ...updated, planSync };
}

function stripUndefined<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export async function deleteRecurringExpense(id: string, actor: RecurringActor) {
  const existing = await requireOwnTemplate(id, actor);

  // 먼저 멈추고 비용계획을 정리한다 — 회차 줄은 반복과 함께 지워지므로(CASCADE) 그 전에 안 건드린 미래 계획을 걷는다.
  // 손댄 계획(수정·연결·지급 완료)과 이미 생성된 입금요청은 남는다 — 지난 지출 기록이다.
  if (existing.planProjectId) {
    await db.update(recurringExpenses).set({ isActive: false }).where(eq(recurringExpenses.id, id));
    const r = await syncPlansQuietly(id, actor.id);
    if ("error" in r) {
      // 삭제를 안 했으니 멈춤도 되돌린다 — 안 그러면 '삭제 안 됨'인데 처리가 조용히 멈춘다.
      await db.update(recurringExpenses).set({ isActive: existing.isActive }).where(eq(recurringExpenses.id, id));
      throw new AppError("INTERNAL_ERROR", "비용계획 정리에 실패해 삭제하지 않았습니다. 잠시 후 다시 시도해주세요.");
    }
  }

  const files = await db
    .select({ fileKey: recurringExpenseAttachments.fileKey })
    .from(recurringExpenseAttachments)
    .where(eq(recurringExpenseAttachments.recurringExpenseId, id));
  await db.delete(recurringExpenses).where(eq(recurringExpenses.id, id));
  // 반복 첨부는 이 반복만의 사본이다(생성된 입금요청엔 다시 복사해 붙였다). 실패해도 삭제는 끝난 것.
  if (files.length > 0) {
    const { error } = await storageClient().storage.from(STORAGE_BUCKET).remove(files.map((f) => f.fileKey));
    if (error) console.error("[Recurring] 반복 첨부 파일 정리 실패:", error.message);
  }
}

// ---------------------------------------------------------------------------
// 반복 첨부(자동 제출 때 복사해 붙인다)
// ---------------------------------------------------------------------------

const MAX_TEMPLATE_ATTACHMENTS = 10;

export async function addRecurringAttachment(
  recurringId: string,
  file: File,
  documentType: string,
  actor: RecurringActor,
) {
  await requireOwnTemplate(recurringId, actor);
  await validateUploadFile(file);
  const [{ n }] = await db
    .select({ n: count() })
    .from(recurringExpenseAttachments)
    .where(eq(recurringExpenseAttachments.recurringExpenseId, recurringId));
  if (Number(n) >= MAX_TEMPLATE_ATTACHMENTS) {
    throw new AppError("VALIDATION_ERROR", `반복 첨부는 ${MAX_TEMPLATE_ATTACHMENTS}개까지입니다.`);
  }

  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileKey = `recurring/${recurringId}/${Date.now()}_${sanitizedName}`;
  const storage = storageClient().storage.from(STORAGE_BUCKET);
  const { error } = await storage.upload(fileKey, file, { contentType: file.type, upsert: false });
  if (error) {
    console.error("[Recurring] 첨부 업로드 실패:", error.message);
    throw new AppError("INTERNAL_ERROR", "파일 업로드에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
  const [row] = await db
    .insert(recurringExpenseAttachments)
    .values({
      recurringExpenseId: recurringId,
      documentType,
      fileName: file.name,
      fileKey,
      fileUrl: storage.getPublicUrl(fileKey).data.publicUrl,
      fileSize: file.size,
      mimeType: file.type,
      uploadedById: actor.id,
    })
    .returning();
  return row;
}

export async function deleteRecurringAttachment(recurringId: string, attachmentId: string, actor: RecurringActor) {
  await requireOwnTemplate(recurringId, actor);
  const [row] = await db
    .delete(recurringExpenseAttachments)
    .where(
      and(
        eq(recurringExpenseAttachments.id, attachmentId),
        eq(recurringExpenseAttachments.recurringExpenseId, recurringId),
      ),
    )
    .returning({ fileKey: recurringExpenseAttachments.fileKey });
  if (!row) throw new AppError("NOT_FOUND", "첨부를 찾을 수 없습니다.");
  const { error } = await storageClient().storage.from(STORAGE_BUCKET).remove([row.fileKey]);
  if (error) console.error("[Recurring] 첨부 파일 삭제 실패:", error.message);
}

/**
 * 방금 올린 입금요청의 첨부를 반복 첨부로 **복사**한다(입금요청 폼의 「매달 반복」). 올린 사람(또는 관리자)만.
 * 같은 파일을 가리키게 하면 그 입금요청에서 첨부를 지울 때 반복 첨부까지 깨진다.
 */
async function copyExpenseAttachmentsToTemplate(
  expenseId: string,
  recurringId: string,
  actor: RecurringActor,
): Promise<number> {
  const [expense] = await db
    .select({ submittedById: expenses.submittedById })
    .from(expenses)
    .where(eq(expenses.id, expenseId));
  if (!expense || (actor.role !== "ADMIN" && expense.submittedById !== actor.id)) return 0;

  const files = await db.select().from(attachments).where(eq(attachments.expenseId, expenseId));
  const storage = storageClient().storage.from(STORAGE_BUCKET);
  let copied = 0;
  for (const f of files.slice(0, MAX_TEMPLATE_ATTACHMENTS)) {
    const ext = f.fileKey.includes(".") ? f.fileKey.slice(f.fileKey.lastIndexOf(".")) : "";
    const newKey = `recurring/${recurringId}/${crypto.randomUUID()}${ext}`;
    const { error } = await storage.copy(f.fileKey, newKey);
    if (error) {
      console.error(`[Recurring] 첨부 복사 실패 (${f.fileName}):`, error.message);
      continue;
    }
    await db.insert(recurringExpenseAttachments).values({
      recurringExpenseId: recurringId,
      documentType: f.documentType,
      fileName: f.fileName,
      fileKey: newKey,
      fileUrl: storage.getPublicUrl(newKey).data.publicUrl,
      fileSize: f.fileSize,
      mimeType: f.mimeType,
      uploadedById: actor.id,
    });
    copied++;
  }
  return copied;
}

/**
 * 템플릿 첨부를 새 비용으로 **복사**한다.
 *
 * 같은 스토리지 파일을 가리키게 하면, 한 비용에서 첨부를 지울 때
 * deleteAttachment가 fileKey로 원본을 지워 **나머지 달의 첨부가 전부 깨진다.**
 *
 * 복사에 실패해도 비용 생성은 되돌리지 않는다 — 증빙은 나중에 붙일 수 있지만
 * 입금요청이 아예 안 올라오면 지급을 놓친다.
 */
async function copyTemplateAttachments(recurringId: string, expenseId: string, uploaderId: string): Promise<number> {
  const templates = await db
    .select()
    .from(recurringExpenseAttachments)
    .where(eq(recurringExpenseAttachments.recurringExpenseId, recurringId));
  if (templates.length === 0) return 0;

  const storage = storageClient().storage.from(STORAGE_BUCKET);
  let copied = 0;
  for (const t of templates) {
    try {
      const ext = t.fileKey.includes(".") ? t.fileKey.slice(t.fileKey.lastIndexOf(".")) : "";
      const newKey = `${expenseId}/${crypto.randomUUID()}${ext}`;
      const { error } = await storage.copy(t.fileKey, newKey);
      if (error) {
        console.error(`[Recurring] 첨부 복사 실패 (${t.fileName}):`, error.message);
        continue;
      }
      await db.insert(attachments).values({
        expenseId,
        documentType: t.documentType,
        fileName: t.fileName,
        fileKey: newKey,
        fileUrl: storage.getPublicUrl(newKey).data.publicUrl,
        fileSize: t.fileSize,
        mimeType: t.mimeType,
        uploadedById: uploaderId,
      });
      copied++;
    } catch (err) {
      console.error(`[Recurring] 첨부 복사 중 오류 (${t.fileName}):`, err);
    }
  }
  return copied;
}

// ---------------------------------------------------------------------------
// 알림 모드: 미리 채운 입금요청 폼
// ---------------------------------------------------------------------------

export interface RecurringPrefill {
  occurrenceId: string;
  occurrenceDate: string;
  recurringId: string;
  title: string;
  /** 반복에 적어 둔 금액(예상). 알림 모드에선 폼에 넣지 않고 참고로만 보여 준다. */
  expectedAmount: number;
  requestMode: RequestMode;
  category: string | null;
  bankName: string | null;
  accountHolder: string | null;
  accountNumber: string | null;
  companyId: string;
  dueDate: string | null;
  description: string | null;
  /** 이 회차에 이미 올라간 입금요청. 있으면 폼 대신 그 건으로 안내한다. */
  submittedExpenseId: string | null;
}

/** 알림 링크(/expenses/new/deposit-request?occurrence=…)로 들어왔을 때. 등록자·관리자만. */
export async function getRecurringPrefill(occurrenceId: string, actor: RecurringActor): Promise<RecurringPrefill | null> {
  const occ = await getOccurrence(occurrenceId);
  // 등록자 본인만(관리자도 대신 올리지 않는다 — reserveOccurrenceForSubmit 참고).
  if (!occ || occ.submittedById !== actor.id) return null;
  const [r] = await db.select().from(recurringExpenses).where(eq(recurringExpenses.id, occ.recurringId));
  if (!r) return null;
  return {
    occurrenceId,
    occurrenceDate: occ.occurrenceDate,
    recurringId: r.id,
    title: r.title,
    expectedAmount: r.amount,
    requestMode: toRequestMode(r.requestMode),
    category: r.category,
    bankName: r.bankName,
    accountHolder: r.accountHolder,
    accountNumber: r.accountNumber,
    companyId: r.companyId,
    dueDate: dueDateFor(occ.occurrenceDate, r.dueDateOffsetDays),
    description: r.description,
    submittedExpenseId: occ.expenseId,
  };
}

/**
 * 입금요청을 올리기 **전에** 회차를 선점한다(POST /api/expenses 의 recurringOccurrenceId).
 * 등록자 본인만 — 관리자가 대신 올리면 입금요청이 관리자 이름으로 생기고(승인 알림도 관리자에게), 등록자의 회차는
 * '이미 올림'이 되는데 그 건은 등록자가 열어 볼 수도 없다.
 * 이미 이 회차로 올라간 요청이 있거나 다른 탭에서 올리는 중이면 막는다.
 */
export async function reserveOccurrenceForSubmit(occurrenceId: string, actor: RecurringActor): Promise<void> {
  const r = await reserveOccurrence(occurrenceId, actor.id);
  if (r === "not_found") throw new AppError("NOT_FOUND", "반복 회차를 찾을 수 없습니다.");
  if (r === "taken") throw new AppError("VALIDATION_ERROR", "이 회차의 입금요청은 이미 올라갔거나 다른 화면에서 올리는 중입니다.");
}

export async function releaseOccurrenceReservation(occurrenceId: string): Promise<void> {
  await releaseReservation(occurrenceId).catch((e) => console.error("[Recurring] 회차 선점 풀기 실패:", e));
}

/** 입금요청을 올린 뒤 회차·비용계획에 붙인다. 실패해도 입금요청은 그대로(로그만). */
export async function attachSubmittedExpense(occurrenceId: string, expenseId: string, actorId: string) {
  try {
    return await attachExpenseToOccurrence(occurrenceId, expenseId, actorId);
  } catch (err) {
    console.error("[Recurring] 회차 연결 실패:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 예정일 도래 → 자동 제출 / 알림
// ---------------------------------------------------------------------------

/** 한 번에 따라잡을 최대 회차. 예정일이 한참 과거인 설정이 폭주하지 않도록. */
const MAX_CATCHUP = 12;

/**
 * 예정일이 된 반복을 처리한다. 매일 cron 이 호출한다(비용계획 맞추기 다음에 — 오늘 회차의 계획에 연결하려고).
 *
 * 밀린 회차가 있으면 따라잡는다 — cron 이 며칠 멈췄다고 그 달 지급이 통째로 사라지면 안 된다. 상한 MAX_CATCHUP.
 * 커서는 회차 하나를 처리할 때마다 저장한다. 끝에 한 번만 저장하면, 두 번째 회차에서 실패했을 때 첫 회차가
 * 다음 날 또 만들어진다.
 */
export async function generateDueRecurringExpenses() {
  const today = todayKST();

  const due = await db
    .select()
    .from(recurringExpenses)
    .where(and(eq(recurringExpenses.isActive, true), lte(recurringExpenses.nextRunDate, today)));

  const results: Array<{
    recurringId: string;
    title: string;
    mode: RequestMode;
    created: number;
    reminded: number;
    capped: boolean;
    ended?: boolean;
    error?: string;
  }> = [];

  for (const r of due) {
    const mode = toRequestMode(r.requestMode);
    const schedule = toSchedule(r);
    const res: (typeof results)[number] = { recurringId: r.id, title: r.title, mode, created: 0, reminded: 0, capped: false };
    let cursor = r.nextRunDate;
    let lastExpenseId: string | null = null;
    const remindLinks: Array<{ occurrenceId: string; date: string }> = [];

    const [owner] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, r.submittedById));
    if (!owner) {
      results.push({ ...res, error: "등록자 없음" });
      continue;
    }

    // 회차 하나씩: 처리 표시(claim) → 일 → 커서 저장. 한 회차가 실패하면 거기서 멈추고(다음 cron 이 그 회차부터),
    // 이미 끝낸 회차의 알림은 아래에서 **반드시** 보낸다 — 자동 제출됐는데 본인이 모르면 금액을 못 고친다.
    try {
      let handled = 0;
      while (cursor <= today) {
        if (r.endsOn && cursor > r.endsOn) break;
        if (handled >= MAX_CATCHUP) {
          res.capped = true;
          console.warn(
            `[Recurring] ${r.title}: 밀린 회차가 ${MAX_CATCHUP}건을 넘어 여기서 멈춥니다. 다음 예정일 ${cursor}부터 내일 이어서 처리합니다.`,
          );
          break;
        }

        const claim = await claimOccurrence(r.id, cursor);
        if (claim && mode === "AUTO") {
          let expenseId: string;
          try {
            const expense = await createExpense(
              {
                type: "DEPOSIT_REQUEST",
                title: r.title,
                description: r.description,
                amount: r.amount,
                currency: r.currency as "KRW" | "USD",
                category: r.category,
                transactionDate: cursor,
                companyId: r.companyId,
                bankName: r.bankName,
                accountHolder: r.accountHolder,
                accountNumber: r.accountNumber,
                isUrgent: false,
                isPrePaid: false,
                prePaidPercentage: null,
                dueDate: dueDateFor(cursor, r.dueDateOffsetDays),
                hasFreelancerWithholding: false,
                isPurchase: false,
              } as never,
              owner.id,
              owner.name,
              owner.email,
              r.companyId,
            );
            expenseId = expense.id;
          } catch (err) {
            // 입금요청이 안 만들어졌을 때만 처리 표시를 되돌린다(다음 cron 이 다시 시도). 커서도 그대로.
            await releaseOccurrence(claim.occurrenceId).catch((e) =>
              console.error("[Recurring] 회차 표시 되돌리기 실패:", e),
            );
            throw err;
          }
          lastExpenseId = expenseId;
          res.created++;
          // 입금요청이 생긴 뒤의 일은 실패해도 되돌리지 않는다 — 되돌리면 다음 날 같은 회차가 또 제출된다.
          // 회차에 먼저 적고(중복 방지의 근거), 첨부는 그다음. 반복 첨부가 있으면 늘 복사한다(attach_files 와 무관 —
          // 반복 화면에서 올린 첨부는 그 칸을 켜지 않는다).
          await attachSubmittedExpense(claim.occurrenceId, expenseId, owner.id);
          await copyTemplateAttachments(r.id, expenseId, owner.id).catch((e) =>
            console.error(`[Recurring] ${r.title} 첨부 복사 실패:`, e),
          );
        } else if (claim && mode === "REMIND") {
          remindLinks.push({ occurrenceId: claim.occurrenceId, date: cursor });
          res.reminded++;
        }

        handled++;
        cursor = nextRunAfter(schedule, cursor);
        await db
          .update(recurringExpenses)
          .set({
            nextRunDate: cursor,
            lastRunAt: new Date(),
            lastExpenseId: lastExpenseId ?? r.lastExpenseId,
            updatedAt: new Date(),
          })
          .where(eq(recurringExpenses.id, r.id));
      }

      // 끝나는 날을 지났으면 멈춘다(목록에서 '끝남'으로 보인다).
      if (r.endsOn && cursor > r.endsOn) {
        await db
          .update(recurringExpenses)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(recurringExpenses.id, r.id));
        res.ended = true;
      }
    } catch (err) {
      console.error(`[Recurring] ${r.title} 처리 실패:`, err);
      res.error = err instanceof Error ? err.message : "알 수 없는 오류";
    }

    await notifyOwner(r, owner.id, mode, res.created, lastExpenseId, remindLinks).catch((e) =>
      console.error(`[Recurring] ${r.title} 알림 실패:`, e),
    );
    results.push(res);
  }

  return { checked: due.length, results };
}

async function notifyOwner(
  r: typeof recurringExpenses.$inferSelect,
  ownerId: string,
  mode: RequestMode,
  created: number,
  lastExpenseId: string | null,
  remindLinks: Array<{ occurrenceId: string; date: string }>,
) {
  const label = describeSchedule(toSchedule(r));
  if (mode === "AUTO" && created > 0 && lastExpenseId) {
    // **자동으로 제출됐다는 사실을 본인이 알아야** 금액이 달라졌을 때 승인 전에 고칠 수 있다.
    const message =
      created === 1
        ? `${r.title} (${r.amount.toLocaleString("ko-KR")}원) — ${label}`
        : `${r.title} 외 ${created}건이 등록되었습니다 — ${label}`;
    await Promise.allSettled([
      createNotification({
        recipientId: ownerId,
        type: "NEW_DEPOSIT_REQUEST",
        title: "정기 입금요청이 등록되었습니다",
        message,
        relatedExpenseId: lastExpenseId,
      }),
      sendPushToUser(ownerId, "정기 입금요청이 등록되었습니다", message, `/expenses/${lastExpenseId}`),
    ]);
  }
  if (mode === "REMIND" && remindLinks.length > 0) {
    // 가장 최근 회차 하나로 안내한다(밀린 회차가 여럿이면 목록 화면에서 하나씩).
    const latest = remindLinks[remindLinks.length - 1];
    const href = `/expenses/new/deposit-request?occurrence=${latest.occurrenceId}`;
    const [, m, d] = latest.date.split("-").map(Number);
    const message =
      `${m}월 ${d}일 ${r.title} — 이번 회차 금액을 넣어 입금요청을 올려 주세요. (등록한 금액 ${r.amount.toLocaleString("ko-KR")}원)` +
      (remindLinks.length > 1 ? ` 밀린 회차 ${remindLinks.length - 1}건은 반복 지급 화면에서 올릴 수 있어요.` : "");
    await Promise.allSettled([
      createNotification({
        recipientId: ownerId,
        type: "DUE_DATE_REMINDER",
        title: "반복 지급 입금요청을 올려 주세요",
        message,
        linkUrl: href,
      }),
      sendPushToUser(ownerId, "반복 지급 입금요청을 올려 주세요", message, href),
    ]);
  }
}

/** 회차 목록(반복 지급 화면의 '이번 회차 올리기' 버튼). 처리됐지만 아직 입금요청이 없는 알림 모드 회차. */
export async function listOpenReminders(actor: RecurringActor) {
  const rows = await withPlanTx(
    async (tx) =>
      rowsOf<{ occurrence_id: string; recurring_id: string; occurrence_date: string }>(
        await tx.execute(sql`SELECT o.id AS occurrence_id, o.recurring_expense_id AS recurring_id,
                                    o.occurrence_date::text AS occurrence_date
                               FROM expenseone.recurring_occurrences o
                               JOIN expenseone.recurring_expenses r ON r.id = o.recurring_expense_id
                              WHERE r.request_mode = 'REMIND' AND o.run_at IS NOT NULL
                                AND NOT EXISTS (SELECT 1 FROM expenseone.expenses e WHERE e.id = o.expense_id)
                                AND o.occurrence_date >= (now() AT TIME ZONE 'Asia/Seoul')::date - 62
                                -- 등록자 본인 것만(관리자도) — 남의 회차를 대신 올리면 관리자 이름의 입금요청이 된다.
                                AND r.submitted_by_id = ${actor.id}::uuid
                              ORDER BY o.occurrence_date`),
      ),
    { readOnly: true },
  );
  return rows.map((r) => ({ occurrenceId: r.occurrence_id, recurringId: r.recurring_id, occurrenceDate: r.occurrence_date }));
}

