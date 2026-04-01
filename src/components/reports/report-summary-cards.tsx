"use client";

import { calcChangePercent } from "@/lib/utils/report-periods";
import { formatAmount } from "@/lib/validations/expense-form";

interface SummaryData {
  totalAmount: number;
  totalCount: number;
  approvedCount: number;
  averageAmount: number;
  corporateCardRatio: number;
  depositRequestRatio: number;
}

interface ReportSummaryCardsProps {
  current: SummaryData;
  previous: {
    totalAmount: number;
    approvedCount: number;
    totalCount: number;
    averageAmount: number;
    corporateCardRatio: number;
  };
  comparisonLabel: string;
}

interface ChangeIndicatorProps {
  current: number;
  previous: number;
  comparisonLabel: string;
}

function ChangeIndicator({ current, previous, comparisonLabel }: ChangeIndicatorProps) {
  const pct = calcChangePercent(current, previous);

  if (pct === null) {
    return (
      <span className="text-[10px] text-muted-foreground">
        — {comparisonLabel}
      </span>
    );
  }

  const isPositive = pct > 0;
  const isZero = pct === 0;

  return (
    <span
      className={`text-[10px] font-medium ${
        isZero
          ? "text-muted-foreground"
          : isPositive
          ? "text-green-500"
          : "text-red-500"
      }`}
    >
      {isZero ? "—" : isPositive ? "▲" : "▼"}{" "}
      {isZero ? "" : `${Math.abs(pct)}%`} {comparisonLabel}
    </span>
  );
}

const CARD_CONFIGS = [
  {
    label: "총 비용",
    bg: "bg-[rgba(0,122,255,0.05)] dark:bg-[rgba(0,122,255,0.1)]",
    accentColor: "text-[#007AFF]",
  },
  {
    label: "승인 건수",
    bg: "bg-[rgba(52,199,89,0.05)] dark:bg-[rgba(52,199,89,0.1)]",
    accentColor: "text-[#34C759]",
  },
  {
    label: "평균 금액",
    bg: "bg-[rgba(255,149,0,0.05)] dark:bg-[rgba(255,149,0,0.1)]",
    accentColor: "text-[#FF9500]",
  },
  {
    label: "법카:입금",
    bg: "bg-[rgba(88,86,214,0.05)] dark:bg-[rgba(88,86,214,0.1)]",
    accentColor: "text-[#5856D6]",
  },
] as const;

export function ReportSummaryCards({
  current,
  previous,
  comparisonLabel,
}: ReportSummaryCardsProps) {
  const cards = [
    {
      label: CARD_CONFIGS[0].label,
      bg: CARD_CONFIGS[0].bg,
      accentColor: CARD_CONFIGS[0].accentColor,
      value: `${formatAmount(current.totalAmount)}원`,
      changeEl: (
        <ChangeIndicator
          current={current.totalAmount}
          previous={previous.totalAmount}
          comparisonLabel={comparisonLabel}
        />
      ),
    },
    {
      label: CARD_CONFIGS[1].label,
      bg: CARD_CONFIGS[1].bg,
      accentColor: CARD_CONFIGS[1].accentColor,
      value: `${current.approvedCount}건`,
      changeEl: (
        <ChangeIndicator
          current={current.approvedCount}
          previous={previous.approvedCount}
          comparisonLabel={comparisonLabel}
        />
      ),
    },
    {
      label: CARD_CONFIGS[2].label,
      bg: CARD_CONFIGS[2].bg,
      accentColor: CARD_CONFIGS[2].accentColor,
      value: `${formatAmount(current.averageAmount)}원`,
      changeEl: (
        <ChangeIndicator
          current={current.averageAmount}
          previous={previous.averageAmount}
          comparisonLabel={comparisonLabel}
        />
      ),
    },
    {
      label: CARD_CONFIGS[3].label,
      bg: CARD_CONFIGS[3].bg,
      accentColor: CARD_CONFIGS[3].accentColor,
      value: `${Math.round(current.corporateCardRatio)}:${Math.round(current.depositRequestRatio)}`,
      changeEl: (
        <ChangeIndicator
          current={current.corporateCardRatio}
          previous={previous.corporateCardRatio}
          comparisonLabel={comparisonLabel}
        />
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((card, idx) => (
        <div
          key={card.label}
          className={`animate-card-enter rounded-2xl p-4 flex flex-col gap-1.5 ${card.bg}`}
          style={{ animationDelay: `${idx * 50}ms` }}
        >
          <span className="text-[11px] text-muted-foreground leading-none">
            {card.label}
          </span>
          <span
            className={`text-lg sm:text-xl font-bold leading-tight ${card.accentColor}`}
          >
            {card.value}
          </span>
          <div className="leading-none">{card.changeEl}</div>
        </div>
      ))}
    </div>
  );
}
