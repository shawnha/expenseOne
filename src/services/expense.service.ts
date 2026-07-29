import { db } from "@/lib/db";
import {
  expenses,
  attachments,
  users,
  companies,
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
  exists,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";
import type {
  CreateExpenseInput,
  RefundSubmitInput,
  UpdateExpenseInput,
  ExpenseQueryInput,
} from "@/lib/validations/expense";
import { signedAmount } from "@/lib/db/amount";
import {
  notifyExpenseApproved,
  notifyExpenseRejected,
  notifyNewDepositRequest,
  notifyApprovalReverted,
} from "./notification.service";
import { notifySlackCorporateCard, notifySlackDepositRequest, notifySlackRefund, updateSlackExpenseMessage, deleteSlackExpenseMessage } from "./slack.service";
import { sendPushToAdmins } from "./push.service";
import { AppError } from "./attachment.service";
import { getExchangeRate, convertToKRW } from "./exchange-rate.service";
import { formatExpenseAmount } from "@/lib/utils/expense-utils";

// ---------------------------------------------------------------------------
// createExpense
// ---------------------------------------------------------------------------
export async function createExpense(
  // 반품(REFUND)은 createRefund에서 별도 처리 — 여기서는 제외
  input: Exclude<CreateExpenseInput, { type: "REFUND" }>,
  userId: string,
  userName: string,
  userEmail: string,
  userCompanyId?: string | null,
) {
  const isCorporateCard = input.type === "CORPORATE_CARD";
  // 폼에서 고른 회사를 그대로 사용한다. 소속과 비용 귀속 법인이 다른 경우가
  // 실제로 존재하므로(코리아가 리테일/HOI 업무를 대행하는 등) 소속으로 제한하지
  // 않는다. 수정(updateExpense) 경로도 companyId를 그대로 통과시키므로 등록/수정
  // 동작이 일치한다. 다만 존재하지 않거나 비활성인 회사는 거부한다 — 예전처럼
  // 조용히 프로필 회사로 덮어쓰면 제출자가 잘못된 법인에 기록된 걸 알 수 없다.
  let companyId = userCompanyId;
  if (input.companyId && input.companyId !== userCompanyId) {
    const [selected] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(
        and(eq(companies.id, input.companyId), eq(companies.isActive, true)),
      );
    if (!selected) {
      throw new AppError("VALIDATION_ERROR", "선택한 회사를 찾을 수 없습니다.");
    }
    companyId = selected.id;
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
    hasFreelancerWithholding: input.hasFreelancerWithholding ?? false,
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
    // Save Slack message ts (primary + mirror)
    if (slackResult.status === "fulfilled" && slackResult.value) {
      await db.update(expenses).set({
        slackMessageTs: slackResult.value.primary?.ts ?? null,
        slackChannelId: slackResult.value.primary?.channel ?? null,
        mirrorSlackMessageTs: slackResult.value.mirror?.ts ?? null,
        mirrorSlackChannelId: slackResult.value.mirror?.channel ?? null,
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
        isPrePaid: expense.isPrePaid ?? false,
        prePaidPercentage: expense.prePaidPercentage,
        description: expense.description,
      }),
    ]);
    // Save Slack message ts (primary + mirror)
    if (slackResult.status === "fulfilled" && slackResult.value) {
      await db.update(expenses).set({
        slackMessageTs: slackResult.value.primary?.ts ?? null,
        slackChannelId: slackResult.value.primary?.channel ?? null,
        mirrorSlackMessageTs: slackResult.value.mirror?.ts ?? null,
        mirrorSlackChannelId: slackResult.value.mirror?.channel ?? null,
      }).where(eq(expenses.id, expense.id)).catch(() => {});
    }
  }

  return expense;
}

