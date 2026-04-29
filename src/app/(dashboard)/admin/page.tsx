"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DollarSign, Clock, CheckCircle2, XCircle } from "lucide-react";
import { AdminCompanyFilter } from "@/components/admin/company-filter";
import { MonthNavigator } from "@/components/dashboard/month-navigator";
import { formatAmount } from "@/lib/validations/expense-form";
import { getCategoryLabel } from "@/lib/utils/expense-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardStats {
  totalAmount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
}

interface CategoryBreakdown {
  category: string;
  label: string;
  amount: number;
}

interface MonthlyTrend {
  month: string;
  label: string;
  amount: number;
}

interface TopSubmitter {
  name: string;
  amount: number;
}

interface DashboardData {
  stats: DashboardStats;
  categoryBreakdown: CategoryBreakdown[];
  monthlyTrend: MonthlyTrend[];
  topSubmitters: TopSubmitter[];
}

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function isMonthKey(key: string): boolean {
  return /^\d{4}-\d{2}$/.test(key);
}

const STAT_CONFIGS = [
  { icon: <DollarSign key="d" className="size-5 text-[var(--apple-blue)]" />, accent: "glass-card-accent glass-card-accent-blue", iconBg: "icon-container icon-container-blue" },
  { icon: <Clock key="c" className="size-5 text-[var(--apple-orange)]" />, accent: "glass-card-accent glass-card-accent-orange", iconBg: "icon-container icon-container-orange" },
  { icon: <CheckCircle2 key="ch" className="size-5 text-[var(--apple-green)]" />, accent: "glass-card-accent glass-card-accent-green", iconBg: "icon-container icon-container-green" },
  { icon: <XCircle key="x" className="size-5 text-[var(--apple-red)]" />, accent: "glass-card-accent glass-card-accent-red", iconBg: "icon-container icon-container-red" },
];

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function AdminDashboardPage() {
  const searchParams = useSearchParams();
  const company = searchParams.get("company") ?? "";
  const [period, setPeriod] = useState(getCurrentMonthKey);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period });
      if (company) params.set("company", company);
      const res = await fetch(`/api/admin/dashboard?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      } else {
        setData(null);
        setError("대시보드 데이터를 불러오지 못했습니다.");
      }
    } catch {
      setData(null);
      setError("네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.");
    } finally {
      setLoading(false);
    }
  }, [period, company]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const stats = data?.stats ?? {
    totalAmount: 0,
    pendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
  };

  const categoryData = (data?.categoryBreakdown ?? []).map((c) => ({
    label: getCategoryLabel(c.category),
    value: c.amount,
  }));

  const monthlyData = (data?.monthlyTrend ?? []).map((m) => ({
    label: m.label,
    value: m.amount,
  }));

  const submitterData = (data?.topSubmitters ?? []).map((s) => ({
    label: s.name,
    value: s.amount,
  }));

  const statCards = [
    { title: "총 비용", value: `${formatAmount(stats.totalAmount)}원`, href: "/admin/expenses" },
    { title: "승인 대기", value: `${stats.pendingCount}건`, href: "/admin/pending" },
    { title: "승인 완료", value: `${stats.approvedCount}건`, href: "/admin/expenses?status=APPROVED" },
    { title: "반려", value: `${stats.rejectedCount}건`, href: "/admin/expenses?status=REJECTED" },
  ];

  return (
    <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-title3 text-[var(--apple-label)]">관리자 대시보드</h1>
            <p className="text-footnote text-[var(--apple-secondary-label)] mt-0.5">전체 비용 현황</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="기간 선택">
          <MonthNavigator
            value={isMonthKey(period) ? period : getCurrentMonthKey()}
            onChange={(m) => setPeriod(m)}
          />

          {/* Divider */}
          <div className="w-px h-5 bg-[var(--apple-separator)] mx-0.5" />

          {/* Aggregate period pills */}
          {[
            { value: "3_months", label: "3개월" },
            { value: "6_months", label: "6개월" },
            { value: "this_year", label: "올해" },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPeriod(opt.value)}
              className={`px-3 py-1 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors apple-press ${
                period === opt.value
                  ? "bg-[var(--apple-blue)] text-white"
                  : "bg-[var(--apple-fill)] text-[var(--apple-secondary-label)] hover:bg-[var(--apple-secondary-fill)]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Company Filter */}
      <div className="animate-fade-up">
        <AdminCompanyFilter />
      </div>

      {/* Error state */}
      {error && !loading && (
        <div className="glass p-6 text-center animate-fade-up-1">
          <p className="text-sm text-[var(--apple-secondary-label)] mb-3">{error}</p>
          <button
            type="button"
            onClick={fetchDashboard}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--apple-blue)] text-white text-sm font-medium hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)] transition-colors"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* Stat Cards */}
      <div className={`grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4 ${loading ? "opacity-60" : ""}`}>
        {statCards.map((card, i) => (
          <Link key={card.title} href={card.href} className={`block glass-card apple-press p-3 sm:p-4 lg:p-5 ${STAT_CONFIGS[i].accent} animate-card-enter stagger-${i + 1}`}>
            <div className="flex items-center gap-3 mb-3 sm:mb-4">
              <div className={`size-8 sm:size-9 lg:size-10 ${STAT_CONFIGS[i].iconBg}`}>
                {STAT_CONFIGS[i].icon}
              </div>
            </div>
            <p className="text-xl sm:text-2xl lg:text-[28px] font-bold tabular-nums tracking-[-0.02em] text-[var(--apple-label)] leading-tight">{card.value}</p>
            <p className="text-[11px] sm:text-xs lg:text-[13px] font-medium text-[var(--apple-secondary-label)] mt-1">{card.title}</p>
          </Link>
        ))}
      </div>

      {/* Charts — Bento Grid */}
      <div className="bento-grid animate-fade-up-2">
        <div className="bento-span-2">
          <LineChartSection title="월별 추이" data={monthlyData} />
        </div>
        <CategoryPieSection title="카테고리별 비용" data={categoryData} />
      </div>

      <div className="animate-fade-up-3">
        <BarSection title="팀원별 비용 상위 5명" data={submitterData} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart components
