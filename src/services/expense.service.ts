import { db } from "@/lib/db";
import {
  expenses,
  attachments,
  users,
  companies,
  type Expense,
} from "@/lib/db/schema";
import {
  eq,
  and,
  or,
  desc,
  asc,
  gte,
  lte,
  ilike,
  count,
  sum,
  sql,
} from "drizzle-orm";
import type {
  CreateExpenseInput,
  UpdateExpenseInput,
  ExpenseQueryInput,
} from "@/lib/validations/expense";
import {
  notifyExpenseApproved,
  notifyExpenseRejected,
  notifyNewDepositRequest,
} from "./notification.service";
import { notifySlackCorporateCard, notifySlackDepositRequest, updateSlackExpenseMessage } from "./slack.service";
import { sendPushToAdmins } from "./push.service";
import { AppError } from "./attachment.service";
import { getExchangeRate, convertToKRW } from "./exchange-rate.service";
import { formatExpenseAmount } from "@/lib/utils/expense-utils";

// ---------------------------------------------------------------------------
// createExpense
// ---------------------------------------------------------------------------
export async function createExpense(
  input: CreateExpenseInput,
  userId: string,
  userName: string,
  userEmail: string,
  userCompanyId?: string | null,
) {
  const isCorporateCard = input.type === "CORPORATE_CARD";
  // 코리아 소속은 다른 회사(리테일, HOI) 비용 제출 가능
  // 그 외 소속은 자기 회사만 허용
  let companyId = userCompanyId;
  if (input.companyId && input.companyId !== userCompanyId) {
    // 코리아 소속만 다른 회사 선택 허용 — slug 조회 없이 DB에서 확인
    const [userCompany] = await db
      .select({ slug: companies.slug })
      .from(companies)
      .where(eq(companies.id, userCompanyId ?? ""));
    if (userCompany?.slug === "korea") {
      companyId = input.companyId;
    }
    // 코리아 아니면 무시하고 유저 프로필 회사 사용
  }

  if (!companyId) {
    throw new AppError("VALIDATION_ERROR", "회사가 지정되지 않았습니다. 설정에서 회사를 선택해주세요.");
  }

  // Look up the company's currency for USD conversion
  const [companyRow] = await db
    .select({ currency: companies.currency })
    .from(companies)
    .where(eq(companies.id, companyId));

  const companyCurrency = companyRow?.currency ?? "KRW";

  let finalAmount = input.amount;
  let amountOriginal: number | null = null;
  let exchangeRate: string | null = null;
  let currency = "KRW";

  // USD conversion: check user's submitted currency first, fallback to company currency
  const isUSD = input.currency === "USD" || (input.currency == null && companyCurrency === "USD");
  if (isUSD) {
    const rateResult = await getExchangeRate("USD", input.transactionDate);
    if (!rateResult) {
      throw new AppError("VALIDATION_ERROR", "환율 정보를 조회할 수 없습니다. 잠시 후 다시 시도해주세요.");
    }
    finalAmount = convertToKRW(input.amount, rateResult.rate);
    amountOriginal = input.amount; // cents from the form
    exchangeRate = String(rateResult.rate);
    currency = "USD";
  }

  type NewExpense = typeof expenses.$inferInsert;

  const baseData: Partial<NewExpense> = {
    type: input.type,
    status: isCorporateCard ? "APPROVED" : "SUBMITTED",
    title: input.title,
    description: input.description ?? null,
    amount: finalAmount,
    currency,
    amountOriginal,
    exchangeRate,
    category: input.category,
    transactionDate: input.transactionDate,
    submittedById: userId,
    companyId,
  };

  if (isCorporateCard) {
    baseData.merchantName = input.merchantName || null;
    baseData.isUrgent = input.isUrgent ?? false;
    // Auto-approve corporate card
    baseData.approvedAt = new Date();
    // Get card last four from user profile
    const [userProfile] = await db
      .select({ cardLastFour: users.cardLastFour })
      .from(users)
      .where(eq(users.id, userId));
    if (userProfile?.cardLastFour) {
      baseData.cardLastFour = userProfile.cardLastFour;
    }
  } else {
    baseData.bankName = input.bankName;
    baseData.accountHolder = input.accountHolder;
    baseData.accountNumber = input.accountNumber;
    baseData.isUrgent = input.isUrgent ?? false;
    baseData.isPrePaid = input.isPrePaid ?? false;
    baseData.prePaidPercentage = input.prePaidPercentage ?? null;
    baseData.dueDate = input.dueDate ?? null;
  }

  const [expense] = await db
    .insert(expenses)
    .values(baseData as NewExpense)
    .returning();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Await notifications to prevent Vercel serverless from killing them
  // Save Slack message ts for future updates
  if (isCorporateCard) {
    const [slackResult] = await Promise.allSettled([
      notifySlackCorporateCard({
        submitterEmail: userEmail,
        submitterName: userName,
        title: expense.title,
        amount: expense.amount,
        category: expense.category,
        expenseUrl: `${appUrl}/expenses/${expense.id}`,
        companyId: companyId ?? undefined,
        currency: expense.currency,
        amountOriginal: expense.amountOriginal,
        merchantName: expense.merchantName,
        description: expense.description,
      }),
      sendPushToAdmins(
        "새 법카사용",
        `${expense.title} - ${formatExpenseAmount(expense.amount, expense.currency, expense.amountOriginal)}`,
        `${appUrl}/expenses/${expense.id}`,
      ).catch((err) => {
        console.error("[Push] 법카사용 알림 실패:", err);
      }),
    ]);
    // Save Slack message ts
    if (slackResult.status === "fulfilled" && slackResult.value) {
      await db.update(expenses).set({
        slackMessageTs: slackResult.value.ts,
        slackChannelId: slackResult.value.channel,
      }).where(eq(expenses.id, expense.id)).catch(() => {});
    }
  } else {
    const [, slackResult] = await Promise.allSettled([
      notifyNewDepositRequest(expense.id, expense.title, userName, {
        amount: expense.amount,
        category: expense.category,
        submitterEmail: userEmail,
        companyId: companyId,
        isUrgent: expense.isUrgent ?? false,
        currency: expense.currency,
        amountOriginal: expense.amountOriginal,
      }).catch((err) => {
        console.error("Failed to send new deposit request notification:", err);
      }),
      notifySlackDepositRequest({
        submitterEmail: userEmail,
        submitterName: userName,
        title: expense.title,
        amount: expense.amount,
        category: expense.category,
        expenseUrl: `${appUrl}/expenses/${expense.id}`,
        companyId: companyId ?? undefined,
        currency: expense.currency,
        amountOriginal: expense.amountOriginal,
        dueDate: expense.dueDate,
        isUrgent: expense.isUrgent ?? false,
        description: expense.description,
      }),
    ]);
    // Save Slack message ts
    if (slackResult.status === "fulfilled" && slackResult.value) {
      await db.update(expenses).set({
        slackMessageTs: slackResult.value.ts,
        slackChannelId: slackResult.value.channel,
      }).where(eq(expenses.id, expense.id)).catch(() => {});
    }
  }

  return expense;
}

