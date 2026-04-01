"use client";

import { useMemo } from "react";

export interface MonthlyTrendData {
  month: string;
  label: string;
  amount: number;
}

interface Props {
  data: MonthlyTrendData[];
}

function abbreviateAmount(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
  return `${amount}`;
}

export function ReportLineChart({ data }: Props) {
  const W = 520;
  const H = 200;
  const PADDING = { top: 32, right: 24, bottom: 36, left: 12 };

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null;

    const max = Math.max(...data.map((d) => d.amount), 1);
    const xs = data.map(
      (_, i) =>
        PADDING.left +
        (i / Math.max(data.length - 1, 1)) * (W - PADDING.left - PADDING.right)
    );
    const ys = data.map(
      (d) => PADDING.top + (1 - d.amount / max) * (H - PADDING.top - PADDING.bottom)
    );

    // Smooth cubic bezier path
    let path = `M ${xs[0]} ${ys[0]}`;
    for (let i = 1; i < xs.length; i++) {
      const cpX = (xs[i - 1] + xs[i]) / 2;
      path += ` C ${cpX} ${ys[i - 1]}, ${cpX} ${ys[i]}, ${xs[i]} ${ys[i]}`;
    }

    // Fill area
    const fillPath =
      `${path} L ${xs[xs.length - 1]} ${H - PADDING.bottom} L ${xs[0]} ${H - PADDING.bottom} Z`;

    return { xs, ys, path, fillPath, max };
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <div className="border border-[var(--apple-separator)] rounded-xl p-4">
        <p className="text-[13px] font-semibold text-[var(--apple-label)] mb-3">월별 비용 추이</p>
        <div className="py-8 text-center text-sm text-[var(--apple-secondary-label)]">
          데이터가 없습니다
        </div>
      </div>
    );
  }

  const { xs, ys, path, fillPath } = chartData!;
  const gradientId = "lineGradient";
  const gridCount = 4;
  const chartH = H - PADDING.top - PADDING.bottom;

  return (
    <div className="border border-[var(--apple-separator)] rounded-xl p-4">
      <p className="text-[13px] font-semibold text-[var(--apple-label)] mb-3">월별 비용 추이</p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        aria-label="월별 비용 추이 차트"
        role="img"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--apple-blue)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--apple-blue)" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {Array.from({ length: gridCount }).map((_, i) => {
          const y = PADDING.top + (i / (gridCount - 1)) * chartH;
          return (
            <line
              key={i}
              x1={PADDING.left}
              y1={y}
              x2={W - PADDING.right}
              y2={y}
              stroke="var(--apple-separator)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          );
        })}

        {/* Fill area */}
        <path d={fillPath} fill={`url(#${gradientId})`} />

        {/* Line */}
        <path
          d={path}
          fill="none"
          stroke="var(--apple-blue)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {xs.map((x, i) => (
          <circle
            key={i}
            cx={x}
            cy={ys[i]}
            r="4"
            fill="var(--apple-blue)"
            stroke="white"
            strokeWidth="2"
          />
        ))}

        {/* Value labels above points */}
        {xs.map((x, i) => (
          <text
            key={i}
            x={x}
            y={ys[i] - 10}
            textAnchor="middle"
            fontSize="10"
            fill="var(--apple-secondary-label)"
            className="tabular-nums"
          >
            {abbreviateAmount(data[i].amount)}
          </text>
        ))}

        {/* X-axis month labels */}
        {xs.map((x, i) => (
          <text
            key={i}
            x={x}
            y={H - PADDING.bottom + 16}
            textAnchor="middle"
            fontSize="11"
            fill="var(--apple-secondary-label)"
          >
            {data[i].label}
          </text>
        ))}
      </svg>
    </div>
  );
}
