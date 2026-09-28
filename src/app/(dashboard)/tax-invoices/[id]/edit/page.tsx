import { notFound, redirect } from "next/navigation";
import { getCachedCurrentUser } from "@/lib/supabase/cached";
import { getTaxInvoiceRequest } from "@/services/tax-invoice.service";
import { TaxInvoiceForm } from "@/components/tax-invoices/tax-invoice-form";
import type { ChargeType, IssuerCode } from "@/lib/tax-invoice";

// 발행 대기 중인 요청 고치기(본인 또는 관리자). 발행·취소된 건은 목록으로 돌려보낸다.

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditTaxInvoicePage({ params }: PageProps) {
  const user = await getCachedCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  let row;
  try {
    row = await getTaxInvoiceRequest({ id: user.id, name: user.name, role: user.role }, id);
  } catch {
    notFound();
  }
  if (row.status !== "REQUESTED" || (user.role !== "ADMIN" && row.requestedById !== user.id)) {
    redirect(`/tax-invoices?focus=${id}`);
  }

  return (
    <TaxInvoiceForm
      canUseErp={user.role === "ADMIN"}
      initial={{
        id: row.id,
        issuerCode: row.issuerCode as IssuerCode,
        buyerName: row.buyerName,
        buyerBizNo: row.buyerBizNo,
        buyerCeo: row.buyerCeo ?? "",
        buyerEmail: row.buyerEmail ?? "",
        buyerAddress: row.buyerAddress ?? "",
        items: row.items,
        supplyAmount: row.supplyAmount,
        vatAmount: row.vatAmount,
        supplyDate: row.supplyDate,
        chargeType: row.chargeType as ChargeType,
        memo: row.memo ?? "",
        erpSalesDate: row.erpSalesDate,
        erpDocumentNo: row.erpDocumentNo,
      }}
    />
  );
}
