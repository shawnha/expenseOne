import { Suspense } from "react";
import { getAuthUser, getCachedClient, getCachedCurrentUser } from "@/lib/supabase/cached";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/validations/expense-form";
import {
  DollarSign,
  FileText,
  Clock,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { ExpenseTabList } from "@/components/dashboard/expense-tab-list";
import { MonthNavigator } from "@/components/dashboard/month-navigator";
import { TiltCard } from "@/components/layout/tilt-card";

// ---------------------------------------------------------------------------
// Label maps
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function getDashboardData(monthKey?: string) {
  // DEV ONLY: Return mock data when auth is bypassed
  if (process.env.BYPASS_AUTH === 'true') {
    return {
      totalApproved: 1250000,
      submittedCount: 12,
      pendingCount: 3,
      approvedCount: 8,
      recentExpenses: [
        { id: "1", title: "3월 사무용품 구매", amount: 45000, status: "APPROVED", type: "CORPORATE_CARD", created_at: "2026-03-10T09:00:00Z" },
        { id: "2", title: "외주 개발비 지급", amount: 500000, status: "SUBMITTED", type: "DEPOSIT_REQUEST", created_at: "2026-03-09T14:30:00Z" },
        { id: "3", title: "팀 점심 식대", amount: 120000, status: "APPROVED", type: "CORPORATE_CARD", created_at: "2026-03-08T12:00:00Z" },
        { id: "4", title: "서버 호스팅 비용", amount: 330000, status: "REJECTED", type: "DEPOSIT_REQUEST", created_at: "2026-03-07T10:00:00Z" },
        { id: "5", title: "교통비 정산", amount: 25000, status: "APPROVED", type: "CORPORATE_CARD", created_at: "2026-03-06T16:00:00Z" },
      ],
      userRole: "ADMIN" as const,
    };
  }

  const supabase = await getCachedClient();
  const authUser = await getAuthUser();

  if (!authUser) {
    return {
      totalApproved: 0,
      submittedCount: 0,
      pendingCount: 0,
      approvedCount: 0,
      recentExpenses: [],
      userRole: "MEMBER" as const,
    };
  }

  // Get user role from cached profile (avoids duplicate DB query)
  const cachedUser = await getCachedCurrentUser();
  const userRole = cachedUser?.role ?? "MEMBER";

  // Month range (from monthKey like "2026-03" or current month)
  const now = new Date();
  let targetYear = now.getFullYear();
  let targetMonth = now.getMonth();
  if (monthKey && /^\d{4}-\d{2}$/.test(monthKey)) {
    const [y, m] = monthKey.split("-").map(Number);
    targetYear = y;
    targetMonth = m - 1;
  }
  const startOfMonth = new Date(targetYear, targetMonth, 1).toISOString();
  const endOfMonth = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59).toISOString();

  // Build all queries (will execute in parallel)
  // Use Supabase RPC-style sum via single-row select for approved amount
  const approvedAmountQ = supabase
    .from("expenses")
    .select("amount", { count: "exact", head: false })
    .eq("status", "APPROVED")
    .eq("submitted_by_id", authUser.id)
    .gte("created_at", startOfMonth)
    .lte("created_at", endOfMonth);

  const submittedCountQ = supabase
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .eq("submitted_by_id", authUser.id)
    .gte("created_at", startOfMonth)
    .lte("created_at", endOfMonth);

  // ADMIN sees team-wide pending; MEMBER sees own
  let pendingCountQ = supabase
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .eq("status", "SUBMITTED");
  if (userRole === "MEMBER") {
    pendingCountQ = pendingCountQ.eq("submitted_by_id", authUser.id);
  }

  const approvedCountQ = supabase
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .eq("status", "APPROVED")
    .eq("submitted_by_id", authUser.id)
    .gte("created_at", startOfMonth)
    .lte("created_at", endOfMonth);

  const recentQ = supabase
    .from("expenses")
    .select("id, title, amount, status, type, created_at, is_urgent")
    .eq("submitted_by_id", authUser.id)
    .order("created_at", { ascending: false })
    .limit(5);

  // Execute all 5 queries in parallel with a hard timeout. If a query hangs
  // (PostgREST stall, pooler exhaustion, network blip), we don't want users
  // staring at a permanent skeleton — we'd rather show zeros and let them
  // refresh. The retry on next request usually succeeds.
  const QUERY_TIMEOUT_MS = 8000;
  const timeoutPromise = new Promise<{ data: null; count: null }>((resolve) =>
    setTimeout(() => {
      console.error("[Dashboard] query timeout, falling back to zeros");
      resolve({ data: null, count: null });
    }, QUERY_TIMEOUT_MS),
  );

  const [
    approvedExpensesRes,
    submittedCountRes,
    pendingCountRes,
    approvedCountRes,
    recentExpensesRes,
  ] = await Promise.all([
    Promise.race([approvedAmountQ.then((r) => ({ data: r.data, count: r.count })), timeoutPromise]),
    Promise.race([submittedCountQ.then((r) => ({ data: r.data, count: r.count })), timeoutPromise]),
    Promise.race([pendingCountQ.then((r) => ({ data: r.data, count: r.count })), timeoutPromise]),
    Promise.race([approvedCountQ.then((r) => ({ data: r.data, count: r.count })), timeoutPromise]),
    Promise.race([recentQ.then((r) => ({ data: r.data, count: r.count })), timeoutPromise]),
  ]);

  const approvedExpenses = approvedExpensesRes.data ?? [];
  const submittedCount = submittedCountRes.count ?? 0;
  const pendingCount = pendingCountRes.count ?? 0;
  const approvedCount = approvedCountRes.count ?? 0;
  const recentExpenses = recentExpensesRes.data ?? [];

  const totalApproved = (approvedExpenses ?? []).reduce(
    (sum, e) => sum + (e.amount ?? 0),
    0
  );

  return {
    totalApproved,
    submittedCount: submittedCount ?? 0,
    pendingCount: pendingCount ?? 0,
    approvedCount: approvedCount ?? 0,
    recentExpenses: recentExpenses ?? [],
    userRole,
  };
}

