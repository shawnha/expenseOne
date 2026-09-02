import { db } from "@/lib/db";
import {
  recurringExpenses,
  recurringExpenseAttachments,
  attachments,
  companies,
  users,
} from "@/lib/db/schema";
import { and, eq, lte, asc, desc } from "drizzle-orm";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createExpense } from "@/services/expense.service";
import { createNotification } from "@/services/notification.service";
import { sendPushToUser } from "@/services/push.service";
import { AppError } from "@/services/attachment.service";
import {
  nextRunAfter,
  firstRunOnOrAfter,
  describeSchedule,
  dueDateFor,
  type Schedule,
} from "@/lib/recurring-schedule";
import type { RecurringExpenseInput } from "@/lib/validations/expense";

// ---------------------------------------------------------------------------
// 반복 입금요청 — 등록/수정과 예정일 도래 시 실제 입금요청 생성
//
// 핵심은 `nextRunDate` 하나다. cron은 이 값만 보고 고르고, 생성 직후 다음
// 값으로 민다. 그래서 같은 날 cron이 두 번 돌아도 중복 생성되지 않는다.
// ---------------------------------------------------------------------------

const STORAGE_BUCKET = "attachments";

/** KST 기준 오늘(yyyy-mm-dd). Vercel은 UTC로 돌기 때문에 직접 환산한다. */
export function todayKST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
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

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listRecurringExpenses(userId: string, isAdmin: boolean) {
  const rows = await db
    .select({
      id: recurringExpenses.id,
      title: recurringExpenses.title,
      amount: recurringExpenses.amount,
      currency: recurringExpenses.currency,
      category: recurringExpenses.category,
      accountHolder: recurringExpenses.accountHolder,
      bankName: recurringExpenses.bankName,
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
      companyName: companies.name,
      submitterName: users.name,
      submittedById: recurringExpenses.submittedById,
    })
    .from(recurringExpenses)
    .leftJoin(companies, eq(recurringExpenses.companyId, companies.id))
    .leftJoin(users, eq(recurringExpenses.submittedById, users.id))
    // 관리자는 전체를, 그 외에는 본인이 등록한 것만 본다.
    .where(isAdmin ? undefined : eq(recurringExpenses.submittedById, userId))
    .orderBy(desc(recurringExpenses.isActive), asc(recurringExpenses.nextRunDate));

  return rows.map((r) => ({
    ...r,
    scheduleLabel: describeSchedule(toSchedule(r)),
  }));
}

export async function createRecurringExpense(input: RecurringExpenseInput, userId: string) {
  const nextRunDate = firstRunOnOrAfter(toSchedule({
    frequency: input.frequency,
    intervalCount: input.intervalCount ?? 1,
    dayOfMonth: input.dayOfMonth ?? null,
    monthOfYear: input.monthOfYear ?? null,
    weekday: input.weekday ?? null,
  }), todayKST());

  const [created] = await db
    .insert(recurringExpenses)
    .values({
      title: input.title,
      description: input.description ?? null,
      amount: input.amount,
      currency: input.currency ?? "KRW",
      category: input.category,
      bankName: input.bankName,
      accountHolder: input.accountHolder,
      accountNumber: input.accountNumber,
      companyId: input.companyId,
      submittedById: userId,
      frequency: input.frequency,
      intervalCount: input.intervalCount ?? 1,
      dayOfMonth: input.dayOfMonth ?? null,
      monthOfYear: input.monthOfYear ?? null,
      weekday: input.weekday ?? null,
      dueDateOffsetDays: input.dueDateOffsetDays ?? null,
      attachFiles: input.attachFiles ?? false,
      isActive: input.isActive ?? true,
      nextRunDate,
    })
    .returning();

  return created;
}

export async function updateRecurringExpense(
  id: string,
  input: Partial<RecurringExpenseInput>,
  userId: string,
  isAdmin: boolean,
) {
  const [existing] = await db
    .select()
    .from(recurringExpenses)
    .where(eq(recurringExpenses.id, id));
  if (!existing) throw new AppError("NOT_FOUND", "반복 설정을 찾을 수 없습니다.");
  if (!isAdmin && existing.submittedById !== userId) {
    throw new AppError("FORBIDDEN", "본인이 등록한 반복 설정만 수정할 수 있습니다.");
  }

  const merged = { ...existing, ...input };
  // 주기가 바뀌면 다음 예정일도 다시 잡는다. 안 그러면 옛 주기의 날짜에 한 번 더
  // 생성되고 나서야 새 주기가 먹힌다.
  const scheduleChanged =
    input.frequency !== undefined ||
    input.intervalCount !== undefined ||
    input.dayOfMonth !== undefined ||
    input.monthOfYear !== undefined ||
    input.weekday !== undefined;

  const nextRunDate = scheduleChanged
    ? firstRunOnOrAfter(toSchedule(merged as never), todayKST())
    : existing.nextRunDate;

  const [updated] = await db
    .update(recurringExpenses)
    .set({
      ...input,
      description: input.description ?? existing.description,
      nextRunDate,
      updatedAt: new Date(),
    })
    .where(eq(recurringExpenses.id, id))
    .returning();

  return updated;
}

