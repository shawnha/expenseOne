"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip, Trash2, Upload } from "lucide-react";
import { DocumentTypeSelect } from "@/components/forms/document-type-select";
import { DOCUMENT_TYPE_OPTIONS } from "@/lib/validations/expense-form";

interface Attachment {
  id: string;
  fileName: string;
  documentType: string;
  fileSize: number;
}

function docLabel(v: string) {
  return DOCUMENT_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
}
function size(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;
}

/** 반복 지급에 붙은 첨부 관리. AUTO 로 자동 제출될 때 이 파일들이 입금요청에 복사돼 붙는다. */
export function RecurringAttachments({
  recurringId,
  onChanged,
}: {
  recurringId: string;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<Attachment[] | null>(null);
  const [docType, setDocType] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/recurring-expenses/${recurringId}/attachments`);
      if (!res.ok) throw new Error();
      const j = await res.json();
      setItems(j.data ?? []);
    } catch {
      setItems([]);
      toast.error("첨부 목록을 불러오지 못했어요.");
    }
  }, [recurringId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(file: File) {
    if (!docType) {
      toast.error("문서 유형을 먼저 골라주세요.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("documentType", docType);
      const res = await fetch(`/api/recurring-expenses/${recurringId}/attachments`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error?.message ?? "올리지 못했어요.");
      }
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "올리지 못했어요.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/recurring-expenses/${recurringId}/attachments/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error?.message ?? "지우지 못했어요.");
      }
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "지우지 못했어요.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {items === null ? (
        <p className="text-[13px] text-[var(--apple-tertiary-label)]">불러오는 중...</p>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-[var(--apple-tertiary-label)]">붙은 파일이 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-xl bg-[var(--apple-tertiary-system-fill)] px-3 py-2"
            >
              <Paperclip className="size-4 shrink-0 text-[var(--apple-secondary-label)]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-[var(--apple-label)]">{a.fileName}</p>
                <p className="text-[12px] text-[var(--apple-secondary-label)]">
                  {docLabel(a.documentType)} · {size(a.fileSize)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(a.id)}
                aria-label="첨부 삭제"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--apple-red)]"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <DocumentTypeSelect value={docType} onChange={setDocType} />
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--apple-separator)] px-3 text-[13px] font-medium text-[var(--apple-blue)] disabled:opacity-50"
        >
          <Upload className="size-3.5" />
          {uploading ? "올리는 중..." : "파일 올리기"}
        </button>
      </div>
    </div>
  );
}
