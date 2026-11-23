import { OCR_ACCEPTED_TYPES, OCR_MAX_UPLOAD_BYTES } from "@/lib/ocr/types";

export const TAX_INVOICE_ATTACHMENT_TYPES = OCR_ACCEPTED_TYPES;
export const MAX_TAX_INVOICE_ATTACHMENTS = 10;
// A request (including its multipart envelope) must fit the app server body limit.
export const MAX_TAX_INVOICE_ATTACHMENT_BYTES = OCR_MAX_UPLOAD_BYTES;

export interface TaxInvoiceAttachment {
  id: string;
  fileName: string;
  fileSize: number;
}

export function taxInvoiceAttachmentUrl(requestId: string, attachmentId: string) {
  return `/api/tax-invoices/${requestId}/attachments/${attachmentId}`;
}

export function taxInvoiceAttachmentLimit(files: { fileSize: number }[]): string | null {
  if (files.length > MAX_TAX_INVOICE_ATTACHMENTS) return "요청당 파일은 최대 10개까지 첨부할 수 있습니다.";
  if (files.reduce((total, { fileSize }) => total + fileSize, 0) > MAX_TAX_INVOICE_ATTACHMENT_BYTES) {
    return "요청 한 건의 첨부 파일은 합계 4MB 이하여야 합니다.";
  }
  return null;
}
