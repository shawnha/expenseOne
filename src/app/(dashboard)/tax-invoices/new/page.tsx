import { redirect } from "next/navigation";
import { getCachedCurrentUser } from "@/lib/supabase/cached";
import { listErpSalesDocs } from "@/services/tax-invoice.service";
import { TaxInvoiceForm } from "@/components/tax-invoices/tax-invoice-form";
import { emptyTaxInvoiceInitial, initialFromErpDoc } from "@/components/tax-invoices/initial";

// 새 발행 요청. ?date=YYYY-MM-DD&doc=N 이면 그 SIMS 전표로 미리 채운다 — ERP 에 "발행 요청" 버튼을
// 달 때 이 주소로 링크만 걸면 된다(ERP 는 쓰기 없이 연결된다).

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewTaxInvoicePage({ searchParams }: PageProps) {
  const user = await getCachedCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null;
  const doc = typeof sp.doc === "string" ? sp.doc.slice(0, 50) : null;

  const isAdmin = user.role === "ADMIN";
  let initial = emptyTaxInvoiceInitial();
  // SIMS 전표 미리 채우기는 관리자만(전표 조회 권한과 같다).
  if (isAdmin && date && doc) {
    try {
      const [found] = await listErpSalesDocs(date, undefined, doc);
      if (found && found.total > 0) initial = initialFromErpDoc(found);
    } catch (err) {
      // ERP 를 못 읽으면 빈 폼 — 손으로 채우면 된다.
      console.error("[TaxInvoice] 전표 미리 채우기 실패:", err);
    }
  }
  return <TaxInvoiceForm initial={initial} canUseErp={isAdmin} />;
}
