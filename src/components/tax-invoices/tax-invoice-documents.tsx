"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ChevronDown, Download, FileText, LoaderCircle, Paperclip, X } from "lucide-react";
import { useDocumentReader } from "@/components/forms/use-document-reader";
import { Button } from "@/components/ui/button";
import { shrinkImageForUpload } from "@/lib/image-resize";
import { isOcrDisabledForSession } from "@/lib/ocr-client";
import type { OcrResult } from "@/lib/ocr/types";
import { formatBizNo } from "@/lib/tax-invoice";
import { taxInvoiceOcrSuggestion, type TaxInvoiceOcrSuggestion } from "@/lib/tax-invoice-ocr";
import {
  MAX_TAX_INVOICE_ATTACHMENTS, MAX_TAX_INVOICE_ATTACHMENT_BYTES, TAX_INVOICE_ATTACHMENT_TYPES,
  taxInvoiceAttachmentUrl, type TaxInvoiceAttachment,
} from "@/lib/tax-invoice-attachments";
import type { FileWithPreview } from "@/lib/validations/expense-form";
import { won } from "./api";

export function useTaxInvoiceDocuments() {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const filesRef = useRef<FileWithPreview[]>([]);
  const [results, setResults] = useState<Record<string, OcrResult>>({});
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      filesRef.current.forEach(({ preview }) => { if (preview) URL.revokeObjectURL(preview); });
    };
  }, []);

  const onDocumentRead = useCallback((id: string, result: OcrResult) => {
    setResults((current) => ({ ...current, [id]: result }));
  }, []);
  const { read, readingIds, clearSkipped } = useDocumentReader({
    filesRef, onDocumentRead, onFilesChange: setFiles, purpose: "tax-invoice", replaceImage: false,
  });

  async function addFiles(picked: File[]) {
    if (!picked.length || busy.current) return [];
    if (picked.length + filesRef.current.length > MAX_TAX_INVOICE_ATTACHMENTS) {
      setError("한 번에 최대 10개의 문서를 선택할 수 있습니다.");
      return [];
    }
    busy.current = true;
    setPreparing(true);
    setError(null);
    const accepted: File[] = [];
    const errors: string[] = [];
    try {
      for (const original of picked) {
        if (!original.size || !(TAX_INVOICE_ATTACHMENT_TYPES as readonly string[]).includes(original.type)) {
          errors.push(`${original.name} 형식을 확인해 주세요.`);
          continue;
        }
        const file = original.size > MAX_TAX_INVOICE_ATTACHMENT_BYTES && original.type.startsWith("image/")
          ? await shrinkImageForUpload(original) : original;
        if (file.size > MAX_TAX_INVOICE_ATTACHMENT_BYTES) {
          errors.push(`${original.name} 파일이 4MB를 초과합니다.`);
          continue;
        }
        accepted.push(file);
      }
      if (!mounted.current) return [];
      const added = accepted.map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }));
      filesRef.current = [...filesRef.current, ...added];
      setFiles(filesRef.current);
      if (errors.length) setError(errors.join(" "));
      read(added);
      return added.map(({ id }) => id);
    } finally {
      busy.current = false;
      if (mounted.current) setPreparing(false);
    }
  }

  function removeFile(id: string) {
    const file = filesRef.current.find((file) => file.id === id);
    if (file?.preview) URL.revokeObjectURL(file.preview);
    filesRef.current = filesRef.current.filter((file) => file.id !== id);
    setFiles(filesRef.current);
    clearSkipped(id);
    setResults((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  return { files, results, preparing, error, readingIds, addFiles, removeFile, retry: (file: FileWithPreview) => read([file]) };
}

export function TaxInvoiceDocumentPicker({
  onPick, busy, preparing, error,
}: {
  onPick: (files: File[]) => void;
  busy: boolean;
  preparing: boolean;
  error: string | null;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onPick(Array.from(event.target.files ?? []));
    event.target.value = "";
  };
  return (
    <section aria-label="문서 첨부" className="glass space-y-3 p-4 sm:p-6">
      <h2 className="text-subheadline font-semibold text-[var(--apple-label)]">문서 첨부</h2>
      <p className="break-keep text-sm text-[var(--apple-secondary-label)]">PDF·사진을 여러 개 선택하면 자동으로 읽습니다. 첨부는 요청당 합계 4MB까지 가능합니다.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-11 rounded-full" onClick={() => picker.current?.click()} disabled={busy}>
          <Paperclip aria-hidden /> 파일 선택
        </Button>
        <Button type="button" variant="outline" className="min-h-11 rounded-full" onClick={() => camera.current?.click()} disabled={busy}>
          <Camera aria-hidden /> 카메라 촬영
        </Button>
      </div>
      <input ref={picker} type="file" aria-label="첨부할 파일" accept={TAX_INVOICE_ATTACHMENT_TYPES.join(",")} multiple hidden onChange={onChange} disabled={busy} />
      <input ref={camera} type="file" aria-label="사진 촬영" accept="image/*" capture="environment" hidden onChange={onChange} disabled={busy} />
      {preparing && <p role="status" className="text-sm text-[var(--apple-secondary-label)]">파일 준비 중…</p>}
      {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    </section>
  );
}

export function TaxInvoiceDocuments({
  files, results, readingIds, saved, requestId, saving, onApply, onRemove, onRemoveSaved, onRetry, onSplit,
}: {
  files: FileWithPreview[];
  results: Record<string, OcrResult>;
  readingIds: ReadonlySet<string>;
  saved: TaxInvoiceAttachment[];
  requestId?: string;
  saving: boolean;
  onApply: (suggestion: TaxInvoiceOcrSuggestion) => void;
  onRemove: (id: string) => void;
  onRemoveSaved: (id: string) => void;
  onRetry: (file: FileWithPreview) => void;
  onSplit?: () => void;
}) {
  if (!files.length && !saved.length) return null;
  return (
    <section className="glass space-y-3 p-5 sm:p-6" aria-label="선택한 증빙">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-subheadline font-semibold text-[var(--apple-label)]">이 요청에 첨부할 파일</h2>
        {onSplit && files.length > 1 && (
          <Button type="button" variant="outline" className="min-h-11 rounded-full" disabled={saving} onClick={onSplit}>
            파일별 요청으로 나누기
          </Button>
        )}
      </div>
      <ul className="divide-y divide-[var(--apple-separator)]">
        {saved.map((file) => (
          <li key={file.id} className="flex min-w-0 items-center justify-between gap-2 py-2">
            {requestId && <TaxInvoiceAttachmentLink requestId={requestId} attachment={file} />}
            <RemoveButton name={file.fileName} disabled={saving} onRemove={() => onRemoveSaved(file.id)} />
          </li>
        ))}
        {files.map((file) => (
          <li key={file.id} className="space-y-1 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <FileText className="size-4 shrink-0 text-[var(--apple-secondary-label)]" aria-hidden />
              <span className="min-w-0 flex-1 break-words text-sm font-medium">{file.file.name}</span>
              {file.preview && (
                <a className="inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-medium text-[var(--apple-blue)] hover:underline"
                  href={file.preview} target="_blank" rel="noreferrer" aria-label={`${file.file.name} 원본 보기`}>원본 보기</a>
              )}
              <RemoveButton name={file.file.name} disabled={saving} onRemove={() => onRemove(file.id)} />
            </div>
            {readingIds.has(file.id) ? (
              <p role="status" className="flex items-center gap-2 text-sm text-[var(--apple-blue)]">
                <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />문서 스캔 중…
              </p>
            ) : results[file.id] ? (
              <DocumentResult result={results[file.id]} saving={saving} onApply={onApply} />
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--apple-secondary-label)]">
                <span>자동 인식 결과가 없습니다. 내용을 직접 입력할 수 있습니다.</span>
                {!isOcrDisabledForSession() && <Button type="button" variant="outline" size="lg" disabled={saving} onClick={() => onRetry(file)}>다시 읽기</Button>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DocumentResult({ result, saving, onApply }: {
  result: OcrResult;
  saving: boolean;
  onApply: (suggestion: TaxInvoiceOcrSuggestion) => void;
}) {
  const suggestion = taxInvoiceOcrSuggestion(result.fields);
  const { buyerName, buyerBizNo, buyerCeo, buyerEmail, buyerAddress, items, supplyDate, exact } = suggestion;
  const recognized = [
    ["상호", buyerName], ["사업자등록번호", buyerBizNo && formatBizNo(buyerBizNo)], ["대표자", buyerCeo],
    ["이메일", buyerEmail], ["주소", buyerAddress], ["품목", items], ["공급일", supplyDate],
    ["공급가액", exact && won(exact.supply)], ["부가세", exact && won(exact.vat)],
  ].filter(([, value]) => value !== null);
  if (!recognized.length) return <p className="text-sm text-[var(--apple-secondary-label)]">반영할 항목이 없습니다. 내용을 직접 입력해 주세요.</p>;

  const preview = [buyerName, buyerBizNo && formatBizNo(buyerBizNo), supplyDate, exact && won(exact.supply + exact.vat)]
    .filter(Boolean).join(" · ") || recognized[0][1];

  return (
    <div className="space-y-2 rounded-xl border border-[var(--apple-separator)] p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p role="status" className="text-sm font-semibold text-[var(--apple-label)]">자동 인식 결과</p>
          <p className="break-words text-sm text-[var(--apple-secondary-label)]">{preview}</p>
        </div>
        <Button type="button" size="lg" className="w-full bg-[#005cbf] px-4 text-white hover:bg-[#004d9f] sm:w-auto"
          disabled={saving} onClick={() => onApply(suggestion)}>
          빈 항목에 반영
        </Button>
      </div>
      <p className="break-keep text-sm text-[var(--apple-secondary-label)]">
        {result.fields.confidence === "low" ? "인식이 불확실합니다. 원본과 대조한 뒤 반영해 주세요." : "인식한 내용을 확인한 뒤 반영해 주세요."}
      </p>
      <details className="group/details">
        <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-md text-sm font-medium text-[var(--apple-label)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          <ChevronDown className="size-4 group-open/details:rotate-180" aria-hidden />
          인식 항목 자세히 보기
        </summary>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 pb-1 text-sm">
          {recognized.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-[var(--apple-secondary-label)]">{label}</dt>
              <dd className="whitespace-pre-line break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

function RemoveButton({ name, disabled, onRemove }: { name: string; disabled: boolean; onRemove: () => void }) {
  return <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" disabled={disabled}
    aria-label={`${name} 첨부 빼기`} onClick={onRemove}><X aria-hidden /></Button>;
}

export function TaxInvoiceAttachmentLink({ requestId, attachment }: { requestId: string; attachment: TaxInvoiceAttachment }) {
  return (
    <a href={taxInvoiceAttachmentUrl(requestId, attachment.id)} className="inline-flex min-h-11 min-w-0 items-center gap-2 text-sm font-medium text-[var(--apple-blue)] hover:underline">
      <Download className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 break-all">{attachment.fileName}</span>
    </a>
  );
}
