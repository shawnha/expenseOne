"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_OPTIONS } from "@/lib/validations/expense-form";
import { getCategoryLabel } from "@/lib/utils/expense-utils";
import { formatAmount } from "@/lib/validations/expense-form";
import type { ExpenseType, ExpenseStatus } from "@/types";

interface QuickEditExpense {
  id: string;
  title: string;
  category: string;
  amount: number;
  status: ExpenseStatus;
  type: ExpenseType;
  createdAt: string;
  submitter: { name: string } | null;
}

interface AdminQuickEditDialogProps {
  expense: QuickEditExpense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_OPTIONS: { value: ExpenseStatus; label: string }[] = [
  { value: "SUBMITTED", label: "제출" },
  { value: "APPROVED", label: "승인" },
  { value: "REJECTED", label: "반려" },
  { value: "CANCELLED", label: "취소" },
];

export function AdminQuickEditDialog({
  expense,
  open,
  onOpenChange,
}: AdminQuickEditDialogProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<ExpenseStatus>("SUBMITTED");
  const [transactionDate, setTransactionDate] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset form when expense changes
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen && expense) {
        setTitle(expense.title);
        setCategory(expense.category);
        setAmount(String(expense.amount));
        setStatus(expense.status);
        // Parse createdAt to date string
        const d = new Date(expense.createdAt);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        setTransactionDate(`${yyyy}-${mm}-${dd}`);
      }
      onOpenChange(isOpen);
    },
    [expense, onOpenChange],
  );

  const handleSave = useCallback(async () => {
    if (!expense) return;

    const parsedAmount = parseInt(amount, 10);
    if (!title.trim() || !category || isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("필수 항목을 확인해주세요.");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        category,
        amount: parsedAmount,
        status,
      };
      if (transactionDate) {
        body.transactionDate = transactionDate;
      }

      const res = await fetch(`/api/expenses/${expense.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || "수정에 실패했습니다.");
      }

      toast.success("수정되었습니다.");
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "수정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }, [expense, title, category, amount, status, transactionDate, onOpenChange, router]);

  if (!expense) return null;

  const selectedCategoryLabel = getCategoryLabel(category);
  const selectedStatusLabel =
    STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-[var(--apple-label)]">
            비용 빠른 수정
          </DialogTitle>
          {expense.submitter && (
            <p className="text-[12px] text-[var(--apple-secondary-label)]">
              제출자: {expense.submitter.name}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px] text-[var(--apple-secondary-label)]">
              제목
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              autoFocus
            />
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px] text-[var(--apple-secondary-label)]">
              카테고리
            </Label>
            <Select value={category} onValueChange={(v) => v && setCategory(v)}>
              <SelectTrigger className="w-full h-9 text-sm" aria-label="카테고리 선택">
                <SelectValue placeholder="카테고리 선택">
                  {selectedCategoryLabel}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px] text-[var(--apple-secondary-label)]">
              금액 (원)
            </Label>
            <Input
              value={amount}
              onChange={(e) => {
                const val = e.target.value.replace(/[^\d]/g, "");
                setAmount(val);
              }}
              inputMode="numeric"
              placeholder="0"
            />
            {amount && !isNaN(parseInt(amount, 10)) && (
              <p className="text-[12px] text-[var(--apple-secondary-label)]">
                {formatAmount(parseInt(amount, 10))}원
              </p>
            )}
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px] text-[var(--apple-secondary-label)]">
              상태
            </Label>
            <Select value={status} onValueChange={(v) => v && setStatus(v as ExpenseStatus)}>
              <SelectTrigger className="w-full h-9 text-sm" aria-label="상태 선택">
                <SelectValue placeholder="상태 선택">
                  {selectedStatusLabel}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px] text-[var(--apple-secondary-label)]">
              날짜
            </Label>
            <Input
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 mt-4">
          <Button
            variant="ghost"
            className="rounded-full h-9 px-5 text-[var(--apple-secondary-label)]"
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !title.trim() || !amount}
            className="rounded-full h-9 px-6 bg-[var(--apple-blue)] hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)] text-white"
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin mr-1.5" />
                저장 중...
              </>
            ) : (
              "저장"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
