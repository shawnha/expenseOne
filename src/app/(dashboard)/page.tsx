import { getAuthUser, getCachedClient, getCachedCurrentUser } from "@/lib/supabase/cached";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/validations/expense-form";
import {
  DollarSign,
  FileText,
  Clock,
  CheckCircle2,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { ExpenseTabList } from "@/components/dashboard/expense-tab-list";

// ---------------------------------------------------------------------------
// Label maps
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function getDashboardData() {
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

  // This month range
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  // Build all queries (will execute in parallel)
  const approvedAmountQ = supabase
    .from("expenses")
    .select("amount")
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

  // Execute all 5 queries in parallel
  const [
    { data: approvedExpenses },
    { count: submittedCount },
    { count: pendingCount },
    { count: approvedCount },
    { data: recentExpenses },
  ] = await Promise.all([
    approvedAmountQ,
    submittedCountQ,
    pendingCountQ,
    approvedCountQ,
    recentQ,
  ]);

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
// Page component
// ---------------------------------------------------------------------------

const STAT_CONFIGS = [
  { icon: <DollarSign key="dollar" className="size-5 text-[#007AFF]" />, accent: "glass-card-accent glass-card-accent-blue", iconBg: "icon-container icon-container-blue" },
  { icon: <FileText key="file" className="size-5 text-[#5856D6]" />, accent: "glass-card-accent glass-card-accent-indigo", iconBg: "icon-container icon-container-indigo" },
  { icon: <Clock key="clock" className="size-5 text-[#FF9500]" />, accent: "glass-card-accent glass-card-accent-orange", iconBg: "icon-container icon-container-orange" },
  { icon: <CheckCircle2 key="check" className="size-5 text-[#34C759]" />, accent: "glass-card-accent glass-card-accent-green", iconBg: "icon-container icon-container-green" },
];

export default async function DashboardHomePage() {
  const {
    totalApproved,
    submittedCount,
    pendingCount,
    approvedCount,
    recentExpenses,
    userRole,
  } = await getDashboardData();

  const isAdmin = userRole === "ADMIN";
  const summaryCards = [
    { title: "이번 달 총 비용", value: `${formatAmount(totalApproved)}원`, href: "/expenses" },
    { title: "제출 건수", value: `${submittedCount}건`, href: "/expenses" },
    { title: "승인 대기", value: `${pendingCount}건`, href: isAdmin ? "/admin/pending" : "/expenses?status=SUBMITTED" },
    { title: "승인 완료", value: `${approvedCount}건`, href: isAdmin ? "/admin/expenses?status=APPROVED" : "/expenses?status=APPROVED" },
  ];

  return (
    <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6 pb-20 lg:pb-0">
      {/* Page header */}
      <div className="animate-fade-up">
        <h1 className="text-lg sm:text-xl lg:text-[22px] font-bold tracking-[-0.01em] text-[var(--apple-label)]">대시보드</h1>
        <p className="text-[13px] sm:text-sm text-[var(--apple-secondary-label)] mt-0.5">
          이번 달 비용 현황을 확인하세요.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {summaryCards.map((card, i) => (
          <Link
            key={card.title}
            href={card.href}
            className={cn(
              "glass-card p-3 sm:p-4 lg:p-5 group apple-press block",
              STAT_CONFIGS[i].accent,
              "animate-card-enter",
              `stagger-${i + 1}`
            )}
          >
            <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
              <div className={cn("size-8 sm:size-9 lg:size-10", STAT_CONFIGS[i].iconBg)}>
                {STAT_CONFIGS[i].icon}
              </div>
            </div>
            <p className="text-xl sm:text-2xl lg:text-[28px] font-bold tracking-[-0.02em] tabular-nums text-[var(--apple-label)] leading-tight">{card.value}</p>
            <p className="text-[11px] sm:text-xs lg:text-[13px] font-medium text-[var(--apple-secondary-label)] mt-1">{card.title}</p>
          </Link>
        ))}
      </div>

      {/* Tab filter + Recent expenses */}
      <ExpenseTabList expenses={recentExpenses} />

      {/* Floating action button */}
      <Link
        href="/expenses/new"
        className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-6 z-50 flex items-center justify-center size-14 rounded-full bg-[#007AFF] text-white shadow-[0_4px_16px_rgba(0,122,255,0.4)] hover:bg-[#0066d6] hover:shadow-[0_6px_20px_rgba(0,122,255,0.5)] hover:scale-105 active:scale-95 transition-all duration-200"
      >
        <Plus className="size-6" />
      </Link>
    </div>
  );
}