// ---------------------------------------------------------------------------
// getExpenses -- list with filters, sort, pagination
// ---------------------------------------------------------------------------
export async function getExpenses(
  query: ExpenseQueryInput,
  userId: string,
  userRole: "MEMBER" | "ADMIN",
  ownOnly: boolean = true,
) {
  const { page, limit } = query;
  const offset = (page - 1) * limit;

  // Build WHERE conditions
  const conditions: ReturnType<typeof eq>[] = [];

  // MEMBER always sees own expenses; ADMIN sees own when ownOnly is true
  if (userRole === "MEMBER" || ownOnly) {
    conditions.push(eq(expenses.submittedById, userId));
  }

  if (query.type) {
    conditions.push(eq(expenses.type, query.type));
  }
  if (query.status) {
    conditions.push(eq(expenses.status, query.status));
  }
  if (query.category) {
    conditions.push(eq(expenses.category, query.category));
  }
  if (query.startDate) {
    conditions.push(gte(expenses.transactionDate, query.startDate));
  }
  if (query.endDate) {
    conditions.push(lte(expenses.transactionDate, query.endDate));
  }
  if (query.search) {
    const escaped = query.search.replace(/[%_\\]/g, "\\$&");
    const searchTerm = `%${escaped}%`;
    conditions.push(
      or(
        ilike(expenses.title, searchTerm),
        ilike(expenses.merchantName, searchTerm),
      )!,
    );
  }
  if (query.company) {
    const { getCompanyBySlug } = await import("@/services/company.service");
    const company = await getCompanyBySlug(query.company);
    if (company) {
      conditions.push(eq(expenses.companyId, company.id));
    }
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  // Build ORDER BY
  const sortColumn = query.sortBy ?? "createdAt";
  const sortDir = query.sortOrder ?? "desc";

  const orderByMap = {
    createdAt: expenses.createdAt,
    amount: expenses.amount,
    status: expenses.status,
  } as const;

  const orderColumn = orderByMap[sortColumn] ?? expenses.createdAt;
  const orderFn = sortDir === "asc" ? asc : desc;

  // Subquery for attachment count per expense
  const attachmentCountSq = db
    .select({
      expenseId: attachments.expenseId,
      attachmentCount: count().as("attachment_count"),
    })
    .from(attachments)
    .groupBy(attachments.expenseId)
    .as("att_count");

  // Execute queries in parallel
  const [items, totalResult, amountResult] = await Promise.all([
    db
      .select({
        expense: expenses,
        submitter: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
        attachmentCount: attachmentCountSq.attachmentCount,
        companyName: companies.name,
        companySlug: companies.slug,
      })
      .from(expenses)
      .leftJoin(users, eq(expenses.submittedById, users.id))
      .leftJoin(attachmentCountSq, eq(expenses.id, attachmentCountSq.expenseId))
      .leftJoin(companies, eq(expenses.companyId, companies.id))
      .where(whereClause)
      .orderBy(orderFn(orderColumn))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(expenses).where(whereClause),
    db.select({ totalAmount: sum(expenses.amount) }).from(expenses).where(whereClause),
  ]);

  const total = totalResult[0]?.count ?? 0;
  const totalAmount = Number(amountResult[0]?.totalAmount ?? 0);

  return {
    data: items.map((row) => ({
      ...row.expense,
      submitter: row.submitter,
      attachmentCount: Number(row.attachmentCount ?? 0),
      companyName: row.companyName ?? null,
      companySlug: row.companySlug ?? null,
    })),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      totalAmount,
    },
  };
}

