"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload,
  X,
  FileText,
  ImageIcon,
  Camera,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isShrinkableImage, shrinkImageForUpload } from "@/lib/image-resize";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  MAX_TOTAL_FILE_SIZE,
  formatFileSize,
  type FileWithPreview,
} from "@/lib/validations/expense-form";

interface FileUploadProps {
  files: FileWithPreview[];
  onFilesChange: (files: FileWithPreview[]) => void;
  maxFiles?: number;
  error?: string;
  className?: string;
  /** 사진 줄이는 동안 true — 부모가 제출 버튼을 잠그는 데 쓴다 */
  onBusyChange?: (busy: boolean) => void;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

// 폰 메모리 급증을 피하려고 한 장씩 순차로 줄인다 (크기 검증 전에 먼저 줄임)
async function shrinkSequentially(picked: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const file of picked) {
    out.push(await shrinkImageForUpload(file));
  }
  return out;
}

export function FileUpload({
  files,
  onFilesChange,
  maxFiles = 10,
  error,
  className,
  onBusyChange,
}: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const onBusyChangeRef = useRef(onBusyChange);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const currentTotalSize = files.reduce((sum, f) => sum + f.file.size, 0);

  // Revoke object URLs on unmount to prevent memory leaks
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(() => {
    onBusyChangeRef.current = onBusyChange;
  }, [onBusyChange]);
  useEffect(() => {
    onBusyChangeRef.current?.(isBusy);
  }, [isBusy]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      onBusyChangeRef.current?.(false);
      filesRef.current.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview); });
    };
  }, []);

  const validateFile = useCallback(
    (file: File): string | null => {
      if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
        return `"${file.name}": 허용되지 않는 파일 형식입니다. (jpeg, png, webp, heic, pdf만 가능)`;
      }
      if (file.size > MAX_FILE_SIZE) {
        return `"${file.name}": 파일 크기가 10MB를 초과합니다.`;
      }
      return null;
    },
    []
  );

  const addFiles = useCallback(
    async (picked: File[]) => {
      if (busyRef.current) {
        setFileError("사진을 처리하는 중입니다. 잠시 후 다시 시도하세요.");
        return;
      }
      setFileError(null);

      if (filesRef.current.length + picked.length > maxFiles) {
        setFileError(`최대 ${maxFiles}개의 파일만 첨부할 수 있습니다.`);
        return;
      }

      // PDF만 고른 경우는 줄일 게 없으니 busy 표시 없이 바로 진행한다
      const hasImage = picked.some(isShrinkableImage);
      busyRef.current = true;
      if (hasImage) setIsBusy(true);
      try {
        const newFiles = await shrinkSequentially(picked);
        // 줄이는 중 화면이 사라졌으면 미리보기 URL을 만들지 않는다 (해제할 기회가 없다)
        if (!mountedRef.current) return;

        // 줄이는 동안 목록이 바뀌었을 수 있어 최신 값을 쓴다
        const current = filesRef.current;
        const baseSize = current.reduce((sum, f) => sum + f.file.size, 0);
        const validFiles: FileWithPreview[] = [];
        let addedSize = 0;

        for (const file of newFiles) {
          const validationError = validateFile(file);
          if (validationError) {
            setFileError(validationError);
            return;
          }

          addedSize += file.size;
          if (baseSize + addedSize > MAX_TOTAL_FILE_SIZE) {
            setFileError("총 첨부 파일 크기가 50MB를 초과합니다.");
            return;
          }

          validFiles.push({
            id: generateId(),
            file,
            preview: null,
          });
        }

        // 미리보기 URL은 검증을 모두 통과한 뒤에 만든다 (중간에 return하면 해제할 기회가 없다)
        for (const f of validFiles) {
          if (f.file.type.startsWith("image/")) f.preview = URL.createObjectURL(f.file);
        }
        onFilesChange([...current, ...validFiles]);
      } finally {
        busyRef.current = false;
        if (mountedRef.current) setIsBusy(false);
      }
    },
    [onFilesChange, maxFiles, validateFile]
  );

  const removeFile = useCallback(
    (id: string) => {
      const fileToRemove = files.find((f) => f.id === id);
      if (fileToRemove?.preview) {
        URL.revokeObjectURL(fileToRemove.preview);
      }
      onFilesChange(files.filter((f) => f.id !== id));
      setFileError(null);
    },
    [files, onFilesChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      addFiles(droppedFiles);
    },
    [addFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || []);
      addFiles(selectedFiles);
      e.target.value = "";
    },
    [addFiles]
  );

  const displayError = error || fileError;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--glass-border)] p-6 transition-colors",
          isDragOver
            ? "border-primary bg-primary/5"
            : displayError
            ? "border-destructive/50 bg-destructive/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          isBusy ? "cursor-wait" : "cursor-pointer"
        )}
        onClick={() => {
          if (!isBusy) fileInputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
        aria-label="파일 업로드 영역"
        aria-busy={isBusy}
        aria-disabled={isBusy}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!isBusy) fileInputRef.current?.click();
          }
        }}
      >
        {isBusy ? (
          <Loader2 className="size-8 animate-spin text-muted-foreground motion-reduce:animate-none" />
        ) : (
          <Upload className="size-8 text-muted-foreground" />
        )}
        <div className="text-center">
          {isBusy ? (
            <p className="text-sm font-medium" role="status">사진 줄이는 중…</p>
          ) : (
            <p className="text-sm font-medium">
              <span className="sm:hidden">탭하여 파일을 선택하세요</span>
              <span className="hidden sm:block">파일을 드래그하여 놓거나 클릭하여 선택하세요</span>
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            JPEG, PNG, WebP, HEIC, PDF (최대 10MB / 총 50MB)
          </p>
        </div>

        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-3.5" />
            파일 선택
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera className="size-3.5" />
            카메라 촬영
          </Button>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
        multiple
        onChange={handleFileSelect}
        aria-hidden="true"
      />
      <input
        ref={cameraInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        aria-hidden="true"
      />

      {/* Error message */}
      {displayError && (
        <div className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{displayError}</span>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((fileItem) => (
            <FilePreviewItem
              key={fileItem.id}
              fileItem={fileItem}
              onRemove={() => removeFile(fileItem.id)}
            />
          ))}
          <p className="text-xs text-muted-foreground">
            {files.length}개 파일 / 총 {formatFileSize(currentTotalSize)}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// File Preview Item
// ============================================================

function FilePreviewItem({
  fileItem,
  onRemove,
  children,
}: {
  fileItem: FileWithPreview;
  onRemove: () => void;
  children?: React.ReactNode;
}) {
  const isImage = fileItem.file.type.startsWith("image/");
  const isPdf = fileItem.file.type === "application/pdf";

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-2">
      {/* Thumbnail */}
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
        {isImage && fileItem.preview ? (
          <img
            src={fileItem.preview}
            alt={fileItem.file.name}
            className="size-full object-cover"
          />
        ) : isPdf ? (
          <FileText className="size-6 text-red-500" />
        ) : (
          <ImageIcon className="size-6 text-muted-foreground" />
        )}
      </div>

      {/* File info */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-sm font-medium">{fileItem.file.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(fileItem.file.size)}
        </p>
        {children}
      </div>

      {/* Remove button */}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onRemove}
        aria-label={`${fileItem.file.name} 삭제`}
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

// ============================================================
// File Upload with Document Type (입금요청용)
// ============================================================

interface FileUploadWithDocTypeProps extends FileUploadProps {
  onDocumentTypeChange: (fileId: string, documentType: string) => void;
  documentTypeErrors?: Record<string, boolean>;
}

export function FileUploadWithDocType({
  files,
  onFilesChange,
  onDocumentTypeChange,
  documentTypeErrors,
  maxFiles = 10,
  error,
  className,
  onBusyChange,
}: FileUploadWithDocTypeProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const onBusyChangeRef = useRef(onBusyChange);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const currentTotalSize = files.reduce((sum, f) => sum + f.file.size, 0);

  // Revoke object URLs on unmount to prevent memory leaks
  const filesRef2 = useRef(files);
  useEffect(() => {
    filesRef2.current = files;
  }, [files]);
  useEffect(() => {
    onBusyChangeRef.current = onBusyChange;
  }, [onBusyChange]);
  useEffect(() => {
    onBusyChangeRef.current?.(isBusy);
  }, [isBusy]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      onBusyChangeRef.current?.(false);
      filesRef2.current.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview); });
    };
  }, []);

  const validateFile = useCallback(
    (file: File): string | null => {
      if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
        return `"${file.name}": 허용되지 않는 파일 형식입니다. (jpeg, png, webp, heic, pdf만 가능)`;
      }
      if (file.size > MAX_FILE_SIZE) {
        return `"${file.name}": 파일 크기가 10MB를 초과합니다.`;
      }
      return null;
    },
    []
  );

  const addFiles = useCallback(
    async (picked: File[]) => {
      if (busyRef.current) {
        setFileError("사진을 처리하는 중입니다. 잠시 후 다시 시도하세요.");
        return;
      }
      setFileError(null);

      if (filesRef2.current.length + picked.length > maxFiles) {
        setFileError(`최대 ${maxFiles}개의 파일만 첨부할 수 있습니다.`);
        return;
      }

      // PDF만 고른 경우는 줄일 게 없으니 busy 표시 없이 바로 진행한다
      const hasImage = picked.some(isShrinkableImage);
      busyRef.current = true;
      if (hasImage) setIsBusy(true);
      try {
        const newFiles = await shrinkSequentially(picked);
        // 줄이는 중 화면이 사라졌으면 미리보기 URL을 만들지 않는다 (해제할 기회가 없다)
        if (!mountedRef.current) return;

        // 줄이는 동안 목록이 바뀌었을 수 있어 최신 값을 쓴다
        const current = filesRef2.current;
        const baseSize = current.reduce((sum, f) => sum + f.file.size, 0);
        const validFiles: FileWithPreview[] = [];
        let addedSize = 0;

        for (const file of newFiles) {
          const validationError = validateFile(file);
          if (validationError) {
            setFileError(validationError);
            return;
          }

          addedSize += file.size;
          if (baseSize + addedSize > MAX_TOTAL_FILE_SIZE) {
            setFileError("총 첨부 파일 크기가 50MB를 초과합니다.");
            return;
          }

          validFiles.push({
            id: generateId(),
            file,
            preview: null,
          });
        }

        // 미리보기 URL은 검증을 모두 통과한 뒤에 만든다 (중간에 return하면 해제할 기회가 없다)
        for (const f of validFiles) {
          if (f.file.type.startsWith("image/")) f.preview = URL.createObjectURL(f.file);
        }
        onFilesChange([...current, ...validFiles]);
      } finally {
        busyRef.current = false;
        if (mountedRef.current) setIsBusy(false);
      }
    },
    [onFilesChange, maxFiles, validateFile]
  );

  const removeFile = useCallback(
    (id: string) => {
      const fileToRemove = files.find((f) => f.id === id);
      if (fileToRemove?.preview) {
        URL.revokeObjectURL(fileToRemove.preview);
      }
      onFilesChange(files.filter((f) => f.id !== id));
      setFileError(null);
    },
    [files, onFilesChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      addFiles(droppedFiles);
    },
    [addFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || []);
      addFiles(selectedFiles);
      e.target.value = "";
    },
    [addFiles]
  );

  const displayError = error || fileError;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--glass-border)] p-6 transition-colors",
          isDragOver
            ? "border-primary bg-primary/5"
            : displayError
            ? "border-destructive/50 bg-destructive/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          isBusy ? "cursor-wait" : "cursor-pointer"
        )}
        onClick={() => {
          if (!isBusy) fileInputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
        aria-label="파일 업로드 영역"
        aria-busy={isBusy}
        aria-disabled={isBusy}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!isBusy) fileInputRef.current?.click();
          }
        }}
      >
        {isBusy ? (
          <Loader2 className="size-8 animate-spin text-muted-foreground motion-reduce:animate-none" />
        ) : (
          <Upload className="size-8 text-muted-foreground" />
        )}
        <div className="text-center">
          {isBusy ? (
            <p className="text-sm font-medium" role="status">사진 줄이는 중…</p>
          ) : (
            <p className="text-sm font-medium">
              <span className="sm:hidden">탭하여 파일을 선택하세요</span>
              <span className="hidden sm:block">파일을 드래그하여 놓거나 클릭하여 선택하세요</span>
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            JPEG, PNG, WebP, HEIC, PDF (최대 10MB / 총 50MB)
          </p>
          <p className="mt-0.5 text-xs font-medium text-destructive">
            * 최소 1개의 파일을 첨부해야 합니다
          </p>
        </div>

        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-3.5" />
            파일 선택
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera className="size-3.5" />
            카메라 촬영
          </Button>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
        multiple
        onChange={handleFileSelect}
        aria-hidden="true"
      />
      <input
        ref={cameraInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        aria-hidden="true"
      />

      {/* Error message */}
      {displayError && (
        <div className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{displayError}</span>
        </div>
      )}

      {/* File list with document type */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((fileItem) => (
            <FilePreviewWithDocType
              key={fileItem.id}
              fileItem={fileItem}
              onRemove={() => removeFile(fileItem.id)}
              onDocumentTypeChange={(docType) =>
                onDocumentTypeChange(fileItem.id, docType)
              }
              hasError={documentTypeErrors?.[fileItem.id] ?? false}
            />
          ))}
          <p className="text-xs text-muted-foreground">
            {files.length}개 파일 / 총 {formatFileSize(currentTotalSize)}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// File Preview with Document Type Select
// ============================================================

import { DocumentTypeSelect } from "./document-type-select";

function FilePreviewWithDocType({
  fileItem,
  onRemove,
  onDocumentTypeChange,
  hasError,
}: {
  fileItem: FileWithPreview;
  onRemove: () => void;
  onDocumentTypeChange: (documentType: string) => void;
  hasError: boolean;
}) {
  const isImage = fileItem.file.type.startsWith("image/");
  const isPdf = fileItem.file.type === "application/pdf";

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-2 sm:flex-row sm:items-center sm:gap-3",
        hasError ? "border-destructive" : "bg-muted/30"
      )}
    >
      <div className="flex flex-1 items-center gap-3">
        {/* Thumbnail */}
        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
          {isImage && fileItem.preview ? (
            <img
              src={fileItem.preview}
              alt={fileItem.file.name}
              className="size-full object-cover"
            />
          ) : isPdf ? (
            <FileText className="size-6 text-red-500" />
          ) : (
            <ImageIcon className="size-6 text-muted-foreground" />
          )}
        </div>

        {/* File info */}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-sm font-medium">{fileItem.file.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(fileItem.file.size)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <DocumentTypeSelect
          value={fileItem.documentType}
          onChange={onDocumentTypeChange}
          hasError={hasError}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onRemove}
          aria-label={`${fileItem.file.name} 삭제`}
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
