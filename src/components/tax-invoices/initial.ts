import type { ChargeType, IssuerCode } from "@/lib/tax-invoice";
import type { ErpSalesDoc } from "@/services/tax-invoice.service";
import { todayKST } from "./api";

// 세금계산서 요청 폼의 처음 값. 서버 화면(새 요청·딥링크·수정)이 만들어 넘기므로 "use client" 밖에 둔다.

export interface TaxInvoiceFormInitial {
  id?: string;
  issuerCode: IssuerCode;
  buyerName: string;
  buyerBizNo: string;
  buyerCeo: string;
  buyerEmail: string;
  buyerAddress: string;
  items: string;
  supplyAmount: number | null;
  vatAmount: number | null;
  supplyDate: string;
  chargeType: ChargeType;
  memo: string;
  erpSalesDate: string | null;
  erpDocumentNo: string | null;
}

export function emptyTaxInvoiceInitial(): TaxInvoiceFormInitial {
  return {
    issuerCode: "HOW",
    buyerName: "",
    buyerBizNo: "",
    buyerCeo: "",
    buyerEmail: "",
    buyerAddress: "",
    items: "",
    supplyAmount: null,
    vatAmount: null,
    supplyDate: todayKST(),
    chargeType: "CHARGE",
    memo: "",
    erpSalesDate: null,
    erpDocumentNo: null,
  };
}

/** SIMS 전표 하나로 폼 값을 만든다(딥링크 미리 채우기와 목록 고르기가 같이 쓴다). */
export function initialFromErpDoc(doc: ErpSalesDoc): TaxInvoiceFormInitial {
  return {
    ...emptyTaxInvoiceInitial(),
    buyerName: doc.payeeName,
    items: doc.items,
    supplyAmount: doc.supplyAmount,
    vatAmount: doc.vatAmount,
    supplyDate: doc.salesDate,
    erpSalesDate: doc.salesDate,
    erpDocumentNo: doc.documentNo,
  };
}

