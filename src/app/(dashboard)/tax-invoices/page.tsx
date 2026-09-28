import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCachedCurrentUser } from "@/lib/supabase/cached";
import { listTaxInvoiceRequests } from "@/services/tax-invoice.service";
import { TaxInvoiceList } from "@/components/tax-invoices/tax-invoice-list";

// 세금계산서 발행 요청 목록. 관리자는 전부, 나머지는 본인 요청만(서비스가 거른다).

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function Content({ searchParams }: PageProps) {
  const user = await getCachedCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const focus = typeof sp.focus === "string" ? sp.focus : undefined;
  const items = await listTaxInvoiceRequests({ id: user.id, name: user.name, role: user.role });
  return <TaxInvoiceList items={items} isAdmin={user.role === "ADMIN"} focusId={focus} />;
}

export default function TaxInvoicesPage(props: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4 animate-pulse">
          <div className="h-6 w-48 rounded-lg bg-[var(--apple-tertiary-system-fill)]" />
          <div className="h-11 w-72 rounded-full bg-[var(--apple-tertiary-system-fill)]" />
          <div className="h-48 rounded-2xl bg-[var(--apple-tertiary-system-fill)]" />
        </div>
      }
    >
      <Content {...props} />
    </Suspense>
  );
}
