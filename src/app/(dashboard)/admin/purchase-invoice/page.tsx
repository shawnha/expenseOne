import { redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { Download, AlertTriangle } from "lucide-react";
import { getCachedCurrentUser } from "@/lib/supabase/cached";
import { getPurchaseInvoiceSummary } from "@/services/expense.service";
import { AdminCompanyFilter } from "@/components/admin/company-filter";
import { InvoiceTable } from "./invoice-table";

// ---------------------------------------------------------------------------
// 사입 → 약국 세금계산서 발행 관리
//
// 사용자가 발행을 두 번 놓쳤다. 그래서 이 화면의 첫 화면은 "이번 달 합계"가
// 아니라 **아직 발행 안 한 것**이다. 미발행이 있으면 맨 위에 경고 줄이 뜨고,
// 미발행이 남은 달이 목록 위로 올라온다.
// ---------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function won(n: number) {
  return `${n.toLocaleString("ko-KR")}원`;
}

async function Content({ searchParams }: PageProps) {
  const user = await getCachedCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/");

  const sp = await searchParams;
  const company = typeof sp.company === "string" ? sp.company : undefined;
  const statusParam = typeof sp.status === "string" ? sp.status : "all";
  const status =
    statusParam === "unissued" || statusParam === "issued" ? statusParam : "all";

  const months = await getPurchaseInvoiceSummary({ company, status });

  const unissuedCount = months.reduce((a, m) => a + m.unissuedCount, 0);
  const unissuedTotal = months.reduce((a, m) => a + m.unissuedTotal, 0);
  const overdueMonths = months.filter(
    (m) => m.unissuedCount > 0 && m.dueDate < new Date().toISOString().slice(0, 10),
  );

  const csvParams = new URLSearchParams();
  if (company) csvParams.set("company", company);
  if (status !== "all") csvParams.set("status", status);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--apple-label)] sm:text-2xl">
            사입 세금계산서
          </h1>
          <p className="mt-1 text-[13px] text-[var(--apple-secondary-label)]">
            약국에 납품한 사입 건입니다. 발행 기한은 매입한 달의 <b>익월 10일</b>입니다.
          </p>
        </div>
        <Link
          href={`/api/export/purchase-invoice?${csvParams.toString()}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--apple-separator)] px-3.5 text-[13px] text-[var(--apple-label)]"
        >
          <Download className="size-4" /> CSV
        </Link>
      </div>

      {/* 아직 발행 안 한 것 — 이 화면의 본론 */}
      {unissuedCount > 0 && (
        <div
          className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border p-3 sm:p-4 ${
            overdueMonths.length > 0
              ? "border-[var(--apple-red)]/30 bg-[var(--apple-red)]/8"
              : "border-[var(--apple-orange)]/30 bg-[var(--apple-orange)]/8"
          }`}
        >
          <AlertTriangle
            className={`size-5 shrink-0 ${
              overdueMonths.length > 0
                ? "text-[var(--apple-red)]"
                : "text-[var(--apple-orange)]"
            }`}
          />
          <p className="text-sm font-medium text-[var(--apple-label)]">
            발행할 계산서 {unissuedCount}장 · {won(unissuedTotal)}
          </p>
          {overdueMonths.length > 0 && (
            <p className="text-sm font-semibold text-[var(--apple-red)]">
              기한 넘김: {overdueMonths.map((m) => m.yearMonth.replace("-", ".")).join(", ")}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <AdminCompanyFilter />
        <div className="flex gap-1.5">
          {[
            { key: "all", label: "전체" },
            { key: "unissued", label: "미발행" },
            { key: "issued", label: "발행 완료" },
          ].map((o) => {
            const params = new URLSearchParams();
            if (company) params.set("company", company);
            if (o.key !== "all") params.set("status", o.key);
            const active = status === o.key;
            return (
              <Link
                key={o.key}
                href={`/admin/purchase-invoice${params.toString() ? `?${params}` : ""}`}
                className={`inline-flex h-8 items-center rounded-full px-3.5 text-sm transition-colors ${
                  active
                    ? "bg-[var(--apple-blue)] text-white"
                    : "glass-input text-[var(--apple-label)]"
                }`}
              >
                {o.label}
              </Link>
            );
          })}
        </div>
      </div>

      <InvoiceTable months={months} />
    </div>
  );
}

export default function PurchaseInvoicePage(props: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4 animate-pulse">
          <div className="h-6 w-40 rounded-lg bg-[var(--apple-tertiary-system-fill)]" />
          <div className="h-16 rounded-2xl bg-[var(--apple-tertiary-system-fill)]" />
          <div className="h-64 rounded-2xl bg-[var(--apple-tertiary-system-fill)]" />
        </div>
      }
    >
      <Content {...props} />
    </Suspense>
  );
}
