"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { AdminQuickEditDialog } from "@/components/expenses/admin-quick-edit-dialog";
import type { ExpenseType, ExpenseStatus } from "@/types";

interface QuickEditExpense {
  id: string;
  title: string;
  category: string;
  amount: number;
  status: ExpenseStatus;
  type: ExpenseType;
  createdAt: string;
  companyId?: string | null;
  submitter: { name: string } | null;
}

export function AdminQuickEditButton({ expense }: { expense: QuickEditExpense }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full glass text-sm font-medium text-[var(--apple-orange)] hover:bg-[rgba(255,149,0,0.1)] transition-colors apple-press"
      >
        <Pencil className="size-3.5" />
        수정
      </button>
      <AdminQuickEditDialog
        expense={expense}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
