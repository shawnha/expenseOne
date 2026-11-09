"use client";

import { useId, type ComponentProps } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** 기존 설명 저장 경로를 그대로 사용해 메모와 여러 참고 URL을 함께 보관한다. */
export function ExpenseNotesField({
  id,
  error,
  maxLength = 2000,
  "aria-describedby": describedBy,
  ...props
}: ComponentProps<"textarea"> & { error?: string }) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;

  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={fieldId}>설명 및 참고 링크 <span className="font-normal text-[var(--apple-secondary-label)]">(선택)</span></Label>
      <Textarea
        id={fieldId}
        rows={3}
        maxLength={maxLength}
        placeholder={"사용 목적이나 전달할 내용을 적어주세요.\n구매처·견적서·문서 링크도 붙여넣을 수 있어요."}
        aria-invalid={!!error}
        aria-describedby={[hintId, error ? errorId : "", describedBy].filter(Boolean).join(" ")}
        {...props}
      />
      <p id={hintId} className="text-xs leading-relaxed text-[var(--apple-secondary-label)]">
        링크는 https:// 또는 www.로 시작하는 주소를 붙여넣어주세요. 여러 개 입력할 수 있으며, 제출 후 상세에서 열 수 있습니다. 최대 {maxLength.toLocaleString("ko-KR")}자.
      </p>
      {error && <p id={errorId} className="text-xs text-[var(--apple-red)]" role="alert">{error}</p>}
    </div>
  );
}
