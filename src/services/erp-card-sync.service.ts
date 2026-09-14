import { db } from "@/lib/db";
import { gowidCardMappings, gowidTransactions, companies } from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { processStagedCardTransaction, upsertCardMapping } from "./gowid.service";

// ---------------------------------------------------------------------------
// ERP(코데프) 카드 거래 → 익스펜스원
//
// 한아원 ERP가 코데프로 카드 거래를 매일 수집해 `hanahone_erp.transactions`에
// 쌓는다(같은 DB, 다른 스키마). 고위드를 안 쓰는 법인은 그 데이터를 여기로
// 끌어와야 사용자가 자기 카드 사용을 볼 수 있다.
//
// ⚠️ **아무 소스나 끌어오면 안 된다.** ERP의 `lotte_card`는 고위드가 주는
// 것과 **같은 거래**다(한아원코리아 3626·3669·0742… 동일 카드 확인). 둘 다
// 넣으면 같은 사용이 두 번 뜬다. 그래서 법인별로 **소스까지** 명시적으로 선언한다.
// 고위드는 롯데카드만 준다 — 같은 법인이라도 우리카드는 ERP에서만 들어온다.
//
// 옛 `codef-notify.service.ts`는 죽은 `financeone.transactions`를 읽었다
// (그 스키마는 2026-06-24에 유입이 끊겼고, 그 경로로 들어온 거래는 0건이다).
// 이 서비스가 그것을 대체한다.
// ---------------------------------------------------------------------------

/**
 * ExpenseOne 회사 slug → 어느 ERP 법인의 어떤 카드 소스를 가져올지.
 *
 * **고위드로 이미 들어오는 소스는 넣지 말 것**(중복 등록된다).
 * 고위드 대상: korea·retail의 **롯데카드**. 그래서 두 법인은 우리카드만 가져온다.
 * (2026-09-14 확인: 우리카드 7장 모두 고위드 매핑과 끝 4자리가 겹치지 않음)
 */
export const ERP_CARD_SOURCES: Record<
  string,
  { entityId: number; sources: string[] }
> = {
  // 한아원코리아·리테일 — 롯데는 고위드, 우리카드는 여기서.
  korea: { entityId: 2, sources: ["codef_woori_card"] },
  retail: { entityId: 3, sources: ["codef_woori_card"] },
  // 한아원파트너스 — 고위드 계정이 없다. 카드 전부 코데프로 받는다.
  partners: {
    entityId: 16,
    sources: ["codef_woori_card", "codef_shinhan_card", "codef_lotte_card"],
  },
};

/** 며칠치를 훑을지. 넉넉히 잡아도 (source, upstream id)로 중복이 걸린다. */
const LOOKBACK_DAYS = 14;

interface ErpCardRow {
  id: string;
  date: string;
  amount: string;
  counterparty: string | null;
  card_number: string | null;
  source_type: string;
  time: string | null;
}

