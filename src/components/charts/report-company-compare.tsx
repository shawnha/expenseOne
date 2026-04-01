"use client";

export interface CompanyData {
  companyId: string;
  name: string;
  slug: string;
  amount: number;
  count: number;
}

interface Props {
  data: CompanyData[];
}

const SLUG_COLOR: Record<string, string> = {
  korea: "var(--apple-blue)",
  retail: "var(--apple-purple)",
};

const FALLBACK_COLORS = [
  "var(--apple-blue)",
  "var(--apple-green)",
  "var(--apple-orange)",
  "var(--apple-purple)",
  "var(--apple-red)",
  "var(--apple-teal)",
];

export function ReportCompanyCompare({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="border border-[var(--apple-separator)] rounded-xl p-4">
        <p className="text-[13px] font-semibold text-[var(--apple-label)] mb-3">회사별 비교</p>
        <div className="py-8 text-center text-sm text-[var(--apple-secondary-label)]">
          데이터가 없습니다
        </div>
      </div>
    );
  }

  const totalAmount = data.reduce((s, d) => s + d.amount, 1);

  return (
    <div className="border border-[var(--apple-separator)] rounded-xl p-4">
      <p className="text-[13px] font-semibold text-[var(--apple-label)] mb-3">회사별 비교</p>
      <div className="flex items-stretch gap-3 flex-wrap">
        {data.map((company, i) => {
          const color = SLUG_COLOR[company.slug] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
          const pct = ((company.amount / totalAmount) * 100).toFixed(1);

          return (
            <div key={company.companyId} className="flex-1 min-w-[120px]">
              {/* Company card */}
              <div
                className="flex flex-col gap-1 rounded-xl p-3 h-full"
                style={{ backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    className="text-[12px] font-semibold truncate"
                    style={{ color }}
                  >
                    {company.name}
                  </span>
                </div>
                <span className="text-[18px] font-bold text-[var(--apple-label)] tabular-nums leading-tight">
                  {company.amount.toLocaleString("ko-KR")}
                  <span className="text-[11px] font-normal ml-0.5">원</span>
                </span>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] text-[var(--apple-secondary-label)]">
                    {company.count}건
                  </span>
                  <span
                    className="text-[11px] font-semibold tabular-nums"
                    style={{ color }}
                  >
                    {pct}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Proportion bar */}
      {data.length >= 2 && (
        <div className="mt-3 h-2 flex rounded-full overflow-hidden">
          {data.map((company, i) => {
            const color = SLUG_COLOR[company.slug] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
            const pct = (company.amount / totalAmount) * 100;
            return (
              <div
                key={company.companyId}
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
