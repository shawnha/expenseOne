"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Download, Filter, Loader2 } from "lucide-react";
import { PERIOD_PRESETS } from "@/lib/utils/report-periods";
import type { PeriodPreset } from "@/lib/utils/report-periods";
import { CATEGORY_OPTIONS } from "@/lib/validations/expense-form";
import type { ExpenseType } from "@/types";

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface FilterValues {
  period: PeriodPreset;
  customStart: string;
  customEnd: string;
  type: ExpenseType | "ALL";
  companyId: string;
  department: string;
  category: string;
}

interface ReportFiltersProps {
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  companies: Company[];
  departments: string[];
  onDownloadCsv: () => void;
  downloading: boolean;
}

function DropdownFilters({
  values,
  onChange,
  companies,
  departments,
}: Pick<ReportFiltersProps, "values" | "onChange" | "companies" | "departments">) {
  return (
    <>
      {/* Type */}
      <Select
        value={values.type}
        onValueChange={(v) =>
          onChange({ ...values, type: (v ?? "ALL") as ExpenseType | "ALL" })
        }
      >
        <SelectTrigger className="h-8 rounded-full text-xs min-w-[110px]">
          <SelectValue placeholder="전체 유형" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체 유형</SelectItem>
          <SelectItem value="CORPORATE_CARD">법카사용</SelectItem>
          <SelectItem value="DEPOSIT_REQUEST">입금요청</SelectItem>
        </SelectContent>
      </Select>

      {/* Company */}
      <Select
        value={values.companyId}
        onValueChange={(v) => onChange({ ...values, companyId: v ?? "ALL" })}
      >
        <SelectTrigger className="h-8 rounded-full text-xs min-w-[110px]">
          <SelectValue placeholder="전체 회사" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체 회사</SelectItem>
          {companies.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Department */}
      <Select
        value={values.department}
        onValueChange={(v) => onChange({ ...values, department: v ?? "ALL" })}
      >
        <SelectTrigger className="h-8 rounded-full text-xs min-w-[110px]">
          <SelectValue placeholder="전체 부서" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체 부서</SelectItem>
          {departments.map((d) => (
            <SelectItem key={d} value={d}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Category */}
      <Select
        value={values.category}
        onValueChange={(v) => onChange({ ...values, category: v ?? "ALL" })}
      >
        <SelectTrigger className="h-8 rounded-full text-xs min-w-[120px]">
          <SelectValue placeholder="전체 카테고리" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체 카테고리</SelectItem>
          {CATEGORY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

function countActiveFilters(values: FilterValues): number {
  let count = 0;
  if (values.type !== "ALL") count++;
  if (values.companyId !== "ALL") count++;
  if (values.department !== "ALL") count++;
  if (values.category !== "ALL") count++;
  return count;
}

export function ReportFilters({
  values,
  onChange,
  companies,
  departments,
  onDownloadCsv,
  downloading,
}: ReportFiltersProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const activeCount = countActiveFilters(values);

  return (
    <div className="glass p-4 sm:p-5 flex flex-col gap-3">
      {/* ── Row 1: Period preset pills ── */}
      <div className="flex flex-wrap gap-1.5">
        {PERIOD_PRESETS.map((preset) => {
          const isSelected = values.period === preset.value;
          return (
            <button
              key={preset.value}
              onClick={() => onChange({ ...values, period: preset.value })}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                isSelected
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/20"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* ── Custom date inputs (shown when "직접 입력" selected) ── */}
      {values.period === "custom" && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={values.customStart}
            onChange={(e) => onChange({ ...values, customStart: e.target.value })}
            className="h-8 rounded-full text-xs w-auto"
          />
          <span className="text-xs text-muted-foreground">~</span>
          <Input
            type="date"
            value={values.customEnd}
            onChange={(e) => onChange({ ...values, customEnd: e.target.value })}
            className="h-8 rounded-full text-xs w-auto"
          />
        </div>
      )}

      {/* ── Row 2: Desktop dropdowns + CSV ── */}
      <div className="hidden sm:flex flex-wrap items-center gap-2">
        <DropdownFilters
          values={values}
          onChange={onChange}
          companies={companies}
          departments={departments}
        />
        <div className="ml-auto">
          <Button
            onClick={onDownloadCsv}
            disabled={downloading}
            size="sm"
            className="rounded-full bg-blue-500 hover:bg-blue-600 text-white text-xs h-8 px-4 gap-1.5"
          >
            {downloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            CSV 다운로드
          </Button>
        </div>
      </div>

      {/* ── Row 2: Mobile filter button + CSV ── */}
      <div className="flex sm:hidden items-center gap-2">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
            className="inline-flex items-center gap-1.5 rounded-full border border-input bg-transparent px-3 h-8 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Filter className="w-3.5 h-3.5" />
            필터
            {activeCount > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] font-bold leading-none">
                {activeCount}
              </span>
            )}
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl p-0">
            <SheetHeader className="px-5 pt-5 pb-3">
              <SheetTitle>필터</SheetTitle>
            </SheetHeader>
            <div className="px-5 pb-6 flex flex-col gap-3">
              <DropdownFilters
                values={values}
                onChange={onChange}
                companies={companies}
                departments={departments}
              />
              <Button
                onClick={() => {
                  setSheetOpen(false);
                }}
                size="sm"
                className="rounded-full bg-blue-500 hover:bg-blue-600 text-white text-xs h-9 mt-1"
              >
                적용
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <div className="ml-auto">
          <Button
            onClick={onDownloadCsv}
            disabled={downloading}
            size="sm"
            className="rounded-full bg-blue-500 hover:bg-blue-600 text-white text-xs h-8 px-4 gap-1.5"
          >
            {downloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            CSV
          </Button>
        </div>
      </div>
    </div>
  );
}
