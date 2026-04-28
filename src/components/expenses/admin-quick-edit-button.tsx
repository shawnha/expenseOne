"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";

export function AdminQuickEditButton({ expense }: { expense: { id: string } }) {
  return (
    <Link
      href={`/expenses/${expense.id}/edit`}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full glass text-sm font-medium text-[var(--apple-orange)] hover:bg-[rgba(255,149,0,0.1)] transition-colors apple-press"
    >
      <Pencil className="size-3.5" />
      수정
    </Link>
  );
}
