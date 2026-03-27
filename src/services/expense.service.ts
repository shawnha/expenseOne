import { db } from "@/lib/db";
import {
  expenses,
  attachments,
  users,
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
import { notifySlackCorporateCard } from "./slack.service";
import { sendPushToAdmins } from "./push.service";
import { AppError } from "./attachment.service";

// ---------------------------------------------------------------------------
// createExpense
// ---------------------------------------------------------------------------
export async function createExpense(
  input: CreateExpenseInput,
  userId: string,
  userName: string,
  userEmail: string,
) {
  const isCorporateCard = input.type === "CORPORATE_CARD";

  type NewExpense = typeof expenses.$inferInsert;

  const baseData: Partial<NewExpense> = {
    type: input.type,
    status: isCorporateCard ? "APPROVED" : "SUBMITTED",
    title: input.title,
    description: input.description ?? null,
    amount: input.amount,
    category: input.category,
    transactionDate: input.transactionDate,
    submittedById: userId,
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
  }

  const [expense] = await db
    .insert(expenses)
    .values(baseData as NewExpense)
    .returning();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (isCorporateCard) {
    // Slack notification for corporate card (fire-and-forget)
    notifySlackCorporateCard({
      submitterEmail: userEmail,
      submitterName: userName,
      title: expense.title,
      amount: expense.amount,
      category: expense.category,
      expenseUrl: `${appUrl}/expenses/${expense.id}`,
    }).catch((err) => {
      console.error("Failed to send corporate card Slack notification:", err);
    });

    // Push notification to admins for corporate card (fire-and-forget)
    sendPushToAdmins(
      "새 법카사용",
      `${expense.title} - ${expense.amount.toLocaleString()}원`,
      `${appUrl}/expenses/${expense.id}`,
    ).catch((err) => {
      console.error("[Push] 법카사용 알림 실패:", err);
    });
  } else {
    // Notify all ADMINs for deposit requests (best-effort)
    notifyNewDepositRequest(expense.id, expense.title, userName, {
      amount: expense.amount,
      category: expense.category,
      submitterEmail: userEmail,
    }).catch((err) => {
      console.error("Failed to send new deposit request notification:", err);
    });
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
      })
      .from(expenses)
      .leftJoin(users, eq(expenses.submittedById, users.id))
      .leftJoin(attachmentCountSq, eq(expenses.id, attachmentCountSq.expenseId))
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
) {
  // 1. Fetch existing expense
  const [expense] = await db
    .select()
    .from(expenses)
    .where(eq(expenses.id, expenseId));

  if (!expense) {
    throw new AppError("NOT_FOUND", "비용을 찾을 수 없습니다.");
  }

  // 2. Only the submitter can update
  if (expense.submittedById !== userId) {
    throw new AppError("FORBIDDEN", "본인이 제출한 비용만 수정할 수 있습니다.");
  }

  // 3. Check update eligibility — both types editable in SUBMITTED or APPROVED
  if (expense.status !== "SUBMITTED" && expense.status !== "APPROVED") {
    throw new AppError(
      "FORBIDDEN",
      "제출 또는 승인 상태의 비용만 수정할 수 있습니다.",
    );
  }

  // 4. Update -- include ownership + eligibility checks in the WHERE clause
  //    to guard against concurrent state changes (TOCTOU).
  const updateConditions = [
    eq(expenses.id, expenseId),
    eq(expenses.submittedById, userId),
  ];

  updateConditions.push(
    or(
      eq(expenses.status, "SUBMITTED"),
      eq(expenses.status, "APPROVED"),
    )!,
  );

  // If an approved deposit request is edited, reset status to SUBMITTED (needs re-approval)
  const wasApproved = expense.type === "DEPOSIT_REQUEST" && expense.status === "APPROVED";

  const [updated] = await db
    .update(expenses)
    .set({
      ...input,
      updatedAt: new Date(),
      ...(wasApproved
        ? { status: "SUBMITTED" as const, approvedById: null, approvedAt: null }
        : {}),
    })
    .where(and(...updateConditions))
    .returning();

  if (!updated) {
    throw new AppError(
      "FORBIDDEN",
      "비용 상태가 변경되었습니다. 페이지를 새로고침해주세요.",
    );
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