// ---------------------------------------------------------------------------
// getExpenseById -- detail with attachments
// ---------------------------------------------------------------------------
export async function getExpenseById(
  expenseId: string,
  userId: string,
  userRole: "MEMBER" | "ADMIN",
) {
  const [result] = await db
    .select({
      expense: expenses,
      submitter: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(expenses)
    .leftJoin(users, eq(expenses.submittedById, users.id))
    .where(eq(expenses.id, expenseId));

  if (!result) {
    throw new AppError("NOT_FOUND", "비용을 찾을 수 없습니다.");
  }

  // MEMBER can only view their own expenses
  if (userRole === "MEMBER" && result.expense.submittedById !== userId) {
    throw new AppError("FORBIDDEN", "본인의 비용만 조회할 수 있습니다.");
  }

  // Fetch attachments
  const expenseAttachments = await db
    .select()
    .from(attachments)
    .where(eq(attachments.expenseId, expenseId));

  return {
    ...result.expense,
    submitter: result.submitter,
    attachments: expenseAttachments,
  };
}

// ---------------------------------------------------------------------------
// updateExpense
// ---------------------------------------------------------------------------
export async function updateExpense(
  expenseId: string,
  input: UpdateExpenseInput,
  userId: string,
  userRole?: "MEMBER" | "ADMIN",
) {
  const isAdmin = userRole === "ADMIN";

  // 1. Fetch existing expense
  const [expense] = await db
    .select()
    .from(expenses)
    .where(eq(expenses.id, expenseId));

  if (!expense) {
    throw new AppError("NOT_FOUND", "비용을 찾을 수 없습니다.");
  }

  // 2. Only the submitter can update (admins can edit any expense)
  if (!isAdmin && expense.submittedById !== userId) {
    throw new AppError("FORBIDDEN", "본인이 제출한 비용만 수정할 수 있습니다.");
  }

  // 3. Check update eligibility — admins can edit any status
  if (!isAdmin && expense.status !== "SUBMITTED" && expense.status !== "APPROVED") {
    throw new AppError(
      "FORBIDDEN",
      "제출 또는 승인 상태의 비용만 수정할 수 있습니다.",
    );
  }

  // 4. Update -- include ownership + eligibility checks in the WHERE clause
  //    to guard against concurrent state changes (TOCTOU).
  const updateConditions = [
    eq(expenses.id, expenseId),
  ];

  // Non-admin: enforce ownership and status constraints
  if (!isAdmin) {
    updateConditions.push(eq(expenses.submittedById, userId));
    updateConditions.push(
      or(
        eq(expenses.status, "SUBMITTED"),
        eq(expenses.status, "APPROVED"),
      )!,
    );
  }

  // Build the update set
  const { status: inputStatus, ...restInput } = input;

  // If an approved deposit request is edited by a non-admin, reset status to SUBMITTED (needs re-approval)
  const wasApproved = expense.type === "DEPOSIT_REQUEST" && expense.status === "APPROVED";

  const updateSet: Record<string, unknown> = {
    ...restInput,
    updatedAt: new Date(),
  };

  // Admin can explicitly set status
  if (inputStatus && isAdmin) {
    updateSet.status = inputStatus;
  } else if (wasApproved && !isAdmin) {
    updateSet.status = "SUBMITTED";
    updateSet.approvedById = null;
    updateSet.approvedAt = null;
  }

  const [updated] = await db
    .update(expenses)
    .set(updateSet)
    .where(and(...updateConditions))
    .returning();

  if (!updated) {
    throw new AppError(
      "FORBIDDEN",
      "비용 상태가 변경되었습니다. 페이지를 새로고침해주세요.",
    );
  }

  // Update Slack message if we have the ts
  if (updated.slackMessageTs && updated.slackChannelId) {
    // Look up submitter info
    const [submitter] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, updated.submittedById));

    if (submitter) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      updateSlackExpenseMessage({
        slackMessageTs: updated.slackMessageTs,
        slackChannelId: updated.slackChannelId,
        submitterEmail: submitter.email,
        submitterName: submitter.name,
        type: updated.type as "CORPORATE_CARD" | "DEPOSIT_REQUEST",
        title: updated.title,
        amount: updated.amount,
        category: updated.category,
        expenseUrl: `${appUrl}/expenses/${updated.id}`,
        companyId: updated.companyId,
        currency: updated.currency,
        amountOriginal: updated.amountOriginal,
        merchantName: updated.merchantName,
        description: updated.description,
        dueDate: updated.dueDate,
        isUrgent: updated.isUrgent,
      }).catch((err) => console.error("[Slack] 메시지 수정 실패:", err));
    }
  }

  return updated;
}

