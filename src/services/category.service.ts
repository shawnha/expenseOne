import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { CATEGORY_OPTIONS } from "@/lib/validations/expense-form";

// ---------------------------------------------------------------------------
// 내가 직접 입력한 카테고리 기억하기
//
// 카테고리는 프리셋(ODD/GLPH/마트·약국/기타) 외에 자유 입력을 허용한다. 그런데
// 자유 입력한 값은 어디에도 남지 않아서, 같은 카테고리를 쓰는 사람은 **매번
// 똑같은 글자를 다시 타이핑**해야 했다. 오타가 나면 집계에서 갈라지기까지
// 한다 — 실제로 이 DB에 "사무용품"과 "사무실용품"이 따로 있다.
//
// 별도 테이블을 만들지 않고 **이미 제출한 비용에서 역산**한다:
//   - 새로 쓸 것도, 지울 것도 없다 (쓰는 순간 기록은 이미 남는다)
//   - 기기가 바뀌어도 따라온다 (PWA 폰 ↔ 데스크톱)
//   - 안 쓰면 자연히 밀려난다 (최근순 + 상한)
// ---------------------------------------------------------------------------

/**
 * 프리셋은 이미 버튼으로 떠 있으니 뺀다. **label까지** 빼는 게 중요하다 —
 * 버튼에 보이는 글자는 label("마트/약국","기타")인데 저장되는 값은
 * value("MART_PHARMACY","OTHER")다. label을 그대로 타이핑한 사람이 있으면
 * 글자가 똑같은 버튼이 두 개 뜨고, 어느 쪽을 눌러야 하는지 알 수 없게 된다.
 */
const PRESET_STRINGS = [
  ...CATEGORY_OPTIONS.map((o) => o.value),
  ...CATEGORY_OPTIONS.map((o) => o.label),
];

/** 한 줄에 다 안 들어가면 고르기보다 훑기가 되어버린다. */
const MAX_RECENT = 8;

/**
 * 본인이 **직접 입력해서** 제출한 카테고리를 최근 사용순으로 돌려준다.
 * 없으면 빈 배열 — 폼은 지금과 똑같이 보인다.
 *
 * 자동분류(auto_classified)로 생긴 건은 뺀다. 고위드 카드 거래가 FinanceOne
 * 룰에 걸리면 "식비"·"간식/커피"로 **자동** 등록되는데(현재 560건 전부 자동),
 * 본인은 그 글자를 타이핑한 적이 없다. 최근순 정렬이라 매일 도는 자동분류가
 * 앞자리를 영구히 점거해, 정작 본인이 만든 카테고리를 밀어내기도 한다.
 */
export async function getMyCustomCategories(userId: string): Promise<string[]> {
  if (!userId) return [];

  try {
    // 표기 차이로 갈라진 것을 접어서 보여준다. 앞뒤 공백뿐 아니라 대소문자도
    // 접는다 — 이 DB에 "Hanah One"과 "HANAH ONE"이 따로 남아 있고, 버튼이 두
    // 개 뜨면 어느 쪽을 눌러야 하는지 알 수 없다. 보여줄 글자는 **가장 최근에
    // 쓴 표기**를 그대로 쓴다(사용자가 마지막으로 택한 형태가 맞을 확률이 높다).
    const rows = await db
      .select({
        // 보여줄 글자는 가장 최근에 쓴 표기를 그대로.
        category: sql<string>`(array_agg(btrim(${expenses.category}) ORDER BY ${expenses.createdAt} DESC))[1]`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.submittedById, userId),
          eq(expenses.autoClassified, false),
          // 빈 문자열·공백만 있는 값이 과거 데이터에 섞여 있어도 버튼으로 띄우지 않는다.
          sql`btrim(${expenses.category}) <> ''`,
          notInArray(sql`btrim(${expenses.category})`, PRESET_STRINGS),
        ),
      )
      .groupBy(sql`lower(btrim(${expenses.category}))`)
      .orderBy(
        sql`MAX(${expenses.createdAt}) DESC`,
        sql`lower(btrim(${expenses.category})) ASC`,
      )
      .limit(MAX_RECENT);

    return rows.map((r) => r.category);
  } catch (err) {
    // 이건 편의 기능이다. 실패해도 폼은 떠야 한다.
    console.error("[category] 내 카테고리 조회 실패:", err);
    return [];
  }
}