// ---------------------------------------------------------------------------
// Stat card config
// ---------------------------------------------------------------------------

const STAT_CONFIGS = [
  { icon: <DollarSign key="dollar" className="size-5 text-[var(--apple-blue)]" />, accent: "glass-card-accent glass-card-accent-blue", iconBg: "icon-container icon-container-blue" },
  { icon: <FileText key="file" className="size-5 text-[var(--apple-indigo)]" />, accent: "glass-card-accent glass-card-accent-indigo", iconBg: "icon-container icon-container-indigo" },
  { icon: <Clock key="clock" className="size-5 text-[var(--apple-orange)]" />, accent: "glass-card-accent glass-card-accent-orange", iconBg: "icon-container icon-container-orange" },
  { icon: <CheckCircle2 key="check" className="size-5 text-[var(--apple-green)]" />, accent: "glass-card-accent glass-card-accent-green", iconBg: "icon-container icon-container-green" },
];

// ---------------------------------------------------------------------------
// Skeleton fallback for Suspense streaming
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <>
      {/* Skeleton stat cards — 2x2 on mobile, 4-col on desktop */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {STAT_CONFIGS.map((cfg, i) => (
          <div
            key={i}
            className={cn(
              "glass-card p-3 sm:p-4 lg:p-5",
              cfg.accent,
            )}
          >
            <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
              <div className={cn("size-8 sm:size-9 lg:size-10 animate-pulse rounded-xl bg-[var(--apple-fill)]")} />
            </div>
            <div className="h-7 sm:h-8 lg:h-9 w-24 animate-pulse rounded-lg bg-[var(--apple-fill)]" />
            <div className="h-3 sm:h-3.5 w-16 animate-pulse rounded-md bg-[var(--apple-fill)] mt-2" />
          </div>
        ))}
      </div>

      {/* Skeleton recent expenses list */}
      <div className="glass-card p-3 sm:p-4 lg:p-5">
        {/* Tab bar placeholder */}
        <div className="flex gap-2 mb-4">
          <div className="h-8 w-16 animate-pulse rounded-full bg-[var(--apple-fill)]" />
          <div className="h-8 w-20 animate-pulse rounded-full bg-[var(--apple-fill)]" />
          <div className="h-8 w-20 animate-pulse rounded-full bg-[var(--apple-fill)]" />
        </div>
        {/* Row placeholders */}
        {[0, 1, 2, 3].map((j) => (
          <div key={j} className="flex items-center justify-between py-3 border-b border-[var(--apple-separator)] last:border-b-0">
            <div className="flex flex-col gap-1.5">
              <div className="h-4 w-32 sm:w-44 animate-pulse rounded-md bg-[var(--apple-fill)]" />
              <div className="h-3 w-20 animate-pulse rounded-md bg-[var(--apple-fill)]" />
            </div>
            <div className="h-5 w-20 animate-pulse rounded-md bg-[var(--apple-fill)]" />
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Async dashboard content (streamed via Suspense)
// ---------------------------------------------------------------------------

async function DashboardContent({ month }: { month?: string }) {
  const {
    totalApproved,
    submittedCount,
    pendingCount,
    approvedCount,
    recentExpenses,
    userRole,
  } = await getDashboardData(month);

  const isAdmin = userRole === "ADMIN";
  const summaryCards = [
    { title: "총 비용", value: `${formatAmount(totalApproved)}원`, href: "/expenses" },
    { title: "제출 건수", value: `${submittedCount}건`, href: "/expenses" },
    { title: "승인 대기", value: `${pendingCount}건`, href: isAdmin ? "/admin/pending" : "/expenses?status=SUBMITTED" },
    { title: "승인 완료", value: `${approvedCount}건`, href: isAdmin ? "/admin/expenses?status=APPROVED" : "/expenses?status=APPROVED" },
  ];

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {summaryCards.map((card, i) => (
          <TiltCard key={card.title}>
            <Link
              href={card.href}
              aria-label={`${card.title}: ${card.value}`}
              className={cn(
                "glass-card p-3 sm:p-4 lg:p-5 group apple-press block",
                STAT_CONFIGS[i].accent,
                "animate-card-enter",
                `stagger-${i + 1}`
              )}
            >
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <div className={cn("size-8 sm:size-9 lg:size-10", STAT_CONFIGS[i].iconBg)} aria-hidden="true">
                  {STAT_CONFIGS[i].icon}
                </div>
              </div>
              <p className="text-xl sm:text-2xl lg:text-[28px] font-bold tracking-[-0.02em] tabular-nums text-[var(--apple-label)] leading-tight">{card.value}</p>
              <p className="text-[11px] sm:text-xs lg:text-[13px] font-medium text-[var(--apple-secondary-label)] mt-1">{card.title}</p>
            </Link>
          </TiltCard>
        ))}
      </div>

      {/* Tab filter + Recent expenses */}
      <ExpenseTabList expenses={recentExpenses} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;

  return (
    <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6 pb-20 lg:pb-0">
      {/* Page header — renders immediately */}
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="text-title3 lg:text-title2 text-[var(--apple-label)]">대시보드</h1>
          <p className="text-footnote sm:text-callout text-[var(--apple-secondary-label)] mt-0.5">
            비용 현황을 확인하세요.
          </p>
        </div>
        <MonthNavigator />
      </div>

      {/* Data-dependent content — streamed via Suspense */}
      <Suspense key={month ?? "current"} fallback={<DashboardSkeleton />}>
        <DashboardContent month={month} />
      </Suspense>

    </div>
  );
}