// ---------------------------------------------------------------------------

function BarSection({
  title,
  data,
}: {
  title: string;
  data: { label: string; value: number }[];
}) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="glass-card p-4 sm:p-5 lg:p-6">
      <h3 className="text-subheadline font-semibold text-[var(--apple-label)] mb-5">{title}</h3>
      {data.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--apple-secondary-label)]">데이터가 없습니다</p>
      ) : (
        <div className="space-y-4">
          {data.map((item, idx) => {
            const pct = (item.value / maxValue) * 100;
            return (
              <div key={item.label} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center size-6 rounded-full bg-[rgba(0,122,255,0.08)] text-[11px] font-bold text-[var(--apple-blue)] tabular-nums">
                      {idx + 1}
                    </span>
                    <span className="text-[13px] font-medium text-[var(--apple-label)]">{item.label}</span>
                  </div>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[var(--apple-label)]">
                    {formatAmount(item.value)}원
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[rgba(0,0,0,0.04)] dark:bg-[rgba(255,255,255,0.06)]">
                  <div
                    className="h-full rounded-full progress-bar-gradient-blue transition-all duration-700 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const CATEGORY_COLORS = ["#007AFF", "#34C759", "#FF9500", "#FF3B30", "#AF52DE", "#5AC8FA"];

function CategoryPieSection({
  title,
  data,
}: {
  title: string;
  data: { label: string; value: number }[];
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  const radius = 70;
  const strokeW = 18;
  const circumference = 2 * Math.PI * radius;
  const gapAngle = data.length > 1 ? 0.015 : 0;
  const segments = data.reduce<
    Array<{ label: string; value: number; pct: number; dashLength: number; offset: number; color: string }>
  >((acc, item, i) => {
    const accumulated = acc.reduce((s, x) => s + x.pct, 0);
    const pct = total > 0 ? item.value / total : 0;
    const dashLength = Math.max(0, pct - gapAngle) * circumference;
    const offset = -(accumulated + gapAngle / 2) * circumference + circumference * 0.25;
    acc.push({ ...item, pct, dashLength, offset, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] });
    return acc;
  }, []);

  const sorted = [...segments].sort((a, b) => b.value - a.value);

  return (
    <div className="glass-card p-4 sm:p-5 lg:p-6">
      <h3 className="text-subheadline font-semibold text-[var(--apple-label)] mb-5">{title}</h3>
      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--apple-secondary-label)]">데이터가 없습니다</p>
      ) : (
        <div className="flex flex-col items-center gap-5">
          {/* Donut chart */}
          <div className="relative shrink-0">
            <svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="카테고리별 비용 비율 도넛 차트">
              <circle
                cx="90" cy="90" r={radius}
                fill="none" stroke="var(--apple-separator)" strokeWidth={strokeW} opacity="0.1"
              />
              {segments.map((seg) => (
                <circle
                  key={seg.label}
                  cx="90" cy="90" r={radius}
                  fill="none" stroke={seg.color} strokeWidth={strokeW}
                  strokeLinecap="round"
                  strokeDasharray={`${seg.dashLength} ${circumference - seg.dashLength}`}
                  strokeDashoffset={seg.offset}
                  className="transition-all duration-700 ease-out"
                  style={{ filter: `drop-shadow(0 0 6px ${seg.color}33)` }}
                />
              ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] font-medium tracking-wider uppercase text-[var(--apple-secondary-label)]">합계</span>
              <span className="text-[14px] sm:text-[20px] font-bold text-[var(--apple-label)] tabular-nums tracking-tight leading-tight max-w-[100px] truncate">
                {formatAmount(total)}
              </span>
              <span className="text-[11px] text-[var(--apple-secondary-label)]">원</span>
            </div>
          </div>

          {/* Legend — below the chart */}
          <div className="w-full space-y-3">
            {sorted.map((item) => {
              const pctValue = total > 0 ? Math.round(item.pct * 100) : 0;
              return (
                <div key={item.label} className="flex items-center gap-2.5">
                  <span className="size-3 rounded-md shrink-0" style={{ backgroundColor: item.color, boxShadow: `0 0 8px ${item.color}40` }} />
                  <span className="text-[13px] font-medium text-[var(--apple-label)] shrink-0 min-w-[48px]">{item.label}</span>
                  <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-[rgba(0,0,0,0.04)] dark:bg-[rgba(255,255,255,0.06)]">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${pctValue}%`, backgroundColor: item.color }}
                    />
                  </div>
                  <span className="text-[13px] font-bold tabular-nums text-[var(--apple-label)] shrink-0 min-w-[36px] text-right">
                    {pctValue}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function LineChartSection({
  title,
  data,
}: {
  title: string;
  data: { label: string; value: number }[];
}) {
  if (data.length === 0) {
    return (
      <div className="glass-card p-4 sm:p-5 lg:p-6">
        <h3 className="text-subheadline font-semibold text-[var(--apple-label)] mb-5">{title}</h3>
        <p className="py-8 text-center text-sm text-[var(--apple-secondary-label)]">데이터가 없습니다</p>
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const latestValue = data[data.length - 1]?.value ?? 0;
  const prevValue = data.length >= 2 ? data[data.length - 2].value : latestValue;
  const changeRate = prevValue > 0 ? ((latestValue - prevValue) / prevValue) * 100 : 0;

  // Chart dimensions (use a wider aspect ratio for elegance)
  const chartW = 400;
  const chartH = 200;
  const padLeft = 8;
  const padRight = 8;
  const padTop = 24;
  const padBottom = 8;
  const innerW = chartW - padLeft - padRight;
  const innerH = chartH - padTop - padBottom;

  // Add 10% headroom above max for visual breathing room
  const ceiling = maxValue * 1.1;

  const points = data.map((item, i) => {
    const x = data.length === 1 ? padLeft + innerW / 2 : padLeft + (i / (data.length - 1)) * innerW;
    const y = padTop + innerH - (item.value / ceiling) * innerH;
    return { x, y, ...item };
  });

  // Build smooth cubic bezier curve through points
  function buildSmoothPath(pts: { x: number; y: number }[]): string {
    if (pts.length < 2) return `M ${pts[0].x} ${pts[0].y}`;
    if (pts.length === 2) {
      const mx = (pts[0].x + pts[1].x) / 2;
      return `M ${pts[0].x} ${pts[0].y} C ${mx} ${pts[0].y}, ${mx} ${pts[1].y}, ${pts[1].x} ${pts[1].y}`;
    }
    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const tension = 0.3;
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;
      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return path;
  }

  const curvePath = buildSmoothPath(points);
  const areaPath = `${curvePath} L ${points[points.length - 1].x} ${chartH - padBottom} L ${points[0].x} ${chartH - padBottom} Z`;

  // Y-axis grid values (show 3 subtle lines)
  const gridSteps = [0.25, 0.5, 0.75];

  return (
    <div className="glass-card p-4 sm:p-5 lg:p-6">
      {/* Header with title, latest value, and change indicator */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-subheadline font-semibold text-[var(--apple-label)]">{title}</h3>
          <div className="flex items-baseline gap-2 mt-1.5">
            <span className="text-[26px] font-bold tabular-nums tracking-tight text-[var(--apple-label)] leading-none">
              {formatAmount(latestValue)}
            </span>
            <span className="text-[14px] text-[var(--apple-secondary-label)]">원</span>
          </div>
        </div>
        {data.length >= 2 && changeRate !== 0 && (
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-full text-[12px] font-semibold tabular-nums"
            style={{
              backgroundColor: changeRate >= 0 ? "rgba(52,199,89,0.12)" : "rgba(255,59,48,0.12)",
              color: changeRate >= 0 ? "#34C759" : "#FF3B30",
            }}
          >
            <span>{changeRate >= 0 ? "\u2191" : "\u2193"}</span>
            <span>{Math.abs(Math.round(changeRate))}%</span>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${chartW} ${chartH}`}
          className="w-full"
          style={{ height: "180px" }}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="월별 비용 추이 라인 차트"
        >
          <defs>
            <linearGradient id="trendAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#007AFF" stopOpacity="0.2" />
              <stop offset="40%" stopColor="#5AC8FA" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#007AFF" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#007AFF" />
              <stop offset="100%" stopColor="#5AC8FA" />
            </linearGradient>
            <filter id="dotGlow">
              <feGaussianBlur stdDeviation="3" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="lineGlow">
              <feGaussianBlur stdDeviation="2" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Horizontal grid lines */}
          {gridSteps.map((pct) => {
            const y = padTop + innerH - pct * innerH;
            return (
              <line
                key={pct}
                x1={padLeft}
                x2={chartW - padRight}
                y1={y}
                y2={y}
                stroke="var(--apple-separator)"
                strokeWidth="0.5"
                opacity="0.5"
              />
            );
          })}
          {/* Baseline */}
          <line
            x1={padLeft}
            x2={chartW - padRight}
            y1={chartH - padBottom}
            y2={chartH - padBottom}
            stroke="var(--apple-separator)"
            strokeWidth="0.5"
            opacity="0.5"
          />

          {/* Area fill */}
          <path d={areaPath} fill="url(#trendAreaGradient)" />

          {/* Smooth curve with gradient */}
          <path
            d={curvePath}
            fill="none"
            stroke="url(#lineGradient)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#lineGlow)"
          />

          {/* Data points */}
          {points.map((p, i) => {
            const isLast = i === points.length - 1;
            return (
              <g key={p.label}>
                {/* Value label above point */}
                <text
                  x={p.x}
                  y={p.y - 12}
                  textAnchor="middle"
                  fill="var(--apple-secondary-label)"
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {p.value > 0 ? `${formatAmount(Math.round(p.value / 10000))}만` : "0"}
                </text>
                {/* Outer glow for last point */}
                {isLast && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="8"
                    fill="#007AFF"
                    opacity="0.12"
                  />
                )}
                {/* Point */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isLast ? "4.5" : "3.5"}
                  fill={isLast ? "#007AFF" : "white"}
                  stroke="#007AFF"
                  strokeWidth={isLast ? "0" : "2"}
                />
              </g>
            );
          })}
        </svg>

        {/* X-axis month labels */}
        <div className="flex justify-between mt-1" style={{ paddingLeft: `${(padLeft / chartW) * 100}%`, paddingRight: `${(padRight / chartW) * 100}%` }}>
          {points.map((p, i) => (
            <span
              key={p.label}
              className={`text-[12px] tabular-nums ${
                i === points.length - 1
                  ? "font-semibold text-[var(--apple-blue)]"
                  : "font-medium text-[var(--apple-secondary-label)]"
              }`}
            >
              {p.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
