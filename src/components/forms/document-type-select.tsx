"use client";

import React, { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DOCUMENT_TYPE_OPTIONS } from "@/lib/validations/expense-form";

const CUSTOM_INPUT_KEY = "__CUSTOM__";

interface DocumentTypeSelectProps {
  value?: string;
  onChange: (value: string) => void;
  hasError?: boolean;
  className?: string;
}

export function DocumentTypeSelect({
  value,
  onChange,
  hasError = false,
  className,
}: DocumentTypeSelectProps) {
  const isPreset = DOCUMENT_TYPE_OPTIONS.some((o) => o.value === value);
  const [showCustom, setShowCustom] = useState(!isPreset && !!value);

  const displayLabel = value
    ? (DOCUMENT_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value)
    : undefined;

  if (showCustom) {
    return (
      <Input
        autoFocus
        placeholder="문서유형 입력"
        value={isPreset ? "" : (value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (!value) setShowCustom(false);
        }}
        className={cn(
          "w-[130px] text-xs h-9",
          hasError && "border-destructive ring-2 ring-destructive/20",
          className
        )}
      />
    );
  }

  return (
    <Select
      value={isPreset ? (value ?? "") : ""}
      onValueChange={(val) => {
        if (val === CUSTOM_INPUT_KEY) {
          setShowCustom(true);
          onChange("");
        } else if (val) {
          onChange(val);
        }
      }}
    >
      <SelectTrigger
        className={cn(
          "w-[130px] text-xs",
          hasError && "border-destructive ring-2 ring-destructive/20",
          !value && "text-muted-foreground",
          className
        )}
        aria-label="문서 유형 선택"
        aria-invalid={hasError}
      >
        <SelectValue placeholder="문서유형 선택">
          {displayLabel}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {DOCUMENT_TYPE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
        <SelectItem value={CUSTOM_INPUT_KEY}>
          + 직접 입력
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
