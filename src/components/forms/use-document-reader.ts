"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { canReadDocument, documentTypeFromOcr, fileFromOcrImage, isOcrDisabledForSession, readDocument } from "@/lib/ocr-client";
import { getOcrSkipReason, type OcrSkipReason } from "@/lib/ocr-skip";
import type { DocumentReadStage } from "./document-scan-progress";
import type { OcrResult } from "@/lib/ocr/types";
import { MAX_TOTAL_FILE_SIZE, type FileWithPreview } from "@/lib/validations/expense-form";

/** 동시에 읽는 첨부 수 — 폰에서 한꺼번에 여러 장을 올려도 한두 장씩 */
const CONCURRENCY = 2;

/**
 * 첨부를 뒤에서 읽는다(OCR). 첨부 목록·제출은 막지 않는다 — 읽기가 늦거나 실패해도 첨부는 그대로 간다.
 * 읽기가 끝나면: 뒤집힌 사진은 바로 세운 사진으로 바꿔 끼우고, (입금요청) 서류 종류가 비어 있으면 채우고,
 * 결과를 부모에게 알린다. 그 사이 지워진 첨부는 건너뛴다.
 */
export function useDocumentReader({
  filesRef,
  onFilesChange,
  onDocumentRead,
  fillDocumentType = false,
}: {
  filesRef: MutableRefObject<FileWithPreview[]>;
  onFilesChange: (files: FileWithPreview[]) => void;
  onDocumentRead?: (fileId: string, result: OcrResult) => void;
  fillDocumentType?: boolean;
}) {
  const [stages, setStages] = useState<Record<string, DocumentReadStage>>({});
  const queueRef = useRef<FileWithPreview[]>([]);
  const activeRef = useRef(0);
  const inFlightRef = useRef(new Set<string>());
  const [readingIds, setReadingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [skipped, setSkipped] = useState<Readonly<Record<string, OcrSkipReason>>>({});
  const clearSkipped = useCallback((id: string) => {
    setSkipped((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);
  const markSkipped = useCallback((item: FileWithPreview) => {
    if (!filesRef.current.some((f) => f.id === item.id)) return;
    const reason = getOcrSkipReason(item.file, isOcrDisabledForSession());
    setStages((prev) => ({ ...prev, [item.id]: reason === "failed" ? "failed" : "skipped" }));
    setSkipped((prev) => reason ? { ...prev, [item.id]: reason } : {});
  }, [filesRef]);
  const abortRef = useRef<AbortController | null>(null);
  const callbacksRef = useRef({ onFilesChange, onDocumentRead });
  useEffect(() => {
    callbacksRef.current = { onFilesChange, onDocumentRead };
  }, [onFilesChange, onDocumentRead]);
  useEffect(() => {
    abortRef.current = new AbortController();
    // 화면을 떠나면 남은 읽기를 멈춘다 (돈이 드는 호출)
    return () => { abortRef.current?.abort(); queueRef.current = []; };
  }, []);

  const finish = useCallback((id: string) => {
    setReadingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const readOne = useCallback(
    async (item: FileWithPreview) => {
      const signal = abortRef.current?.signal;
      if (signal?.aborted || !filesRef.current.some(f => f.id === item.id)) { finish(item.id); return; }
      setStages((prev) => ({ ...prev, [item.id]: "reading" }));
      const result = await readDocument(item.file, signal);
      if (signal?.aborted) return;
      finish(item.id);
      if (!result) {
        markSkipped(item);
        return;
      }

      const current = filesRef.current;
      const cur = current.find((f) => f.id === item.id);
      if (!cur) return; // 읽는 사이 지운 첨부

      let next = cur;
      if (result.imageJpegBase64) {
        const upright = fileFromOcrImage(cur.file, result.imageJpegBase64);
        const total = current.reduce((sum, f) => sum + f.file.size, 0) - cur.file.size + (upright?.size ?? 0);
        if (upright && total <= MAX_TOTAL_FILE_SIZE) {
          if (cur.preview) URL.revokeObjectURL(cur.preview);
          next = { ...cur, file: upright, preview: URL.createObjectURL(upright) };
        }
      }
      if (fillDocumentType && !next.documentType) {
        const docType = documentTypeFromOcr(result.fields.docType);
        if (docType) next = { ...next, documentType: docType };
      }
      if (next !== cur) {
        const updated = current.map((f) => (f.id === item.id ? next : f));
        filesRef.current = updated; // 다음 결과가 이 변경 위에 쌓이도록 바로 반영
        callbacksRef.current.onFilesChange(updated);
      }
      setStages((prev) => ({ ...prev, [item.id]: "done" }));
      callbacksRef.current.onDocumentRead?.(item.id, result);
    },
    [filesRef, finish, fillDocumentType, markSkipped]
  );

  /** 새로 붙인 첨부를 읽기 시작한다 (기다리지 않는다) */
  const read = useCallback(
    (items: FileWithPreview[]) => {
      if (!callbacksRef.current.onDocumentRead) return;
      const targets = items.filter((item) => {
        if (inFlightRef.current.has(item.id)) return false;
        clearSkipped(item.id);
        if (canReadDocument(item.file)) return true;
        markSkipped(item);
        return false;
      });
      if (targets.length === 0) return;
      setReadingIds((prev) => new Set([...prev, ...targets.map((t) => t.id)]));
      for (const item of targets) inFlightRef.current.add(item.id);
      setStages((prev) => ({ ...prev, ...Object.fromEntries(targets.map(t => [t.id, "queued" as const])) }));
      queueRef.current.push(...targets);
      const pump = () => {
        while (activeRef.current < CONCURRENCY && queueRef.current.length > 0) {
          const item = queueRef.current.shift()!;
          activeRef.current += 1;
          void readOne(item).catch(() => { markSkipped(item); finish(item.id); }).finally(() => {
            activeRef.current -= 1;
            inFlightRef.current.delete(item.id);
            pump();
          });
        }
      };
      pump();
    },
    [readOne, clearSkipped, markSkipped, finish]
  );

  return { read, stages, readingCount: readingIds.size, readingIds, skipped: isOcrDisabledForSession() ? {} : skipped, clearSkipped };
}
