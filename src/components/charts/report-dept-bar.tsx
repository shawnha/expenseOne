"use client";

export interface DeptData {
  department: string;
  amount: number;
  count: number;
}

interface Props {
  data: DeptData[];
}

const BAR_COLORS = [
  "var(--apple-blue)",
  "var(--apple-green)",
  "var(--apple-orange)",
  "var(--apple-purple)",
  "var(--apple-red)",
  "var(--apple-teal)",
];

export function ReportDeptBar({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="border border-[var(--apple-separator)] rounded-xl p-4">
        <p className="text-[13px] font-semibold text-[var(--apple-label)] mb-3">부서별 지출</p>
        <div className="py-8 text-center text-sm text-[var(--apple-secondary-label)]">
          데이터가 없습니다
        </div>
      </div>
    );
  }

  const maxAmount = Math.max(...data.map((d) => d.amount), 1);

  return (
    <div className="border border-[var(--apple-separator)] rounded-xl p-4">
      <p className="text-[13px] font-semibold text-[var(--apple-label)] mb-3">부서별 지출</p>
      <div className="flex flex-col gap-3">
        {data.map((dept, i) => {
          const pct = (dept.amount / maxAmount) * 100;
          const color = BAR_COLORS[i % BAR_COLORS.length];

          return (
            <div key={dept.department} className="flex flex-col gap-1">
              {/* Header row */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[12px] font-medium text-[var(--apple-label)] truncate">
                    {dept.department || "미지정"}
                  </span>
                  <span className="text-[11px] text-[var(--apple-secondary-label)] flex-shrink-0">
                    {dept.count}건
                  </span>
                </div>
                <span className="text-[12px] font-semibold text-[var(--apple-label)] tabular-nums flex-shrink-0">
                  {dept.amount.toLocaleString("ko-KR")}원
                </span>
              </div>

              {/* Bar */}
              <div className="h-2 w-full rounded-full" style={{ backgroundColor: "var(--apple-separator)" }}>
                <div
                  className="h-2 rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
