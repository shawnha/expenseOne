import type { OcrFields } from "@/lib/ocr/types";
import { bizNoDigits } from "@/lib/tax-invoice";

const clean = (value: string | null | undefined, max: number) => value?.trim().slice(0, max) || null;
const validAmount = (value: number | null): value is number =>
  value !== null && Number.isInteger(value) && value >= 0 && value <= 2_147_483_647;

export function taxInvoiceOcrSuggestion(fields: OcrFields) {
  const invoice = fields.taxInvoice;
  const bizNo = bizNoDigits(invoice?.buyerBizNo ?? "");
  const email = clean(invoice?.buyerEmail, 254);
  const date = invoice?.supplyDate ?? "";
  const monthDay = new Date(`${date}T00:00:00.000Z`);
  const supplyDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(monthDay.getTime()) && monthDay.toISOString().slice(0, 10) === date
    ? date : null;

  const supply = fields.supplyAmount;
  const vat = fields.vatAmount;
  const exact = fields.currency?.trim().toUpperCase() === "KRW" && validAmount(supply) && supply > 0 && validAmount(vat) &&
    (fields.totalAmount === null || (fields.amountIncludesVat === "no" ? supply : supply + vat) === fields.totalAmount)
    ? { supply, vat } : null;

  return {
    buyerName: clean(invoice?.buyerName, 200),
    buyerBizNo: bizNo.length === 10 ? bizNo : null,
    buyerCeo: clean(invoice?.buyerCeo, 100),
    buyerEmail: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    buyerAddress: clean(invoice?.buyerAddress, 300),
    items: clean(invoice?.items, 1000),
    supplyDate,
    exact,
  };
}

export type TaxInvoiceOcrSuggestion = ReturnType<typeof taxInvoiceOcrSuggestion>;
