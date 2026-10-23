"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { canReadDocument, documentTypeFromOcr, fileFromOcrImage, readDocument } from "@/lib/ocr-client";
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
  const [readingIds, setReadingIds] = useState<ReadonlySet<string>>(() => new Set());
  const abortRef = useRef<AbortController | null>(null);
  const callbacksRef = useRef({ onFilesChange, onDocumentRead });
  useEffect(() => {
    callbacksRef.current = { onFilesChange, onDocumentRead };
  }, [onFilesChange, onDocumentRead]);
  useEffect(() => {
    abortRef.current = new AbortController();
    // 화면을 떠나면 남은 읽기를 멈춘다 (돈이 드는 호출)
    return () => abortRef.current?.abort();
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
      const result = await readDocument(item.file, signal);
      if (signal?.aborted) return;
      finish(item.id);
      if (!result) return;

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
      callbacksRef.current.onDocumentRead?.(item.id, result);
    },
    [filesRef, finish, fillDocumentType]
  );

  /** 새로 붙인 첨부를 읽기 시작한다 (기다리지 않는다) */
  const read = useCallback(
    (items: FileWithPreview[]) => {
      if (!callbacksRef.current.onDocumentRead) return;
      const targets = items.filter((f) => canReadDocument(f.file));
      if (targets.length === 0) return;
      setReadingIds((prev) => new Set([...prev, ...targets.map((t) => t.id)]));
      let index = 0;
      const worker = async () => {
        while (index < targets.length) {
          const item = targets[index++];
          await readOne(item);
        }
      };
      void Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
    },
    [readOne]
  );

  return { read, readingCount: readingIds.size, readingIds };
}
