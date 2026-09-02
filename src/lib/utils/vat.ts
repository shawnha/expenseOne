// ---------------------------------------------------------------------------
// 부가세 계산 — 입력 금액이 "부가세 별도"인지 "부가세 포함(총액)"인지가 전부다.
//
// 사용자 제보(2026-09-02): 「부가세 포함」 체크박스가 켜면 10%를 **더하는데**,
// 글자는 "내가 넣은 금액이 부가세 포함"으로 읽혀서 정반대로 이해된다.
// 그래서 체크박스 하나가 아니라 **입력 금액의 성격을 고르게** 한다.
//
//   EXCLUSIVE(부가세 별도) — 입력 = 공급가액,  합계 = 입력 + 10%
//   INCLUSIVE(부가세 포함) — 입력 = 합계(총액), 공급가액 = 합계에서 역산
// ---------------------------------------------------------------------------

export const VAT_RATE = 0.1;

export type VatMode = "EXCLUSIVE" | "INCLUSIVE";

export interface VatBreakdown {
  supply: number;
  vat: number;
  total: number;
}

/** 공급가액 → 부가세·합계. 저장은 공급가액만 하고 나머지는 항상 여기서 파생한다. */
export function addVat(supply: number): VatBreakdown {
  const vat = Math.round(supply * VAT_RATE);
  return { supply, vat, total: supply + vat };
}

/**
 * 총액 → 공급가액·부가세.
 *
 * 부가세를 **차액으로** 잡는다(`total - supply`). `round(supply * 0.1)`로 다시
 * 구하면 총액의 약 9%가 표현되지 않는다 — `supply + round(supply/10)`은 s가 1씩
 * 늘 때 1 또는 2씩 뛰므로 11개 중 1개꼴로 **도달할 수 없는 총액**이 생긴다
 * (5·16·27…). 사용자가 친 총액이 조용히 다른 값이 되면 안 되므로,
 * 공급가액과 부가세를 **함께 저장**하고 합계는 둘의 합으로만 정의한다.
 */
export function splitVat(total: number): VatBreakdown {
  if (total <= 0) return { supply: 0, vat: 0, total: 0 };
  const supply = Math.round(total / (1 + VAT_RATE));
  return { supply, vat: total - supply, total };
}

/** 입력 금액과 모드로부터 내역을 만든다. 화면·저장이 같은 규칙을 쓰게 하는 진입점. */
export function breakdownFor(amount: number, mode: VatMode): VatBreakdown {
  if (!amount || amount <= 0) return { supply: 0, vat: 0, total: 0 };
  return mode === "INCLUSIVE" ? splitVat(amount) : addVat(amount);
}
