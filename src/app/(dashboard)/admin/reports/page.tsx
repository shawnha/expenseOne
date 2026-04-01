"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportSummaryCards } from "@/components/reports/report-summary-cards";
import { ReportLineChart } from "@/components/charts/report-line-chart";
import { ReportDonutChart } from "@/components/charts/report-donut-chart";
import { ReportStackBar } from "@/components/charts/report-stack-bar";
import { ReportDeptBar } from "@/components/charts/report-dept-bar";
import { ReportCompanyCompare } from "@/components/charts/report-company-compare";
import { ReportTopSubmitters } from "@/components/charts/report-top-submitters";
import { getPeriodDates } from "@/lib/utils/report-periods";
import type { PeriodPreset } from "@/lib/utils/report-periods";
import type { ExpenseType } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FilterValues {
  period: PeriodPreset;
  customStart: string;
  customEnd: string;
  type: ExpenseType | "ALL";
  companyId: string;
  department: string;
  category: string;
}

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface ReportData {
  summary: {
    totalAmount: number;
    totalCount: number;
    approvedCount: number;
    averageAmount: number;
    corporateCardRatio: number;
    depositRequestRatio: number;
  };
  comparison: {
    totalAmount: number;
    approvedCount: number;
    totalCount: number;
    averageAmount: number;
    corporateCardRatio: number;
  };
  monthlyTrend: { month: string; label: string; amount: number }[];
  categoryBreakdown: {
    category: string;
    amount: number;
    count: number;
    percentage: number;
  }[];
  typeRatio: {
    month: string;
    label: string;
    corporateCard: number;
    depositRequest: number;
    corporateCardAmount: number;
    depositRequestAmount: number;
  }[];
  departmentBreakdown: { department: string; amount: number; count: number }[];
  companyComparison: {
    companyId: string;
    name: string;
    slug: string;
    amount: number;
    count: number;
  }[];
  topSubmitters: {
    userId: string;
    name: string;
    profileImageUrl: string | null;
    amount: number;
    count: number;
  }[];
}

// ---------------------------------------------------------------------------
// Default filter state
// ---------------------------------------------------------------------------

const DEFAULT_FILTERS: FilterValues = {
  period: "this_month",
  customStart: "",
  customEnd: "",
  type: "ALL",
  companyId: "ALL",
  department: "ALL",
  category: "ALL",
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function AdminReportsPage() {
  const [filters, setFilters] = useState<FilterValues>(DEFAULT_FILTERS);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);

  // ── Fetch companies & departments on mount ──
  useEffect(() => {
    async function loadDropdownData() {
      try {
        const [compRes, deptRes] = await Promise.all([
          fetch("/api/companies"),
          fetch("/api/companies/departments"),
        ]);

        if (compRes.ok) {
          const json = await compRes.json();
          setCompanies(json.data ?? []);
        }

        if (deptRes.ok) {
          const json = await deptRes.json();
          setDepartments(json.data ?? []);
        }
      } catch {
        // silently fail – dropdowns will just be empty
      }
    }

    loadDropdownData();
  }, []);

  // ── Fetch report data on filter change ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const periodInfo = getPeriodDates(
        filters.period,
        filters.customStart || undefined,
        filters.customEnd || undefined,
      );

      const params = new URLSearchParams();
      params.set("startDate", periodInfo.current.startDate);
      params.set("endDate", periodInfo.current.endDate);
      params.set("prevStartDate", periodInfo.previous.startDate);
      params.set("prevEndDate", periodInfo.previous.endDate);
      if (filters.type !== "ALL") params.set("type", filters.type);
      if (filters.companyId !== "ALL") params.set("companyId", filters.companyId);
      if (filters.department !== "ALL") params.set("department", filters.department);
      if (filters.category !== "ALL") params.set("category", filters.category);

      const res = await fetch(`/api/admin/reports/data?${params.toString()}`);

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "데이터를 불러오지 못했습니다.");
      }

      const json = await res.json();
      setData(json.data ?? json);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.";
      setError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── CSV download ──
  const handleDownloadCsv = async () => {
    setDownloading(true);
    try {
      const periodInfo = getPeriodDates(
        filters.period,
        filters.customStart || undefined,
        filters.customEnd || undefined,
      );

      const params = new URLSearchParams();
      params.set("startDate", periodInfo.current.startDate);
      params.set("endDate", periodInfo.current.endDate);
      if (filters.type !== "ALL") params.set("type", filters.type);
      if (filters.category !== "ALL") params.set("category", filters.category);

      const res = await fetch(`/api/export/csv?${params.toString()}`);

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "다운로드 실패");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const contentDisposition = res.headers.get("Content-Disposition");
      const fileName =
        contentDisposition?.match(/filename="?(.+?)"?$/)?.[1] ??
        `expenses_${new Date().toISOString().slice(0, 10)}.csv`;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "다운로드에 실패했습니다.";
      alert(message);
    } finally {
      setDownloading(false);
    }
  };

  // ── Comparison label from period ──
  const periodInfo = getPeriodDates(
    filters.period,
    filters.customStart || undefined,
    filters.customEnd || undefined,
  );

  return (
    <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
      {/* Header */}
      <div className="animate-fade-up">
        <h1 className="text-title3 text-[var(--apple-label)]">리포트</h1>
        <p className="text-sm text-[var(--apple-secondary-label)] mt-0.5">
          비용 분석 대시보드
        </p>
      </div>

      {/* Filters */}
      <ReportFilters
        values={filters}
        onChange={setFilters}
        companies={companies}
        departments={departments}
        onDownloadCsv={handleDownloadCsv}
        downloading={downloading}
      />

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-[var(--apple-blue)]" />
        </div>
      ) : error ? (
        <div className="flex justify-center py-16">
          <p className="text-sm text-[var(--apple-secondary-label)]">{error}</p>
        </div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="animate-fade-up-1">
            <ReportSummaryCards
              current={data.summary}
              previous={data.comparison}
              comparisonLabel={periodInfo.label}
            />
          </div>

          {/* Monthly Trend (full width) */}
          <div className="animate-fade-up-1">
            <ReportLineChart data={data.monthlyTrend} />
          </div>

          {/* Donut + Stack Bar (2-col grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="animate-fade-up-1">
              <ReportDonutChart data={data.categoryBreakdown} />
            </div>
            <div className="animate-fade-up-1">
              <ReportStackBar data={data.typeRatio} />
            </div>
          </div>

          {/* Dept Bar + Company Compare (2-col grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="animate-fade-up-1">
              <ReportDeptBar data={data.departmentBreakdown} />
            </div>
            <div className="animate-fade-up-1">
              <ReportCompanyCompare data={data.companyComparison} />
            </div>
          </div>

          {/* Top Submitters (full width) */}
          <div className="animate-fade-up-1">
            <ReportTopSubmitters data={data.topSubmitters} />
          </div>
        </>
      ) : null}
    </div>
  );
}