/** ERP 거래 id는 text지만 값은 숫자다. gowid_expense_id(integer)에 넣기 위해 변환. */
function toUpstreamId(id: string): number | null {
  const n = Number(id);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * 코데프 소스 → 카드 관리 화면의 발급사 이름. 화면의 발급사 목록이 한글
 * ("롯데","우리"…)이라, 영어로 넣으면 "woori"라는 별도 그룹으로 떨어진다.
 */
const ISSUER_LABEL: Record<string, string> = {
  woori: "우리",
  shinhan: "신한",
  lotte: "롯데",
  kb: "국민",
  kookmin: "국민",
  hana: "하나",
  hyundai: "현대",
  samsung: "삼성",
  bc: "BC",
  nh: "NH",
};

export function issuerFromSource(sourceType: string): string {
  const key = sourceType.replace(/^codef_/, "").replace(/_card$/, "");
  return ISSUER_LABEL[key] ?? key;
}

function lastFourOf(cardNumber: string | null): string | null {
  if (!cardNumber) return null;
  const digits = cardNumber.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/**
 * ERP가 코데프로 모은 카드 거래를 스테이징하고 알림까지 처리한다.
 * 매일 cron에서 호출한다. 고위드 동기화와 **같은 처리 함수**를 쓴다.
 */
export async function syncErpCardTransactions(): Promise<{
  scanned: number;
  staged: number;
  notified: number;
  autoClassified: number;
  unmappedCards: string[];
  skipped: string[];
}> {
  const slugs = Object.keys(ERP_CARD_SOURCES);
  if (slugs.length === 0) {
    return { scanned: 0, staged: 0, notified: 0, autoClassified: 0, unmappedCards: [], skipped: [] };
  }

  // 회사 slug → id. 선언된 slug가 실제로 없으면 건너뛴다(오타를 조용히 넘기지 않는다).
  const companyRows = await db
    .select({ id: companies.id, slug: companies.slug })
    .from(companies)
    .where(inArray(companies.slug, slugs));
  const slugToId = new Map(companyRows.map((c) => [c.slug, c.id]));

  const skipped: string[] = [];
  for (const slug of slugs) {
    if (!slugToId.has(slug)) {
      skipped.push(`회사 slug "${slug}" 없음`);
      console.warn(`[erp-card] ERP_CARD_SOURCES의 slug "${slug}"와 일치하는 회사가 없습니다.`);
    }
  }

  let scanned = 0;
  let staged = 0;
  let notified = 0;
  let autoClassified = 0;
  const unmappedCards = new Set<string>();

  for (const [slug, cfg] of Object.entries(ERP_CARD_SOURCES)) {
    const companyId = slugToId.get(slug);
    if (!companyId) continue;

    // ERP 스키마를 직접 읽는다. 취소·중복 건은 제외한다.
    const result = await db.execute(sql`
      SELECT id, date::text AS date, amount::text AS amount, counterparty,
             card_number, source_type, time
      FROM hanahone_erp.transactions
      WHERE entity_id = ${cfg.entityId}
        AND source_type IN (${sql.join(cfg.sources.map((t) => sql`${t}`), sql`, `)})
        AND is_cancel = false
        AND is_duplicate = false
        AND date >= (CURRENT_DATE - ${LOOKBACK_DAYS}::int)
      ORDER BY date DESC, id DESC
    `);
    const rows = Array.from(result as Iterable<ErpCardRow>);
    scanned += rows.length;
    if (rows.length === 0) continue;

    // 이미 들어온 것은 건너뛴다. source='codef'로 네임스페이스를 분리해
    // 고위드의 정수 id와 충돌하지 않게 한다.
    const upstreamIds = rows.map((r) => toUpstreamId(r.id)).filter((n): n is number => n !== null);
    const existing = upstreamIds.length
      ? await db
          .select({ gowidExpenseId: gowidTransactions.gowidExpenseId })
          .from(gowidTransactions)
          .where(
            and(
              eq(gowidTransactions.source, "codef"),
              inArray(gowidTransactions.gowidExpenseId, upstreamIds),
            ),
          )
      : [];
    const seen = new Set(existing.map((e) => e.gowidExpenseId));

    // 이 회사의 카드 매핑
    const mappings = await db
      .select()
      .from(gowidCardMappings)
      .where(and(eq(gowidCardMappings.companyId, companyId), eq(gowidCardMappings.isActive, true)));
    const byLastFour = new Map(mappings.map((m) => [m.cardLastFour, m]));

    for (const row of rows) {
      const upstreamId = toUpstreamId(row.id);
      if (upstreamId === null || seen.has(upstreamId)) continue;

      const lastFour = lastFourOf(row.card_number);
      if (!lastFour) continue; // 카드번호가 없으면 누구 것인지 알 수 없다

      // 금액은 소수점을 가질 수 있다(numeric). 원 단위 정수로 맞춘다.
      const amountKRW = Math.round(Math.abs(Number(row.amount)));
      if (!Number.isFinite(amountKRW) || amountKRW <= 0) continue;

      const mapping = byLastFour.get(lastFour);

      // 처음 보는 카드는 등록해둔다 — 관리자가 /admin/gowid에서 소유자를 지정한다.
      // 한 번 등록한 카드는 같은 실행 안에서 다시 등록하지 않는다(거래마다 하면
      // 카드 3장·거래 43건에 등록 쿼리가 43번 돈다).
      if (!mapping) {
        unmappedCards.add(lastFour);
        const created = await upsertCardMapping({
          cardLastFour: lastFour,
          cardAlias: null,
          issuer: issuerFromSource(row.source_type),
          userId: null,
          companyId,
        });
        if (created) byLastFour.set(lastFour, created);
      }

      const [inserted] = await db
        .insert(gowidTransactions)
        .values({
          source: "codef",
          gowidExpenseId: upstreamId,
          userId: mapping?.userId ?? null,
          cardLastFour: lastFour,
          cardAlias: null,
          // 고위드 쪽 형식(yyyymmdd)에 맞춘다.
          expenseDate: row.date.replaceAll("-", ""),
          expenseTime: row.time ?? null,
          amount: amountKRW,
          currency: "KRW",
          storeName: row.counterparty,
          storeAddress: null,
          status: "pending",
        })
        .returning();
      staged++;

      if (!inserted || !mapping?.userId) continue;

      const outcome = await processStagedCardTransaction({
        stagedTxId: inserted.id,
        userId: mapping.userId,
        companyId,
        companySlug: slug,
        amountKRW,
        currency: "KRW",
        storeName: row.counterparty,
        transactionDate: row.date,
        cardLastFour: lastFour,
      });
      if (outcome === "auto-classified") autoClassified++;
      else if (outcome === "notified") notified++;
    }
  }

  return {
    scanned,
    staged,
    notified,
    autoClassified,
    unmappedCards: [...unmappedCards],
    skipped,
  };
}