export async function deleteRecurringExpense(id: string, userId: string, isAdmin: boolean) {
  const [existing] = await db
    .select({ submittedById: recurringExpenses.submittedById })
    .from(recurringExpenses)
    .where(eq(recurringExpenses.id, id));
  if (!existing) throw new AppError("NOT_FOUND", "반복 설정을 찾을 수 없습니다.");
  if (!isAdmin && existing.submittedById !== userId) {
    throw new AppError("FORBIDDEN", "본인이 등록한 반복 설정만 삭제할 수 있습니다.");
  }
  // 이미 생성된 입금요청은 건드리지 않는다 — 지난 지출 기록이다.
  await db.delete(recurringExpenses).where(eq(recurringExpenses.id, id));
}

// ---------------------------------------------------------------------------
// 예정일 도래 → 실제 입금요청 생성
// ---------------------------------------------------------------------------

/**
 * 템플릿 첨부를 새 비용으로 **복사**한다.
 *
 * 같은 스토리지 파일을 가리키게 하면, 한 비용에서 첨부를 지울 때
 * deleteAttachment가 fileKey로 원본을 지워 **나머지 달의 첨부가 전부 깨진다.**
 * 복사해두면 각 비용이 독립적이라 그 규칙을 계속 신경 쓸 필요가 없다.
 *
 * 복사에 실패해도 비용 생성은 되돌리지 않는다 — 증빙은 나중에 붙일 수 있지만
 * 입금요청이 아예 안 올라오면 지급을 놓친다.
 */
async function copyTemplateAttachments(
  recurringId: string,
  expenseId: string,
  uploaderId: string,
): Promise<number> {
  const templates = await db
    .select()
    .from(recurringExpenseAttachments)
    .where(eq(recurringExpenseAttachments.recurringExpenseId, recurringId));
  if (templates.length === 0) return 0;

  // 서비스 롤 클라이언트 — Storage 작업은 RLS를 우회해야 한다(attachment.service와 동일).
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  let copied = 0;
  for (const t of templates) {
    try {
      const ext = t.fileKey.includes(".") ? t.fileKey.slice(t.fileKey.lastIndexOf(".")) : "";
      const newKey = `${expenseId}/${crypto.randomUUID()}${ext}`;
      const { error } = await supabase.storage.from(STORAGE_BUCKET).copy(t.fileKey, newKey);
      if (error) {
        console.error(`[Recurring] 첨부 복사 실패 (${t.fileName}):`, error.message);
        continue;
      }
      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(newKey);
      await db.insert(attachments).values({
        expenseId,
        documentType: t.documentType,
        fileName: t.fileName,
        fileKey: newKey,
        fileUrl: data.publicUrl,
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

/** 한 번에 따라잡을 최대 회차. 예정일이 한참 과거인 설정이 폭주하지 않도록. */
const MAX_CATCHUP = 12;

/**
 * 예정일이 된 반복 설정을 실제 입금요청으로 만든다. 매일 cron이 호출한다.
 *
 * 밀린 회차가 있으면 따라잡는다 — cron이 며칠 멈췄다고 그 달 지급이 통째로
 * 사라지면 안 된다. 다만 MAX_CATCHUP으로 상한을 둔다.
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
    created: number;
    capped: boolean;
    error?: string;
  }> = [];

  for (const r of due) {
    let created = 0;
    let cursor = r.nextRunDate;
    let capped = false;
    let lastExpenseId: string | null = null;

    const [owner] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, r.submittedById));
    if (!owner) {
      results.push({ recurringId: r.id, title: r.title, created: 0, capped: false, error: "등록자 없음" });
      continue;
    }

    try {
      while (cursor <= today) {
        if (created >= MAX_CATCHUP) {
          capped = true;
          console.warn(
            `[Recurring] ${r.title}: 밀린 회차가 ${MAX_CATCHUP}건을 넘어 여기서 멈춥니다. ` +
              `다음 예정일 ${cursor}부터 내일 이어서 생성됩니다.`,
          );
          break;
        }

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

        if (r.attachFiles) {
          await copyTemplateAttachments(r.id, expense.id, owner.id);
        }

        lastExpenseId = expense.id;
        created++;
        cursor = nextRunAfter(toSchedule(r), cursor);
      }

      await db
        .update(recurringExpenses)
        .set({
          nextRunDate: cursor,
          lastRunAt: created > 0 ? new Date() : r.lastRunAt,
          lastExpenseId: lastExpenseId ?? r.lastExpenseId,
          updatedAt: new Date(),
        })
        .where(eq(recurringExpenses.id, r.id));

      // 등록자에게 알림. **자동으로 제출됐다는 사실을 본인이 알아야** 금액이
      // 달라졌을 때 승인 전에 고칠 수 있다.
      if (created > 0 && lastExpenseId) {
        const label = describeSchedule(toSchedule(r));
        const message =
          created === 1
            ? `${r.title} (${r.amount.toLocaleString("ko-KR")}원) — ${label}`
            : `${r.title} 외 ${created}건이 등록되었습니다 — ${label}`;
        await Promise.allSettled([
          createNotification({
            recipientId: owner.id,
            type: "NEW_DEPOSIT_REQUEST",
            title: "정기 입금요청이 등록되었습니다",
            message,
            relatedExpenseId: lastExpenseId,
          }),
          sendPushToUser(
            owner.id,
            "정기 입금요청이 등록되었습니다",
            message,
            `/expenses/${lastExpenseId}`,
          ),
        ]);
      }

      results.push({ recurringId: r.id, title: r.title, created, capped });
    } catch (err) {
      console.error(`[Recurring] ${r.title} 생성 실패:`, err);
      results.push({
        recurringId: r.id,
        title: r.title,
        created,
        capped,
        error: err instanceof Error ? err.message : "알 수 없는 오류",
      });
    }
  }

  return { checked: due.length, results };
}