// ---------------------------------------------------------------------------
// deleteExpense
// ---------------------------------------------------------------------------
export async function deleteExpense(
  expenseId: string,
  userId: string,
  userRole: "MEMBER" | "ADMIN" = "MEMBER",
) {
  const [expense] = await db
    .select()
    .from(expenses)
    .where(eq(expenses.id, expenseId));

  if (!expense) {
    throw new AppError("NOT_FOUND", "비용을 찾을 수 없습니다.");
  }

  const isAdmin = userRole === "ADMIN";

  if (!isAdmin && expense.submittedById !== userId) {
    throw new AppError("FORBIDDEN", "본인이 제출한 비용만 삭제할 수 있습니다.");
  }

  if (expense.status !== "SUBMITTED" && expense.status !== "CANCELLED" && expense.status !== "APPROVED") {
    throw new AppError(
      "FORBIDDEN",
      "삭제할 수 없는 상태입니다.",
    );
  }

  // Cascade will handle attachments in DB; also clean up storage
  const expenseAttachments = await db
    .select()
    .from(attachments)
    .where(eq(attachments.expenseId, expenseId));

  // Delete from storage (best-effort)
  if (expenseAttachments.length > 0) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const fileKeys = expenseAttachments.map((a) => a.fileKey);
    await supabase.storage.from("attachments").remove(fileKeys);
  }

  const deleteConditions = [eq(expenses.id, expenseId)];
  if (!isAdmin) {
    deleteConditions.push(eq(expenses.submittedById, userId));
  }

  const [deleted] = await db
    .delete(expenses)
    .where(and(...deleteConditions))
    .returning();

  if (!deleted) {
    throw new AppError(
      "FORBIDDEN",
      "비용 상태가 변경되었습니다. 페이지를 새로고침해주세요.",
    );
  }

  return deleted;
}

// ---------------------------------------------------------------------------
// cancelExpense
// ---------------------------------------------------------------------------
export async function cancelExpense(expenseId: string, userId: string) {
  const [expense] = await db
    .select()
    .from(expenses)
    .where(eq(expenses.id, expenseId));

  if (!expense) {
    throw new AppError("NOT_FOUND", "비용을 찾을 수 없습니다.");
  }

  if (expense.submittedById !== userId) {
    throw new AppError("FORBIDDEN", "본인이 제출한 비용만 취소할 수 있습니다.");
  }

  if (expense.status !== "SUBMITTED" && expense.status !== "APPROVED") {
    throw new AppError("FORBIDDEN", "취소할 수 없는 상태입니다.");
  }

  const [updated] = await db
    .update(expenses)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(
      and(
        eq(expenses.id, expenseId),
        eq(expenses.submittedById, userId),
        or(
          eq(expenses.status, "SUBMITTED"),
          eq(expenses.status, "APPROVED"),
        ),
      ),
    )
    .returning();

  if (!updated) {
    throw new AppError("FORBIDDEN", "비용 상태가 변경되었습니다. 페이지를 새로고침해주세요.");
  }

  return updated;
}

