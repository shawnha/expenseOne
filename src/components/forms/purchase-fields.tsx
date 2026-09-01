"use client";

import { useId } from "react";

// ---------------------------------------------------------------------------
// 사입 체크 + 약국 세금계산서 정보
//
// 법카·입금요청 두 폼이 같이 쓴다. 체크했을 때만 입력란이 열린다 — 대부분의
// 비용은 사입이 아니라서, 항상 펼쳐두면 폼만 길어진다.
//
// **공급가액은 비용 금액과 다르다.** 비용은 우리가 물건을 사며 나간 돈이고,
// 여기 넣는 건 약국에 청구할 돈이다(마진 포함). 헷갈리기 쉬워서 라벨과 도움말로
// 명시하고, 부가세·합계를 즉시 계산해 보여준다.
// ---------------------------------------------------------------------------

export interface PurchaseFieldValues {
  isPurchase: boolean;
  pharmacyName: string;
  pharmacyBizNo: string;
  supplyAmount: string;
  purchaseItems: string;
}

interface Props {
  value: PurchaseFieldValues;
  onChange: (patch: Partial<PurchaseFieldValues>) => void;
  /** 필드별 오류 메시지. 서버/클라 검증 결과를 그대로 받는다. */
  errors?: Partial<Record<keyof PurchaseFieldValues, string>>;
}

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

const VAT_RATE = 0.1;

export function PurchaseFields({ value, onChange, errors }: Props) {
  const id = useId();
  const supply = Number(digitsOnly(value.supplyAmount)) || 0;
  const vat = Math.round(supply * VAT_RATE);
  const total = supply + vat;

  return (
    <div className="rounded-2xl border border-[var(--apple-separator)] p-3 sm:p-4">
      <label className="flex cursor-pointer select-none items-start gap-2">
        <input
          type="checkbox"
          checked={value.isPurchase}
          onChange={(e) => onChange({ isPurchase: e.target.checked })}
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`${id}-pharmacy`}
                className="mb-1 block text-[13px] text-[var(--apple-secondary-label)]"
              >
                납품처 약국명 <span className="text-[var(--apple-red)]">*</span>
              </label>
              <input
                id={`${id}-pharmacy`}
                value={value.pharmacyName}
                onChange={(e) => onChange({ pharmacyName: e.target.value })}
                placeholder="○○약국"
                className="glass-input h-11 w-full rounded-xl px-3 text-[15px]"
              />
              {errors?.pharmacyName && (
                <p className="mt-1 text-[12px] text-[var(--apple-red)]">
                  {errors.pharmacyName}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor={`${id}-bizno`}
                className="mb-1 block text-[13px] text-[var(--apple-secondary-label)]"
              >
                사업자등록번호
              </label>
              <input
                id={`${id}-bizno`}
                value={value.pharmacyBizNo}
                onChange={(e) => onChange({ pharmacyBizNo: formatBizNo(e.target.value) })}
                inputMode="numeric"
                placeholder="000-00-00000"
                className="glass-input h-11 w-full rounded-xl px-3 text-[15px] tabular-nums"
              />
              {errors?.pharmacyBizNo && (
                <p className="mt-1 text-[12px] text-[var(--apple-red)]">
                  {errors.pharmacyBizNo}
                </p>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor={`${id}-supply`}
              className="mb-1 block text-[13px] text-[var(--apple-secondary-label)]"
            >
              약국에 청구할 공급가액 <span className="text-[var(--apple-red)]">*</span>
            </label>
            <input
              id={`${id}-supply`}
              value={value.supplyAmount ? Number(digitsOnly(value.supplyAmount)).toLocaleString("ko-KR") : ""}
              onChange={(e) => onChange({ supplyAmount: digitsOnly(e.target.value) })}
              inputMode="numeric"
              placeholder="0"
              className="glass-input h-11 w-full rounded-xl px-3 text-[15px] tabular-nums"
            />
            <p className="mt-1 text-[12px] text-[var(--apple-tertiary-label)]">
              위의 비용 금액(우리가 매입한 돈)이 아니라, <b>약국에 청구할 금액</b>입니다.
            </p>
            {errors?.supplyAmount && (
              <p className="mt-1 text-[12px] text-[var(--apple-red)]">
                {errors.supplyAmount}
              </p>
            )}

            {supply > 0 && (
              <div className="mt-2 space-y-1 rounded-lg bg-[rgba(0,122,255,0.06)] p-3 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-[var(--apple-secondary-label)]">공급가액</span>
                  <span className="tabular-nums">{supply.toLocaleString("ko-KR")}원</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--apple-secondary-label)]">부가세 (10%)</span>
                  <span className="tabular-nums">+{vat.toLocaleString("ko-KR")}원</span>
                </div>
                <div className="mt-1 flex justify-between border-t border-[rgba(0,0,0,0.08)] pt-1 font-semibold dark:border-[rgba(255,255,255,0.1)]">
                  <span>계산서 합계</span>
                  <span className="tabular-nums text-[var(--apple-blue)]">
                    {total.toLocaleString("ko-KR")}원
                  </span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor={`${id}-items`}
              className="mb-1 block text-[13px] text-[var(--apple-secondary-label)]"
            >
              품목·수량
            </label>
            <textarea
              id={`${id}-items`}
              value={value.purchaseItems}
              onChange={(e) => onChange({ purchaseItems: e.target.value })}
              rows={2}
              placeholder="예) 타이레놀500mg 20박스, 마스크 10박스"
              className="glass-input w-full rounded-xl px-3 py-2 text-[15px]"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** 폼 초기값. */
export const emptyPurchaseFields: PurchaseFieldValues = {
  isPurchase: false,
  pharmacyName: "",
  pharmacyBizNo: "",
  supplyAmount: "",
  purchaseItems: "",
};

/** 제출 payload로 변환. 체크가 꺼져 있으면 나머지는 보내지 않는다. */
export function toPurchasePayload(v: PurchaseFieldValues) {
  if (!v.isPurchase) return { isPurchase: false };
  const supply = Number(digitsOnly(v.supplyAmount)) || 0;
  return {
    isPurchase: true,
    pharmacyName: v.pharmacyName.trim() || null,
    pharmacyBizNo: v.pharmacyBizNo.trim() || null,
    supplyAmount: supply > 0 ? supply : null,
    purchaseItems: v.purchaseItems.trim() || null,
  };
}
