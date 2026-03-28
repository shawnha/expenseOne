"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function BackToListButton() {
  const router = useRouter();

  const handleClick = () => {
    // If the user navigated here from the list, go back to preserve filters.
    // If they landed directly (no history), fall back to /expenses.
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/expenses");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 text-sm text-[var(--apple-blue)] hover:text-[color-mix(in_srgb,var(--apple-blue)_85%,black)] transition-colors font-medium apple-press"
    >
      <ArrowLeft className="size-3.5" />
      목록으로
    </button>
  );
}
