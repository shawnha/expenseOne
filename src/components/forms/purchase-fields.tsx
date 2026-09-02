"use client";

import { useId } from "react";
import { Plus, X } from "lucide-react";

// ---------------------------------------------------------------------------
// 사입 체크 + 약국별 세금계산서 정보
//
// 법카·입금요청 두 폼이 같이 쓴다. 체크했을 때만 입력란이 열린다 — 대부분의
// 비용은 사입이 아니라서, 항상 펼쳐두면 폼만 길어진다.
//
// **약국이 여러 곳일 수 있다.** 한 번 들여온 물건을 나눠 납품하는 경우가 있어서
// 줄을 추가할 수 있게 했다. 세금계산서는 공급받는자가 한 명이라 보통 약국 수만큼
// 발행하고, 발행 체크도 줄마다 따로 관리된다.
//
// **공급가액은 비용 금액과 다르다.** 비용은 우리가 물건을 사며 나간 돈이고,
// 여기 넣는 건 약국에 청구할 돈이다(마진 포함). 헷갈리기 쉬워서 명시하고,
// 줄 합계와 부가세를 즉시 계산해 보여준다.
// ---------------------------------------------------------------------------

export interface PurchaseLine {
  pharmacyName: string;
  pharmacyBizNo: string;
  supplyAmount: string;
  purchaseItems: string;
}

export interface PurchaseFieldValues {
  isPurchase: boolean;
  lines: PurchaseLine[];
}

interface Props {
  value: PurchaseFieldValues;
  onChange: (next: PurchaseFieldValues) => void;
  error?: string;
}

const VAT_RATE = 0.1;

function digitsOnly(v: string) {
  return v.replace(/\D/g, "");
}

