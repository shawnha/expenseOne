"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
}

export function Pagination({ page, totalPages, total }: PaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  const goToPage = (targetPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (targetPage <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(targetPage));
    }
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  // Build visible page numbers
  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return (
    <div className="flex items-center justify-between gap-4 pt-2">
      <p className="text-sm text-[var(--apple-secondary-label)] font-medium">
        총 {total}건
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => goToPage(page - 1)}
          disabled={page <= 1}
          aria-label="이전 페이지"
          className="rounded-full glass border-[var(--apple-separator)]"
        >
          <ChevronLeft className="size-4" />
        </Button>
        {pages[0] > 1 && (
          <>
            <Button
              variant={page === 1 ? "default" : "outline"}
              size="sm"
              onClick={() => goToPage(1)}
              className={page === 1 ? "rounded-full bg-[#007AFF] hover:bg-[#0066d6]" : "rounded-full glass border-[var(--apple-separator)]"}
            >
              1
            </Button>
            {pages[0] > 2 && (
              <span className="px-1 text-[var(--apple-secondary-label)]">...</span>
            )}
          </>
        )}
        {pages.map((p) => (
          <Button
            key={p}
            variant={p === page ? "default" : "outline"}
            size="sm"
            onClick={() => goToPage(p)}
            aria-current={p === page ? "page" : undefined}
            className={p === page ? "rounded-full bg-[#007AFF] hover:bg-[#0066d6]" : "rounded-full glass border-[var(--apple-separator)]"}
          >
            {p}
          </Button>
        ))}
        {pages[pages.length - 1] < totalPages && (
          <>
            {pages[pages.length - 1] < totalPages - 1 && (
              <span className="px-1 text-[var(--apple-secondary-label)]">...</span>
            )}
            <Button
              variant={page === totalPages ? "default" : "outline"}
              size="sm"
              onClick={() => goToPage(totalPages)}
              className={page === totalPages ? "rounded-full bg-[#007AFF] hover:bg-[#0066d6]" : "rounded-full glass border-[var(--apple-separator)]"}
            >
              {totalPages}
            </Button>
          </>
        )}
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => goToPage(page + 1)}
          disabled={page >= totalPages}
          aria-label="다음 페이지"
          className="rounded-full glass border-[var(--apple-separator)]"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