// ---------------------------------------------------------------------------
// approveExpense -- ADMIN only
// ---------------------------------------------------------------------------
export async function approveExpense(
  expenseId: string,
  adminId: string,
) {
  const [expense] = await db
    .select()
    .from(expenses)
    .where(eq(expenses.id, expenseId));

  if (!expense) {
    throw new AppError("NOT_FOUND", "비용을 찾을 수 없습니다.");
  }

  if (expense.type !== "DEPOSIT_REQUEST") {
    throw new AppError(
      "FORBIDDEN",
      "입금요청만 승인할 수 있습니다.",
    );
  }

  if (expense.status !== "SUBMITTED") {
    throw new AppError(
      "FORBIDDEN",
      "SUBMITTED 상태의 입금요청만 승인할 수 있습니다.",
    );
  }

  // Use WHERE with status check to prevent race conditions (TOCTOU).
  // If another admin has already approved/rejected, this will return no rows.
  const [updated] = await db
    .update(expenses)
    .set({
      status: "APPROVED",
      approvedById: adminId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(expenses.id, expenseId),
        eq(expenses.status, "SUBMITTED"),
      ),
    )
    .returning();

  if (!updated) {
    throw new AppError(
      "FORBIDDEN",
      "이미 처리된 요청입니다. 페이지를 새로고침해주세요.",
    );
  }

  // Look up names and emails for Slack mention
  const [adminUser, submitterUser] = await Promise.all([
    db.select({ name: users.name }).from(users).where(eq(users.id, adminId)),
    db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, expense.submittedById)),
  ]);

  // Send notification to the submitter
  await notifyExpenseApproved(
    expense.submittedById,
    expense.id,
    expense.title,
    {
      amount: expense.amount,
      approverName: adminUser[0]?.name ?? "관리자",
      submitterName: submitterUser[0]?.name ?? "요청자",
      submitterEmail: submitterUser[0]?.email ?? "",
      companyId: expense.companyId,
      accountHolder: expense.accountHolder,
      isUrgent: expense.isUrgent,
      dueDate: expense.dueDate,
      description: expense.description,
    },
  );

  return updated;
}

// ---------------------------------------------------------------------------
// rejectExpense -- ADMIN only
// ---------------------------------------------------------------------------
export async function rejectExpense(
  expenseId: string,
  adminId: string,
  rejectionReason: string,
) {
  const [expense] = await db
    .select()
    .from(expenses)
    .where(eq(expenses.id, expenseId));

  if (!expense) {
    throw new AppError("NOT_FOUND", "비용을 찾을 수 없습니다.");
  }

  if (expense.type !== "DEPOSIT_REQUEST") {
    throw new AppError(
      "FORBIDDEN",
      "입금요청만 반려할 수 있습니다.",
    );
  }

  if (expense.status !== "SUBMITTED") {
    throw new AppError(
      "FORBIDDEN",
      "SUBMITTED 상태의 입금요청만 반려할 수 있습니다.",
    );
  }

  // Use WHERE with status check to prevent race conditions (TOCTOU).
  const [updated] = await db
    .update(expenses)
    .set({
      status: "REJECTED",
      rejectionReason,
      approvedById: adminId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(expenses.id, expenseId),
        eq(expenses.status, "SUBMITTED"),
      ),
    )
    .returning();

  if (!updated) {
    throw new AppError(
      "FORBIDDEN",
      "이미 처리된 요청입니다. 페이지를 새로고침해주세요.",
    );
  }

  // Look up names and emails for Slack mention
  const [adminUser, submitterUser] = await Promise.all([
    db.select({ name: users.name }).from(users).where(eq(users.id, adminId)),
    db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, expense.submittedById)),
  ]);

  // Send notification to the submitter
  await notifyExpenseRejected(
    expense.submittedById,
    expense.id,
    expense.title,
    rejectionReason,
    {
      amount: expense.amount,
      rejecterName: adminUser[0]?.name ?? "관리자",
      submitterName: submitterUser[0]?.name ?? "요청자",
      submitterEmail: submitterUser[0]?.email ?? "",
    },
  );

  return updated;
}