/** 000-00-00000 형태로 다듬는다. 입력 중에도 자연스럽게 하이픈이 붙는다. */
function formatBizNo(v: string) {
  const d = digitsOnly(v).slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

export const emptyLine: PurchaseLine = {
  pharmacyName: "",
  pharmacyBizNo: "",
  supplyAmount: "",
  purchaseItems: "",
};

export const emptyPurchaseFields: PurchaseFieldValues = {
  isPurchase: false,
  lines: [{ ...emptyLine }],
};

export function PurchaseFields({ value, onChange, error }: Props) {
  const id = useId();

  const setLine = (i: number, patch: Partial<PurchaseLine>) =>
    onChange({
      ...value,
      lines: value.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    });

  const addLine = () => onChange({ ...value, lines: [...value.lines, { ...emptyLine }] });

  const removeLine = (i: number) =>
    onChange({ ...value, lines: value.lines.filter((_, idx) => idx !== i) });

  const totals = value.lines.reduce(
    (acc, l) => {
      const supply = Number(digitsOnly(l.supplyAmount)) || 0;
      const vat = Math.round(supply * VAT_RATE);
      return { supply: acc.supply + supply, vat: acc.vat + vat };
    },
    { supply: 0, vat: 0 },
  );

  return (
    <div className="rounded-2xl border border-[var(--apple-separator)] p-3 sm:p-4">
      <label className="flex cursor-pointer select-none items-start gap-2">
        <input
          type="checkbox"
          checked={value.isPurchase}
          onChange={(e) =>
            onChange({
              isPurchase: e.target.checked,
              lines: value.lines.length ? value.lines : [{ ...emptyLine }],
            })
          }
          className="mt-0.5 size-4 cursor-pointer rounded border-[rgba(0,0,0,0.15)] text-[var(--apple-blue)] focus:ring-[var(--apple-blue)] dark:border-[rgba(255,255,255,0.2)]"
        />
        <span>
          <span className="text-[14px] font-medium text-[var(--apple-label)]">
            사입 (약국 납품 → 세금계산서 발행)
          </span>
          <span className="mt-0.5 block text-[12px] text-[var(--apple-secondary-label)]">
            체크하면 발행 관리 목록에 올라가고, 기한이 다가오면 알림이 갑니다.
          </span>
        </span>
      </label>

      {value.isPurchase && (
        <div className="mt-3 flex flex-col gap-3 border-t border-[var(--apple-separator)] pt-3">
          {value.lines.map((line, i) => {
            const supply = Number(digitsOnly(line.supplyAmount)) || 0;
            const vat = Math.round(supply * VAT_RATE);
            return (
              <div
                key={i}
                className="rounded-xl bg-[var(--apple-system-grouped-background)]/50 p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12px] font-medium text-[var(--apple-secondary-label)]">
                    약국 {i + 1}
                    {value.lines.length > 1 && " · 계산서 1장"}
                  </span>
                  {value.lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      aria-label={`약국 ${i + 1} 삭제`}
                      className="inline-flex size-6 items-center justify-center rounded-full text-[var(--apple-secondary-label)] hover:bg-[var(--apple-fill)]"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor={`${id}-name-${i}`}
                      className="mb-1 block text-[13px] text-[var(--apple-secondary-label)]"
                    >
                      납품처 약국명 <span className="text-[var(--apple-red)]">*</span>
                    </label>
                    <input
                      id={`${id}-name-${i}`}
                      value={line.pharmacyName}
                      onChange={(e) => setLine(i, { pharmacyName: e.target.value })}
                      placeholder="○○약국"
                      className="glass-input h-11 w-full rounded-xl px-3 text-[15px]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`${id}-biz-${i}`}
                      className="mb-1 block text-[13px] text-[var(--apple-secondary-label)]"
                    >
                      사업자등록번호
                    </label>
                    <input
                      id={`${id}-biz-${i}`}
                      value={line.pharmacyBizNo}
                      onChange={(e) => setLine(i, { pharmacyBizNo: formatBizNo(e.target.value) })}
                      inputMode="numeric"
                      placeholder="000-00-00000"
                      className="glass-input h-11 w-full rounded-xl px-3 text-[15px] tabular-nums"
                    />
                  </div>
                </div>

                <div className="mt-2">
                  <label
                    htmlFor={`${id}-supply-${i}`}
                    className="mb-1 block text-[13px] text-[var(--apple-secondary-label)]"
                  >
                    이 약국에 청구할 공급가액 <span className="text-[var(--apple-red)]">*</span>
                  </label>
                  <input
                    id={`${id}-supply-${i}`}
                    value={supply ? supply.toLocaleString("ko-KR") : ""}
                    onChange={(e) => setLine(i, { supplyAmount: digitsOnly(e.target.value) })}
                    inputMode="numeric"
                    placeholder="0"
                    className="glass-input h-11 w-full rounded-xl px-3 text-[15px] tabular-nums"
                  />
                  {supply > 0 && (
                    <p className="mt-1 text-[12px] tabular-nums text-[var(--apple-tertiary-label)]">
                      부가세 {vat.toLocaleString("ko-KR")}원 · 계산서 합계{" "}
                      <b>{(supply + vat).toLocaleString("ko-KR")}원</b>
                    </p>
                  )}
                </div>

                <div className="mt-2">
                  <label
                    htmlFor={`${id}-items-${i}`}
                    className="mb-1 block text-[13px] text-[var(--apple-secondary-label)]"
                  >
                    품목·수량
                  </label>
                  <textarea
                    id={`${id}-items-${i}`}
                    value={line.purchaseItems}
                    onChange={(e) => setLine(i, { purchaseItems: e.target.value })}
                    rows={2}
                    placeholder="예) 타이레놀500mg 20박스"
                    className="glass-input w-full rounded-xl px-3 py-2 text-[15px]"
                  />
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={addLine}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--apple-separator)] text-[14px] text-[var(--apple-blue)]"
          >
            <Plus className="size-4" /> 약국 추가
          </button>

          <p className="text-[12px] text-[var(--apple-tertiary-label)]">
            위의 비용 금액(우리가 매입한 돈)이 아니라, <b>약국에 청구할 금액</b>을 넣습니다.
            약국마다 계산서가 따로 나가므로 발행 체크도 약국별로 관리됩니다.
          </p>

          {value.lines.length > 1 && totals.supply > 0 && (
            <div className="space-y-1 rounded-lg bg-[rgba(0,122,255,0.06)] p-3 text-[13px]">
              <div className="flex justify-between">
                <span className="text-[var(--apple-secondary-label)]">
                  공급가액 합계 ({value.lines.length}곳)
                </span>
                <span className="tabular-nums">{totals.supply.toLocaleString("ko-KR")}원</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--apple-secondary-label)]">부가세 합계</span>
                <span className="tabular-nums">+{totals.vat.toLocaleString("ko-KR")}원</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-[rgba(0,0,0,0.08)] pt-1 font-semibold dark:border-[rgba(255,255,255,0.1)]">
                <span>계산서 총합</span>
                <span className="tabular-nums text-[var(--apple-blue)]">
                  {(totals.supply + totals.vat).toLocaleString("ko-KR")}원
                </span>
              </div>
            </div>
          )}

          {error && <p className="text-[12px] text-[var(--apple-red)]">{error}</p>}
        </div>
      )}
    </div>
  );
}

/** 제출 payload로 변환. 체크가 꺼져 있으면 줄은 보내지 않는다. */
export function toPurchasePayload(v: PurchaseFieldValues) {
  if (!v.isPurchase) return { isPurchase: false };
  return {
    isPurchase: true,
    purchaseLines: v.lines
      // 완전히 빈 줄은 무시한다 — 「약국 추가」를 눌렀다가 안 채운 경우.
      .filter((l) => l.pharmacyName.trim() || digitsOnly(l.supplyAmount))
      .map((l) => ({
        pharmacyName: l.pharmacyName.trim(),
        pharmacyBizNo: l.pharmacyBizNo.trim() || null,
        supplyAmount: Number(digitsOnly(l.supplyAmount)) || 0,
        purchaseItems: l.purchaseItems.trim() || null,
      })),
  };
}
