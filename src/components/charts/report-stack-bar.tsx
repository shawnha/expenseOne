"use client";

export interface TypeRatioData {
  month: string;
  label: string;
  corporateCard: number;
  depositRequest: number;
  corporateCardAmount: number;
  depositRequestAmount: number;
}

interface Props {
  data: TypeRatioData[];
}

function abbreviateAmount(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
  return `${amount}`;
}

export function ReportStackBar({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="border border-[var(--apple-separator)] rounded-xl p-4">
        <p className="text-[13px] font-semibold text-[var(--apple-label)] mb-3">유형별 비율</p>
        <div className="py-8 text-center text-sm text-[var(--apple-secondary-label)]">
          데이터가 없습니다
        </div>
      </div>
    );
  }

  return (
    <div className="border border-[var(--apple-separator)] rounded-xl p-4">
      <p className="text-[13px] font-semibold text-[var(--apple-label)] mb-3">유형별 비율</p>
      <div className="flex flex-col gap-3">
        {data.map((row) => {
          const total = row.corporateCardAmount + row.depositRequestAmount;
          const ccPct = total > 0 ? (row.corporateCardAmount / total) * 100 : 50;
          const drPct = total > 0 ? (row.depositRequestAmount / total) * 100 : 50;

          return (
            <div key={row.month} className="flex items-center gap-2">
              {/* Month label */}
              <span className="w-[36px] flex-shrink-0 text-[11px] text-[var(--apple-secondary-label)]">
                {row.label}
              </span>

              {/* Stacked bar */}
              <div className="flex-1 flex h-3 rounded-md overflow-hidden">
                {ccPct > 0 && (
                  <div
                    style={{ width: `${ccPct}%`, backgroundColor: "var(--apple-blue)" }}
                  />
                )}
                {drPct > 0 && (
                  <div
                    style={{ width: `${drPct}%`, backgroundColor: "var(--apple-orange)" }}
                  />
                )}
              </div>

              {/* Percentage label */}
              <span className="w-[48px] flex-shrink-0 text-right text-[11px] text-[var(--apple-secondary-label)] tabular-nums">
                {abbreviateAmount(total)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex gap-4">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "var(--apple-blue)" }} />
          <span className="text-[11px] text-[var(--apple-secondary-label)]">법인카드</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "var(--apple-orange)" }} />
          <span className="text-[11px] text-[var(--apple-secondary-label)]">입금요청</span>
        </div>
      </div>
    </div>
  );
}
