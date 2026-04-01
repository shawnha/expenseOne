"use client";

import { useMemo } from "react";
import { getCategoryLabel } from "@/lib/utils/expense-utils";

export interface CategoryData {
  category: string;
  amount: number;
  count: number;
  percentage: number;
}

interface Props {
  data: CategoryData[];
}

const COLORS = [
  "var(--apple-blue)",
  "var(--apple-green)",
  "var(--apple-orange)",
  "var(--apple-purple)",
  "var(--apple-red)",
  "var(--apple-teal)",
];

function formatKRW(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function ReportDonutChart({ data }: Props) {
  const size = 120;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 50;
  const innerR = 32;
  const strokeW = outerR - innerR;
  const r = (outerR + innerR) / 2;
  const circumference = 2 * Math.PI * r;

  const arcs = useMemo(() => {
    if (!data || data.length === 0) return [];
    let cumPct = 0;
    return data.map((d, i) => {
      const startPct = cumPct;
      cumPct += d.percentage;
      const startAngle = startPct * 3.6;
      const endAngle = cumPct * 3.6;
      return {
        ...d,
        color: COLORS[i % COLORS.length],
        startAngle,
        endAngle,
        dasharray: `${(d.percentage / 100) * circumference} ${circumference}`,
        dashoffset: -((startPct / 100) * circumference),
      };
    });
  }, [data, circumference]);

  const totalCount = data?.reduce((s, d) => s + d.count, 0) ?? 0;

  if (!data || data.length === 0) {
    return (
      <div className="border border-[var(--apple-separator)] rounded-xl p-4">
        <p className="text-[13px] font-semibold text-[var(--apple-label)] mb-3">카테고리별 분포</p>
        <div className="py-8 text-center text-sm text-[var(--apple-secondary-label)]">
          데이터가 없습니다
        </div>
      </div>
    );
  }

  return (
    <div className="border border-[var(--apple-separator)] rounded-xl p-4">
      <p className="text-[13px] font-semibold text-[var(--apple-label)] mb-3">카테고리별 분포</p>
      <div className="flex items-center gap-4 flex-wrap">
        {/* Donut */}
        <div className="flex-shrink-0">
          <svg
            viewBox={`0 0 ${size} ${size}`}
            width={size}
            height={size}
            aria-label="카테고리별 분포 도넛 차트"
            role="img"
          >
            {/* Background circle */}
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="var(--apple-separator)"
              strokeWidth={strokeW}
            />
            {/* Arc segments */}
            {arcs.map((arc, i) => (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={arc.color}
                strokeWidth={strokeW}
                strokeDasharray={arc.dasharray}
                strokeDashoffset={arc.dashoffset}
                strokeLinecap="butt"
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            ))}
            {/* Center text */}
            <text
              x={cx}
              y={cy - 6}
              textAnchor="middle"
              fontSize="18"
              fontWeight="700"
              fill="var(--apple-label)"
              className="tabular-nums"
            >
              {totalCount}
            </text>
            <text
              x={cx}
              y={cy + 10}
              textAnchor="middle"
              fontSize="10"
              fill="var(--apple-secondary-label)"
            >
              건
            </text>
          </svg>
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          {arcs.map((arc, i) => (
            <div key={i} className="flex items-center gap-2 min-w-0">
              <span
                className="flex-shrink-0 w-2 h-2 rounded-full"
                style={{ backgroundColor: arc.color }}
              />
              <span className="text-[12px] text-[var(--apple-label)] truncate flex-1">
                {getCategoryLabel(arc.category)}
              </span>
              <span className="text-[12px] font-semibold text-[var(--apple-label)] tabular-nums flex-shrink-0">
                {arc.percentage.toFixed(1)}%
              </span>
            </div>
          ))}
          {arcs.length > 0 && (
            <div className="mt-1 pt-1 border-t border-[var(--apple-separator)]">
              <span className="text-[11px] text-[var(--apple-secondary-label)]">
                합계: {formatKRW(data.reduce((s, d) => s + d.amount, 0))}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