// ---------------------------------------------------------------------------
// createRefund -- 반품/환불 등록
//   회사·카테고리·통화·환율·가맹점은 원거래에서 상속.
//   이미 일어난 사실의 기록이므로 즉시 APPROVED (법카사용과 동일).
// ---------------------------------------------------------------------------
export async function createRefund(
  input: RefundSubmitInput,
  userId: string,
  userRole: "MEMBER" | "ADMIN",
  userName: string,
  userEmail: string,
) {
  // 1. 원거래 조회
  const [original] = await db
    .select()
    .from(expenses)
    .where(eq(expenses.id, input.originalExpenseId));

  if (!original) {
    throw new AppError("NOT_FOUND", "원거래를 찾을 수 없습니다.");
  }
  if (original.type === "REFUND") {
    throw new AppError("VALIDATION_ERROR", "반품 건에 대해 다시 반품할 수 없습니다.");
  }
  if (original.status !== "APPROVED") {
    throw new AppError("VALIDATION_ERROR", "승인된 비용만 반품할 수 있습니다.");
  }
  // MEMBER는 본인이 제출한 비용만 반품 가능
  if (userRole === "MEMBER" && original.submittedById !== userId) {
    throw new AppError("FORBIDDEN", "본인이 제출한 비용만 반품할 수 있습니다.");
  }

  // 2. 기존 반품 누계 조회 — 환불 가능 잔액 검증
  //    (원거래 통화 기준: USD면 amountOriginal 센트, KRW면 amount 원)
  const isUSD = original.currency === "USD";
  const priorRefunds = await db
    .select({
      amount: expenses.amount,
      amountOriginal: expenses.amountOriginal,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.originalExpenseId, original.id),
        eq(expenses.type, "REFUND"),
      ),
    );

  const originalTotal = isUSD ? (original.amountOriginal ?? 0) : original.amount;
  const refundedSoFar = priorRefunds.reduce(
    (acc, r) => acc + (isUSD ? (r.amountOriginal ?? 0) : r.amount),
    0,
  );
  const remaining = originalTotal - refundedSoFar;

  if (input.amount > remaining) {
    const unit = isUSD ? "센트" : "원";
    throw new AppError(
      "VALIDATION_ERROR",
      `환불 금액이 환불 가능 잔액(${remaining.toLocaleString("ko-KR")}${unit})을 초과합니다.`,
    );
  }

  // 3. KRW 환산 — 원거래의 환율을 그대로 사용해 전액 반품 시 정확히 상쇄되도록 함
  let finalAmount = input.amount;
  let amountOriginal: number | null = null;
  let exchangeRate: string | null = null;
  if (isUSD) {
    let rate = original.exchangeRate ? Number(original.exchangeRate) : null;
    if (!rate) {
      const rateResult = await getExchangeRate("USD", input.transactionDate);
      if (!rateResult) {
        throw new AppError("VALIDATION_ERROR", "환율 정보를 조회할 수 없습니다. 잠시 후 다시 시도해주세요.");
      }
      rate = rateResult.rate;
    }
    // 전액(잔액) 반품이면 원거래 KRW 금액에서 기존 반품 KRW를 뺀 잔액으로 정확히 상쇄
    const priorKrw = priorRefunds.reduce((acc, r) => acc + r.amount, 0);
    const exactRemainder = original.amount - priorKrw;
    finalAmount =
      input.amount === remaining && exactRemainder > 0
        ? exactRemainder
        : convertToKRW(input.amount, rate);
    amountOriginal = input.amount;
    exchangeRate = String(rate);
  }

  type NewExpense = typeof expenses.$inferInsert;

  const [refund] = await db
    .insert(expenses)
    .values({
      type: "REFUND",
      status: "APPROVED",
      approvedAt: new Date(),
      title: `[반품] ${original.title}`.slice(0, 200),
      description: input.description ?? null,
      amount: finalAmount,
      currency: original.currency,
      amountOriginal,
      exchangeRate,
      category: original.category,
      merchantName: original.merchantName,
      cardLastFour: original.cardLastFour,
      transactionDate: input.transactionDate,
      submittedById: userId,
      companyId: original.companyId,
      originalExpenseId: original.id,
    } as NewExpense)
    .returning();

  // Slack 알림 — 실패해도 등록 자체는 성공 처리 (법카사용과 동일 패턴)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  await notifySlackRefund({
    submitterEmail: userEmail,
    submitterName: userName,
    title: refund.title,
    amount: refund.amount,
    category: refund.category,
    expenseUrl: `${appUrl}/expenses/${refund.id}`,
    originalTitle: original.title,
    companyId: original.companyId ?? undefined,
    currency: refund.currency,
    amountOriginal: refund.amountOriginal,
    description: refund.description,
  }).catch((err) => {
    console.error("Failed to send refund Slack notification:", err);
  });

  return refund;
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
        ilike(expenses.description, searchTerm),
        ilike(expenses.accountHolder, searchTerm),
        ilike(expenses.bankName, searchTerm),
        ilike(expenses.accountNumber, searchTerm),
        ilike(expenses.cardLastFour, searchTerm),
        ilike(expenses.category, searchTerm),
        exists(
          db
            .select({ one: sql`1` })
            .from(users)
            .where(
              and(
                eq(users.id, expenses.submittedById),
                or(
                  ilike(users.name, searchTerm),
                  ilike(users.email, searchTerm),
                ),
              ),
            ),
        ),
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
  if (query.autoClassified === "auto") {
    conditions.push(eq(expenses.autoClassified, true));
  } else if (query.autoClassified === "manual") {
    conditions.push(eq(expenses.autoClassified, false));
  }
  if (query.freelancer === "true") {
    conditions.push(eq(expenses.hasFreelancerWithholding, true));
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

  // 후지급 요청됐지만 아직 승인 안 된 건은 관리자 액션이 필요하므로 목록 맨 앞으로
  const remainingPaymentPriority = sql`CASE WHEN ${expenses.remainingPaymentRequested} = true AND ${expenses.remainingPaymentApproved} = false THEN 0 ELSE 1 END`;

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
      .orderBy(remainingPaymentPriority, orderFn(orderColumn))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(expenses).where(whereClause),
    // 반품(REFUND)은 차감 처리된 net 합계
    db
      .select({ totalAmount: sql<string>`coalesce(sum(${signedAmount}), 0)` })
      .from(expenses)
      .where(whereClause),
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
// getPendingRemainingPayments -- 후지급 승인 대기 목록 (관리자 승인 대기 큐용)
//   부분 선지급 건 중 후지급이 요청됐지만 아직 승인되지 않은 비용
// ---------------------------------------------------------------------------
export async function getPendingRemainingPayments(company?: string) {
  const conditions: ReturnType<typeof eq>[] = [
    eq(expenses.isPrePaid, true),
    eq(expenses.remainingPaymentRequested, true),
    eq(expenses.remainingPaymentApproved, false),
    eq(expenses.status, "APPROVED"),
  ];

  if (company) {
    const { getCompanyBySlug } = await import("@/services/company.service");
    const companyRow = await getCompanyBySlug(company);
    if (companyRow) {
      conditions.push(eq(expenses.companyId, companyRow.id));
    }
  }

  const rows = await db
    .select({
      id: expenses.id,
      title: expenses.title,
      amount: expenses.amount,
      currency: expenses.currency,
      amountOriginal: expenses.amountOriginal,
      prePaidPercentage: expenses.prePaidPercentage,
      dueDate: expenses.dueDate,
      updatedAt: expenses.updatedAt,
      submitterName: users.name,
      companyName: companies.name,
      companySlug: companies.slug,
    })
    .from(expenses)
    .leftJoin(users, eq(expenses.submittedById, users.id))
    .leftJoin(companies, eq(expenses.companyId, companies.id))
    .where(and(...conditions))
    .orderBy(desc(expenses.updatedAt));

  return rows.map((row) => {
    const pct = row.prePaidPercentage ?? 0;
    const prePaidAmount = Math.round((row.amount * pct) / 100);
    return {
      ...row,
      prePaidAmount,
      remainingAmount: row.amount - prePaidAmount,
    };
  });
}

// ---------------------------------------------------------------------------
// getFreelancerWithholdingSummary -- 사업소득(프리랜서 원천징수) 대상자 집계
//   예금주(accountHolder)를 사업소득자로 보고 인별로 묶어 인원/건수/금액을 집계.
//   반려·취소 건은 제외(실제 지급 대상이 아님).
// ---------------------------------------------------------------------------
export interface FreelancerWithholdingFilter {
  startDate?: string;
  endDate?: string;
  company?: string;
}

export interface FreelancerWithholdingExpense {
  id: string;
  type: "CORPORATE_CARD" | "DEPOSIT_REQUEST";
  status: "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED";
  title: string;
  amount: number;
  currency: string;
  amountOriginal: number | null;
  transactionDate: string;
  bankName: string | null;
  accountNumber: string | null;
  submitterName: string | null;
  companyName: string | null;
}

export interface FreelancerWithholdingGroup {
  /** 예금주명. 미입력 건 버킷은 null */
  accountHolder: string | null;
  expenseCount: number;
  totalAmount: number;
  expenses: FreelancerWithholdingExpense[];
}

export async function getFreelancerWithholdingSummary(
  filter: FreelancerWithholdingFilter,
) {
  const conditions: ReturnType<typeof eq>[] = [
    eq(expenses.hasFreelancerWithholding, true),
    // 반려·취소 건은 실제 지급/신고 대상이 아니므로 제외
    inArray(expenses.status, ["SUBMITTED", "APPROVED"]),
  ];

  if (filter.startDate) {
    conditions.push(gte(expenses.transactionDate, filter.startDate));
  }
  if (filter.endDate) {
    conditions.push(lte(expenses.transactionDate, filter.endDate));
  }
  if (filter.company) {
    const { getCompanyBySlug } = await import("@/services/company.service");
    const company = await getCompanyBySlug(filter.company);
    if (company) {
      conditions.push(eq(expenses.companyId, company.id));
    }
  }

  const rows = await db
    .select({
      id: expenses.id,
      type: expenses.type,
      status: expenses.status,
      title: expenses.title,
      amount: expenses.amount,
      currency: expenses.currency,
      amountOriginal: expenses.amountOriginal,
      transactionDate: expenses.transactionDate,
      accountHolder: expenses.accountHolder,
      bankName: expenses.bankName,
      accountNumber: expenses.accountNumber,
      submitterName: users.name,
      companyName: companies.name,
    })
    .from(expenses)
    .leftJoin(users, eq(expenses.submittedById, users.id))
    .leftJoin(companies, eq(expenses.companyId, companies.id))
    .where(and(...conditions))
    .orderBy(desc(expenses.transactionDate));

  // 예금주명(공백 trim)으로 그룹핑. 미입력은 별도 버킷(null)으로.
  const groupMap = new Map<string, FreelancerWithholdingGroup>();
  const NO_HOLDER = "\u0000__no_holder__";

  for (const row of rows) {
    const holder = row.accountHolder?.trim() || null;
    const key = holder ?? NO_HOLDER;
    let group = groupMap.get(key);
    if (!group) {
      group = {
        accountHolder: holder,
        expenseCount: 0,
        totalAmount: 0,
        expenses: [],
      };
      groupMap.set(key, group);
    }
    group.expenseCount += 1;
    group.totalAmount += row.amount;
    group.expenses.push({
      id: row.id,
      type: row.type as FreelancerWithholdingExpense["type"],
      status: row.status as FreelancerWithholdingExpense["status"],
      title: row.title,
      amount: row.amount,
      currency: row.currency,
      amountOriginal: row.amountOriginal ?? null,
      transactionDate: row.transactionDate,
      bankName: row.bankName ?? null,
      accountNumber: row.accountNumber ?? null,
      submitterName: row.submitterName ?? null,
      companyName: row.companyName ?? null,
    });
  }

  // 금액 합계 내림차순 정렬, 예금주 미입력 버킷은 항상 맨 뒤
  const groups = Array.from(groupMap.values()).sort((a, b) => {
    if (a.accountHolder === null) return 1;
    if (b.accountHolder === null) return -1;
    return b.totalAmount - a.totalAmount;
  });

  const identifiedGroups = groups.filter((g) => g.accountHolder !== null);
  const unidentified = groups.find((g) => g.accountHolder === null) ?? null;

  return {
    groups,
    totals: {
      // "대상 인원"은 예금주가 식별된 인원만 카운트
      peopleCount: identifiedGroups.length,
      expenseCount: rows.length,
      totalAmount: rows.reduce((acc, r) => acc + r.amount, 0),
      unidentifiedCount: unidentified?.expenseCount ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// getMartPharmacySummary -- 마트/약국 카테고리 비용 월별 집계
//   실비 청구 리스트를 세무법인에 전달하는 용도. category=MART_PHARMACY 비용을
//   거래월(YYYY-MM)별로 묶어 건수/순지출을 집계. 반려·취소 건은 제외,
//   반품(REFUND)은 음수로 차감해 순지출(net)로 계산.
// ---------------------------------------------------------------------------
export interface MartPharmacyFilter {
  startDate?: string;
  endDate?: string;
  company?: string;
  /** 호점 필터: "STORE_1" | "STORE_2" | "none"(미지정만). 없으면 전체. */
  branch?: string;
}

export interface MartPharmacyExpense {
  id: string;
  type: "CORPORATE_CARD" | "DEPOSIT_REQUEST" | "REFUND";
  status: "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED";
  title: string;
  /** 저장된 양수 금액 (KRW) */
  amount: number;
  /** REFUND이면 음수 — 월 순지출 계산용 */
  signedAmount: number;
  currency: string;
  amountOriginal: number | null;
  transactionDate: string;
  merchantName: string | null;
  submitterName: string | null;
  companyName: string | null;
  /** 호점 코드 STORE_1/STORE_2, 미지정이면 null */
  branch: string | null;
}

export interface MartPharmacyMonthGroup {
  /** 거래월 "YYYY-MM" */
  month: string;
  expenseCount: number;
  /** 순지출 (반품 차감) */
  totalAmount: number;
  expenses: MartPharmacyExpense[];
}

export async function getMartPharmacySummary(filter: MartPharmacyFilter) {
  const conditions: ReturnType<typeof eq>[] = [
    eq(expenses.category, "MART_PHARMACY"),
    // 반려·취소 건은 실제 정산 대상이 아니므로 제외 (REFUND는 항상 APPROVED라 포함됨)
    inArray(expenses.status, ["SUBMITTED", "APPROVED"]),
  ];

  if (filter.startDate) {
    conditions.push(gte(expenses.transactionDate, filter.startDate));
  }
  if (filter.endDate) {
    conditions.push(lte(expenses.transactionDate, filter.endDate));
  }
  if (filter.company) {
    const { getCompanyBySlug } = await import("@/services/company.service");
    const company = await getCompanyBySlug(filter.company);
    if (company) {
      conditions.push(eq(expenses.companyId, company.id));
    }
  }
  if (filter.branch === "none") {
    conditions.push(isNull(expenses.branch));
  } else if (filter.branch === "STORE_1" || filter.branch === "STORE_2") {
    conditions.push(eq(expenses.branch, filter.branch));
  }

  const rows = await db
    .select({
      id: expenses.id,
      type: expenses.type,
      status: expenses.status,
      title: expenses.title,
      amount: expenses.amount,
      currency: expenses.currency,
      amountOriginal: expenses.amountOriginal,
      transactionDate: expenses.transactionDate,
      merchantName: expenses.merchantName,
      branch: expenses.branch,
      submitterName: users.name,
      companyName: companies.name,
    })
    .from(expenses)
    .leftJoin(users, eq(expenses.submittedById, users.id))
    .leftJoin(companies, eq(expenses.companyId, companies.id))
    .where(and(...conditions))
    .orderBy(desc(expenses.transactionDate));

  // 거래월(YYYY-MM)별로 그룹핑
  const groupMap = new Map<string, MartPharmacyMonthGroup>();

  for (const row of rows) {
    const month = row.transactionDate.slice(0, 7); // "YYYY-MM"
    const signed = row.type === "REFUND" ? -row.amount : row.amount;
    let group = groupMap.get(month);
    if (!group) {
      group = { month, expenseCount: 0, totalAmount: 0, expenses: [] };
      groupMap.set(month, group);
    }
    group.expenseCount += 1;
    group.totalAmount += signed;
    group.expenses.push({
      id: row.id,
      type: row.type as MartPharmacyExpense["type"],
      status: row.status as MartPharmacyExpense["status"],
      title: row.title,
      amount: row.amount,
      signedAmount: signed,
      currency: row.currency,
      amountOriginal: row.amountOriginal ?? null,
      transactionDate: row.transactionDate,
      merchantName: row.merchantName ?? null,
      submitterName: row.submitterName ?? null,
      companyName: row.companyName ?? null,
      branch: row.branch ?? null,
    });
  }

  // 최신 월부터 정렬
  const groups = Array.from(groupMap.values()).sort((a, b) =>
    b.month.localeCompare(a.month),
  );

  const totalAmount = rows.reduce(
    (acc, r) => acc + (r.type === "REFUND" ? -r.amount : r.amount),
    0,
  );

  return {
    groups,
    totals: {
      monthCount: groups.length,
      expenseCount: rows.length,
      totalAmount,
      monthlyAverage: groups.length ? Math.round(totalAmount / groups.length) : 0,
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

  // Fetch attachments (파일 이름 순 정렬 — 같은 이름끼리 묶이도록, 한글/숫자 자연정렬)
  const expenseAttachments = await db
    .select()
    .from(attachments)
    .where(eq(attachments.expenseId, expenseId));

  expenseAttachments.sort((a, b) =>
    a.fileName.localeCompare(b.fileName, "ko", { numeric: true, sensitivity: "base" }),
  );

  // 반품 ↔ 원거래 상호 링크
  // 이 비용이 반품이면: 원거래 요약 / 이 비용이 원거래면: 연결된 반품 목록
  let originalExpense: { id: string; title: string; amount: number } | null = null;
  let refunds: {
    id: string;
    title: string;
    amount: number;
    currency: string;
    amountOriginal: number | null;
    transactionDate: string;
  }[] = [];

  if (result.expense.type === "REFUND" && result.expense.originalExpenseId) {
    const [orig] = await db
      .select({ id: expenses.id, title: expenses.title, amount: expenses.amount })
      .from(expenses)
      .where(eq(expenses.id, result.expense.originalExpenseId));
    originalExpense = orig ?? null;
  } else if (result.expense.type !== "REFUND") {
    refunds = await db
      .select({
        id: expenses.id,
        title: expenses.title,
        amount: expenses.amount,
        currency: expenses.currency,
        amountOriginal: expenses.amountOriginal,
        transactionDate: expenses.transactionDate,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.originalExpenseId, expenseId),
          eq(expenses.type, "REFUND"),
        ),
      )
      .orderBy(desc(expenses.transactionDate));
  }

  return {
    ...result.expense,
    submitter: result.submitter,
    attachments: expenseAttachments,
    originalExpense,
    refunds,
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

  // 반품 건은 수정 불가 — 잘못 등록했다면 삭제 후 다시 등록
  if (expense.type === "REFUND") {
    throw new AppError("VALIDATION_ERROR", "반품 건은 수정할 수 없습니다. 삭제 후 다시 등록해주세요.");
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

  const updateSet: Record<string, unknown> = {
    ...restInput,
    updatedAt: new Date(),
  };

  // Admin can explicitly set status. Non-admin edits no longer auto-reset
  // an APPROVED deposit request back to SUBMITTED — the common case is the
  // submitter attaching a late receipt or fixing a typo, and forcing
  // re-approval there just creates churn for the admin. updatedAt + Slack
  // re-post still capture the change for audit; if amount/account changed,
  // admin can spot it from the message and revert manually.
  if (inputStatus && isAdmin) {
    updateSet.status = inputStatus;
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

  // Update Slack message only when a field that actually appears in the Slack
  // message changed. 호점(branch) 지정·원천징수 플래그 같은 내부 정리용 변경은
  // Slack 메시지 내용과 무관하므로 재게시하지 않는다 (불필요한 알림 방지).
  const SLACK_RELEVANT_FIELDS = [
    "title",
    "amount",
    "category",
    "merchantName",
    "description",
    "dueDate",
    "isUrgent",
    "isPrePaid",
    "prePaidPercentage",
    "companyId",
    "currency",
    "amountOriginal",
  ];
  const touchesSlack = Object.keys(input).some((k) =>
    SLACK_RELEVANT_FIELDS.includes(k),
  );

  // Update Slack message if we posted one anywhere. 미러만 남아 있는 경우도
  // (원본 게시 실패 등) 재게시해야 리테일 채널이 옛 내용으로 남지 않는다.
  const hasPostedSlackMessage =
    (updated.slackMessageTs && updated.slackChannelId) ||
    (updated.mirrorSlackMessageTs && updated.mirrorSlackChannelId);
  if (touchesSlack && hasPostedSlackMessage) {
    // Look up submitter info
    const [submitter] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, updated.submittedById));

    if (submitter) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      try {
        const newSlack = await updateSlackExpenseMessage({
          slackMessageTs: updated.slackMessageTs,
          slackChannelId: updated.slackChannelId,
          mirrorSlackMessageTs: updated.mirrorSlackMessageTs,
          mirrorSlackChannelId: updated.mirrorSlackChannelId,
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
          isPrePaid: updated.isPrePaid,
          prePaidPercentage: updated.prePaidPercentage,
        });
        // 재게시 결과로 좌표를 항상 덮어쓴다. 한쪽이 실패해 null이 되면
        // 그 좌표는 지워져야 한다 — 이미 삭제된 메시지를 가리키게 두면
        // 다음 수정 때 존재하지 않는 ts로 chat.delete를 호출하게 된다.
        await db.update(expenses).set({
          slackMessageTs: newSlack.primary?.ts ?? null,
          slackChannelId: newSlack.primary?.channel ?? null,
          mirrorSlackMessageTs: newSlack.mirror?.ts ?? null,
          mirrorSlackChannelId: newSlack.mirror?.channel ?? null,
        }).where(eq(expenses.id, updated.id)).catch(() => {});
      } catch (err) {
        console.error("[Slack] 메시지 수정 실패:", err);
      }
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

  // Members may not delete an APPROVED deposit request — that record represents
  // a payment decision by an admin and may already be paid out.
  // Auto-APPROVED corporate-card entries can still be deleted by the submitter
  // since approval there is not an admin action.
  if (
    !isAdmin &&
    expense.status === "APPROVED" &&
    expense.type === "DEPOSIT_REQUEST"
  ) {
    throw new AppError(
      "FORBIDDEN",
      "승인된 입금요청은 관리자만 삭제할 수 있습니다.",
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

  // Delete Slack message on delete (primary + mirror)
  await deleteSlackExpenseMessage({
    slackMessageTs: deleted.slackMessageTs,
    slackChannelId: deleted.slackChannelId,
    mirrorSlackMessageTs: deleted.mirrorSlackMessageTs,
    mirrorSlackChannelId: deleted.mirrorSlackChannelId,
  }).catch((err) => console.error("[Slack] 삭제 메시지 제거 실패:", err));

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

  // Block member-initiated cancel on APPROVED deposit requests.
  // Approval there is an explicit admin payment decision; cancellation has to
  // go through an admin reversal so audit trail is preserved.
  if (
    expense.status === "APPROVED" &&
    expense.type === "DEPOSIT_REQUEST"
  ) {
    throw new AppError(
      "FORBIDDEN",
      "승인된 입금요청은 취소할 수 없습니다. 관리자에게 문의해주세요.",
    );
  }

  // Build status whitelist that matches the type-specific rules above.
  const allowedStatuses =
    expense.type === "DEPOSIT_REQUEST"
      ? [eq(expenses.status, "SUBMITTED")]
      : [eq(expenses.status, "SUBMITTED"), eq(expenses.status, "APPROVED")];

  const [updated] = await db
    .update(expenses)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(
      and(
        eq(expenses.id, expenseId),
        eq(expenses.submittedById, userId),
        or(...allowedStatuses),
      ),
    )
    .returning();

  if (!updated) {
    throw new AppError("FORBIDDEN", "비용 상태가 변경되었습니다. 페이지를 새로고침해주세요.");
  }

  // Delete Slack message on cancel (primary + mirror)
  await deleteSlackExpenseMessage({
    slackMessageTs: updated.slackMessageTs,
    slackChannelId: updated.slackChannelId,
    mirrorSlackMessageTs: updated.mirrorSlackMessageTs,
    mirrorSlackChannelId: updated.mirrorSlackChannelId,
  }).catch((err) => console.error("[Slack] 취소 메시지 삭제 실패:", err));

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
// revertApproval -- ADMIN only. 승인 번복: APPROVED → SUBMITTED로 되돌림
// ---------------------------------------------------------------------------
export async function revertApproval(expenseId: string) {
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
      "입금요청만 승인 취소할 수 있습니다.",
    );
  }

  if (expense.status !== "APPROVED") {
    throw new AppError(
      "FORBIDDEN",
      "APPROVED 상태의 입금요청만 승인 취소할 수 있습니다.",
    );
  }

  // Use WHERE with status check to prevent race conditions (TOCTOU).
  // 후지급 플래그도 함께 리셋 — 재승인 시 낡은 후지급 상태가 남지 않도록.
  const [updated] = await db
    .update(expenses)
    .set({
      status: "SUBMITTED",
      approvedById: null,
      approvedAt: null,
      remainingPaymentRequested: false,
      remainingPaymentApproved: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(expenses.id, expenseId),
        eq(expenses.status, "APPROVED"),
      ),
    )
    .returning();

  if (!updated) {
    throw new AppError(
      "FORBIDDEN",
      "이미 처리된 요청입니다. 페이지를 새로고침해주세요.",
    );
  }

  // Look up submitter for notification
  const [submitterUser] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, expense.submittedById));

  await notifyApprovalReverted(
    expense.submittedById,
    expense.id,
    expense.title,
    {
      amount: expense.amount,
      submitterName: submitterUser?.name ?? "요청자",
      submitterEmail: submitterUser?.email ?? "",
      companyId: expense.companyId,
      currency: expense.currency,
      amountOriginal: expense.amountOriginal,
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

  // Send notification to the submitter
  await notifyExpenseRejected(
    expense.submittedById,
    expense.id,
    expense.title,
    rejectionReason,
  );

  return updated;
}
