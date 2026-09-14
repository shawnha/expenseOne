import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { and, eq, notInArray, sql } from "drizzle-orm";
// 키 규칙은 클라이언트와 공유한다 — src/lib/utils/autofill.ts의 merchantKey와 SQL의 lower(btrim())가 같아야 한다.

// ---------------------------------------------------------------------------
// 비슷한 건이면 지난번 내용으로 채워주기
//
// 무엇을 채울지는 **실제 재제출 데이터로 정했다** (2026-09-14 실측):
//
//   입금요청 — 같은 사람이 같은 예금주에게 다시 보낸 경우(149건 중 54%)
//     계좌·은행 같음 93% / 회사 89% / 카테고리 79% / 제목 9% / 금액 8%
//   법카 — 같은 사람이 같은 가맹점에서 다시 쓴 경우(238건 중 54%)
//     카테고리 76% / 회사 77% / 제목 4%
//
// 그래서 **계좌·은행·카테고리(·회사)만** 채우고 **제목·금액은 절대 채우지
// 않는다.** 금액을 채우면 지난달 금액으로 그대로 제출되는 사고가 난다.
//
// 반려·취소된 건은 근거에서 뺀다. 계좌가 틀려서 반려된 건일 수 있다 — 돈이
// 나가는 칸을 틀린 기록으로 채우면 안 된다.
//
// 본인 기록만 쓴다. 다른 사람이 보낸 계좌(프리랜서 개인 계좌 등)가 보이면 안 된다.
// ---------------------------------------------------------------------------

const DEAD_STATUSES = ["REJECTED", "CANCELLED"] as const;

export interface PayeeSuggestion {
  accountHolder: string;
  bankName: string;
  accountNumber: string;
  /** 이 계좌로 마지막에 보낸 건의 카테고리 */
  category: string;
  /** 이 계좌로 마지막에 보낸 건의 회사 */
  companyId: string;
  useCount: number;
}

/** 입금요청 폼의 "최근 계좌". 최근에 보낸 순. */
const MAX_PAYEES = 8;

export async function getMyRecentPayees(userId: string): Promise<PayeeSuggestion[]> {
  if (!userId) return [];
  try {
    // 같은 거래처를 한 줄로 접는다. 계좌번호는 숫자만 비교한다 — 하이픈을
    // 넣었다 뺐다 해서 같은 계좌가 두 줄로 뜨면 고르기 헷갈린다.
    const latest = <T>(col: unknown) =>
      sql<T>`(array_agg(${col} ORDER BY ${expenses.createdAt} DESC))[1]`;

    const rows = await db
      .select({
        accountHolder: latest<string>(sql`btrim(${expenses.accountHolder})`),
        bankName: latest<string>(sql`btrim(${expenses.bankName})`),
        accountNumber: latest<string>(sql`btrim(${expenses.accountNumber})`),
        category: latest<string>(sql`btrim(${expenses.category})`),
        companyId: latest<string>(expenses.companyId),
        useCount: sql<number>`count(*)::int`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.submittedById, userId),
          eq(expenses.type, "DEPOSIT_REQUEST"),
          notInArray(expenses.status, [...DEAD_STATUSES]),
          sql`coalesce(btrim(${expenses.accountHolder}), '') <> ''`,
          sql`coalesce(btrim(${expenses.bankName}), '') <> ''`,
          sql`coalesce(regexp_replace(${expenses.accountNumber}, '[^0-9]', '', 'g'), '') <> ''`,
        ),
      )
      .groupBy(
        sql`lower(btrim(${expenses.accountHolder}))`,
        sql`btrim(${expenses.bankName})`,
        sql`regexp_replace(${expenses.accountNumber}, '[^0-9]', '', 'g')`,
      )
      .orderBy(sql`MAX(${expenses.createdAt}) DESC`)
      .limit(MAX_PAYEES);

    return rows;
  } catch (err) {
    // 편의 기능이다. 실패해도 폼은 떠야 한다.
    console.error("[autofill] 최근 계좌 조회 실패:", err);
    return [];
  }
}

export interface MerchantSuggestion {
  /** 가맹점 원래 표기 (가장 최근) */
  merchantName: string;
  category: string;
  useCount: number;
}

/** 가맹점 칩의 '기타'는 가맹점이 아니다 — 여기서 뭘 추천하면 틀린다. */
const NOT_A_MERCHANT = new Set(["기타"]);

const MAX_MERCHANTS = 100;

/**
 * 법카 폼용: 내가 예전에 쓴 가맹점 → 그때 카테고리. 키는 merchantKey()(lib/utils/autofill)와 같은 규칙.
 *
 * 자동분류(식비) 건도 **포함한다.** "내가 직접 입력한 카테고리"(category.service)
 * 와 달리 여기선 "이 가맹점은 무엇이었나"가 질문이라, 룰이 식비로 판정한
 * 기록도 정답이다. 같은 식당인데 이번 건만 룰에 안 걸려 알림이 온 경우 바로
 * 식비를 추천할 수 있다.
 */
export async function getMyMerchantCategories(
  userId: string,
): Promise<Record<string, MerchantSuggestion>> {
  if (!userId) return {};
  try {
    const rows = await db
      .select({
        key: sql<string>`lower(btrim(${expenses.merchantName}))`,
        merchantName: sql<string>`(array_agg(btrim(${expenses.merchantName}) ORDER BY ${expenses.createdAt} DESC))[1]`,
        category: sql<string>`(array_agg(btrim(${expenses.category}) ORDER BY ${expenses.createdAt} DESC))[1]`,
        useCount: sql<number>`count(*)::int`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.submittedById, userId),
          eq(expenses.type, "CORPORATE_CARD"),
          notInArray(expenses.status, [...DEAD_STATUSES]),
          sql`coalesce(btrim(${expenses.merchantName}), '') <> ''`,
          // LIMIT 전에 거른다 — 뒤에서 거르면 100칸 중 한 칸을 차지한다.
          notInArray(sql`btrim(${expenses.merchantName})`, [...NOT_A_MERCHANT]),
          sql`coalesce(btrim(${expenses.category}), '') <> ''`,
        ),
      )
      .groupBy(sql`lower(btrim(${expenses.merchantName}))`)
      .orderBy(sql`MAX(${expenses.createdAt}) DESC`)
      .limit(MAX_MERCHANTS);

    const map: Record<string, MerchantSuggestion> = {};
    for (const r of rows) {
      map[r.key] = { merchantName: r.merchantName, category: r.category, useCount: r.useCount };
    }
    return map;
  } catch (err) {
    console.error("[autofill] 가맹점 카테고리 조회 실패:", err);
    return {};
  }
}
