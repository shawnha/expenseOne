"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useCallback, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAmount } from "@/lib/validations/expense-form";
import { CATEGORY_OPTIONS } from "@/lib/validations/expense-form";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ExpenseType, ExpenseStatus } from "@/types";

interface ExpenseRow {
  id: string;
  type: ExpenseType;
  status: ExpenseStatus;
  title: string;
  amount: number;
  category: string;
  createdAt: string;
  submitter: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface ExpenseTableProps {
  expenses: ExpenseRow[];
  showSubmitter?: boolean;
  isAdmin?: boolean;
}

const TYPE_LABELS: Record<ExpenseType, { label: string; className: string }> = {
  CORPORATE_CARD: {
    label: "법카사용",
    className: "glass-badge glass-badge-blue",
  },
  DEPOSIT_REQUEST: {
    label: "입금요청",
    className: "glass-badge glass-badge-orange",
  },
};

const STATUS_LABELS: Record<ExpenseStatus, { label: string; className: string }> = {
  SUBMITTED: {
    label: "제출",
    className: "glass-badge glass-badge-blue",
  },
  APPROVED: {
    label: "승인",
    className: "glass-badge glass-badge-green",
  },
  REJECTED: {
    label: "반려",
    className: "glass-badge glass-badge-red",
  },
  CANCELLED: {
    label: "취소",
    className: "glass-badge glass-badge-gray",
  },
};

function getCategoryLabel(category: string): string {
  return CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? category;
}

function formatDateKR(dateStr: string): string {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

export function ExpenseTable({ expenses, showSubmitter = false, isAdmin = false }: ExpenseTableProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const handleAdminDelete = useCallback(async (expenseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmId !== expenseId) {
      setConfirmId(expenseId);
      return;
    }
    setDeletingId(expenseId);
    try {
      const res = await fetch(`/api/expenses/${expenseId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("삭제되었습니다.");
        router.refresh();
      } else {
        const json = await res.json().catch(() => null);
        toast.error(json?.error?.message ?? "삭제에 실패했습니다.");
      }
    } catch {
      toast.error("요청 중 오류가 발생했습니다.");
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  }, [confirmId, router]);

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block glass p-4 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>제목</TableHead>
              <TableHead>유형</TableHead>
              <TableHead className="text-right">금액</TableHead>
              <TableHead>카테고리</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>제출일</TableHead>
              {showSubmitter && <TableHead>제출자</TableHead>}
              {isAdmin && <TableHead className="text-center w-[72px]">작업</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((expense) => {
              const typeInfo = TYPE_LABELS[expense.type];
              const statusInfo = STATUS_LABELS[expense.status];
              const canAdminDelete = ["SUBMITTED", "CANCELLED", "APPROVED"].includes(expense.status);
              return (
                <TableRow
                  key={expense.id}
                  className="cursor-pointer hover:bg-[rgba(0,0,0,0.03)] transition-colors"
                  onClick={() => router.push(`/expenses/${expense.id}`)}
                  tabIndex={0}
                  role="link"
                  aria-label={`${expense.title} 상세 보기`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/expenses/${expense.id}`);
                    }
                  }}
                >
                  <TableCell className="font-medium max-w-[200px] truncate text-[var(--apple-label)]">
                    {expense.title}
                  </TableCell>
                  <TableCell>
                    <span className={typeInfo.className}>{typeInfo.label}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-[var(--apple-label)]">
                    {formatAmount(expense.amount)}원
                  </TableCell>
                  <TableCell className="text-[var(--apple-secondary-label)]">{getCategoryLabel(expense.category)}</TableCell>
                  <TableCell>
                    <span className={statusInfo.className}>{statusInfo.label}</span>
                  </TableCell>
                  <TableCell className="text-[var(--apple-secondary-label)]">
                    {formatDateKR(expense.createdAt)}
                  </TableCell>
                  {showSubmitter && (
                    <TableCell className="text-[var(--apple-secondary-label)]">{expense.submitter?.name ?? "-"}</TableCell>
                  )}
                  {isAdmin && (
                    <TableCell className="text-center w-[72px]">
                      {canAdminDelete && (
                        <button
                          onClick={(e) => handleAdminDelete(expense.id, e)}
                          disabled={deletingId === expense.id}
                          className={cn(
                            "px-2.5 py-1 text-xs font-medium rounded-lg transition-colors apple-press",
                            confirmId === expense.id
                              ? "bg-[#FF3B30] text-white hover:bg-[#d32f2f]"
                              : "text-[#FF3B30] hover:bg-[rgba(255,59,48,0.1)]"
                          )}
                          onBlur={() => setConfirmId(null)}
                        >
                          {deletingId === expense.id ? "..." : confirmId === expense.id ? "확인" : "삭제"}
                        </button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {expenses.map((expense) => (
          <SwipeableExpenseCard
            key={expense.id}
            expense={expense}
            showSubmitter={showSubmitter}
            onNavigate={() => router.push(`/expenses/${expense.id}`)}
            onActionComplete={() => router.refresh()}
          />
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Swipeable Mobile Card
// ---------------------------------------------------------------------------

function SwipeableExpenseCard({
  expense,
  showSubmitter,
  onNavigate,
  onActionComplete,
}: {
  expense: ExpenseRow;
  showSubmitter: boolean;
  onNavigate: () => void;
  onActionComplete: () => void;
}) {
  const router = useRouter();
  const typeInfo = TYPE_LABELS[expense.type];
  const statusInfo = STATUS_LABELS[expense.status];

  const canDelete = ["SUBMITTED", "CANCELLED", "APPROVED"].includes(expense.status);
  const canEdit = ["SUBMITTED", "APPROVED"].includes(expense.status);
  const swipeable = canDelete || canEdit;

  const cardRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentXRef = useRef(0);
  const swipingRef = useRef(false);
  // Gesture lock: null = undecided, "horizontal" = swipe locked, "vertical" = scroll locked
  const gestureLockRef = useRef<"horizontal" | "vertical" | null>(null);
  const [openDirection, setOpenDirection] = useState<"left" | "right" | null>(null);
  const [isActioning, setIsActioning] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const ACTION_WIDTH = 80;
  const LOCK_THRESHOLD = 12; // px to decide direction
  const SPRING_TRANSITION = "transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.02)";
  const EASE_TRANSITION = "transform 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)";

  const applyTransform = useCallback((x: number, transition?: string) => {
    if (!cardRef.current) return;
    cardRef.current.style.transform = `translateX(${x}px)`;
    cardRef.current.style.transition = transition ?? "none";
  }, []);

  // Store latest values in refs so touch handlers always see current state
  const openDirectionRef = useRef(openDirection);
  openDirectionRef.current = openDirection;
  const canDeleteRef = useRef(canDelete);
  canDeleteRef.current = canDelete;
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;
  const swipeableRef = useRef(swipeable);
  swipeableRef.current = swipeable;

  // Use ref-based touch event listeners with { passive: false } so preventDefault works
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const onTouchStart = (e: TouchEvent) => {
      if (!swipeableRef.current) return;
      startXRef.current = e.touches[0].clientX;
      startYRef.current = e.touches[0].clientY;
      currentXRef.current = openDirectionRef.current === "left" ? -ACTION_WIDTH : openDirectionRef.current === "right" ? ACTION_WIDTH : 0;
      swipingRef.current = false;
      gestureLockRef.current = null; // Reset gesture lock
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!swipeableRef.current) return;

      const deltaX = e.touches[0].clientX - startXRef.current;
      const deltaY = e.touches[0].clientY - startYRef.current;
      const absDX = Math.abs(deltaX);
      const absDY = Math.abs(deltaY);

      // Phase 1: Decide gesture direction (within first LOCK_THRESHOLD px of movement)
      if (gestureLockRef.current === null) {
        if (absDX < LOCK_THRESHOLD && absDY < LOCK_THRESHOLD) return; // Not enough movement yet
        // Lock direction: horizontal swipe only if X movement clearly dominates Y (at least 1.5x)
        gestureLockRef.current = absDX > absDY * 1.5 ? "horizontal" : "vertical";
      }

      // If vertical scroll is locked in, let the browser handle scrolling
      if (gestureLockRef.current === "vertical") return;

      // Phase 2: Horizontal swipe is locked in
      e.preventDefault();

      const base = openDirectionRef.current === "left" ? -ACTION_WIDTH : openDirectionRef.current === "right" ? ACTION_WIDTH : 0;
      const totalX = deltaX + base;

      if (totalX < 0 && !canDeleteRef.current) return;
      if (totalX > 0 && !canEditRef.current) return;

      swipingRef.current = true;
      const clampedX = Math.max(-ACTION_WIDTH, Math.min(ACTION_WIDTH, totalX));
      currentXRef.current = clampedX;
      applyTransform(clampedX);
    };

    const onTouchEnd = () => {
      if (!swipeableRef.current) return;

      // If gesture was vertical or undecided, don't snap
      if (gestureLockRef.current !== "horizontal") {
        gestureLockRef.current = null;
        swipingRef.current = false;
        return;
      }

      gestureLockRef.current = null;
      const threshold = ACTION_WIDTH * 0.35;
      const x = currentXRef.current;

      let finalX = 0;
      let dir: "left" | "right" | null = null;

      if (x < -threshold && canDeleteRef.current) {
        finalX = -ACTION_WIDTH;
        dir = "left";
      } else if (x > threshold && canEditRef.current) {
        finalX = ACTION_WIDTH;
        dir = "right";
      }

      setOpenDirection(dir);
      setConfirmingDelete(false);
      applyTransform(finalX, SPRING_TRANSITION);

      if (dir === null) {
        setTimeout(() => { swipingRef.current = false; }, 50);
      }
    };

    card.addEventListener("touchstart", onTouchStart, { passive: true });
    card.addEventListener("touchmove", onTouchMove, { passive: false });
    card.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      card.removeEventListener("touchstart", onTouchStart);
      card.removeEventListener("touchmove", onTouchMove);
      card.removeEventListener("touchend", onTouchEnd);
      clearTimeout(confirmTimeoutRef.current);
    };
  }, [applyTransform]);

  const resetSwipe = useCallback(() => {
    setOpenDirection(null);
    setConfirmingDelete(false);
    applyTransform(0, EASE_TRANSITION);
  }, [applyTransform, EASE_TRANSITION]);

  const handleCardClick = useCallback(() => {
    if (swipingRef.current) return;
    if (openDirection !== null) {
      resetSwipe();
      return;
    }
    onNavigate();
  }, [openDirection, onNavigate, resetSwipe]);

  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleDelete = useCallback(async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = setTimeout(() => {
        setConfirmingDelete(false);
      }, 3500);
      return;
    }
    clearTimeout(confirmTimeoutRef.current);
    if (isActioning) return;
    setIsActioning(true);
    try {
      const res = await fetch(`/api/expenses/${expense.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("삭제되었습니다.");
        onActionComplete();
      } else {
        const json = await res.json().catch(() => null);
        toast.error(json?.error?.message ?? "삭제에 실패했습니다.");
      }
    } catch {
      toast.error("요청 중 오류가 발생했습니다.");
    } finally {
      setIsActioning(false);
      resetSwipe();
    }
  }, [expense.id, isActioning, confirmingDelete, onActionComplete, resetSwipe]);

  const handleEdit = useCallback(() => {
    resetSwipe();
    router.push(`/expenses/${expense.id}/edit`);
  }, [expense.id, router, resetSwipe]);


  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Delete action behind the card (right side, revealed on left swipe) */}
      {canDelete && (
        <div className="absolute inset-y-0 right-0 flex items-stretch" style={{ width: ACTION_WIDTH }}>
          <button
            onClick={handleDelete}
            disabled={isActioning}
            className={cn(
              "flex flex-1 items-center justify-center text-white text-xs font-semibold transition-colors",
              confirmingDelete
                ? "bg-[#c0291f] active:bg-[#a01e16]"
                : "bg-[#FF3B30] active:bg-[#d32f2f]"
            )}
            aria-label={confirmingDelete ? "삭제 확인" : "삭제"}
          >
            {confirmingDelete ? "확인?" : "삭제"}
          </button>
        </div>
      )}

      {/* Edit action behind the card (left side, revealed on right swipe) */}
      {canEdit && (
        <div className="absolute inset-y-0 left-0 flex items-stretch" style={{ width: ACTION_WIDTH }}>
          <button
            onClick={handleEdit}
            className="flex flex-1 items-center justify-center bg-[#007AFF] text-white text-xs font-semibold active:bg-[#005ec4] transition-colors"
            aria-label="수정"
          >
            수정
          </button>
        </div>
      )}

      {/* Foreground card */}
      <div
        ref={cardRef}
        onClick={handleCardClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleCardClick();
          }
        }}
        tabIndex={0}
        className="relative flex flex-col gap-2 p-4 text-left rounded-xl bg-white dark:bg-[#1C1C1E] border border-[var(--glass-border)] shadow-sm cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-[#007AFF] focus-visible:ring-offset-1 outline-none"
        style={{ willChange: "transform" }}
        role="button"
        aria-label={`${expense.title} 상세 보기`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-[var(--apple-label)] truncate">{expense.title}</span>
          <span className={statusInfo.className}>{statusInfo.label}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={typeInfo.className}>{typeInfo.label}</span>
            <span className="text-xs text-[var(--apple-secondary-label)]">
              {getCategoryLabel(expense.category)}
            </span>
          </div>
          <span className="text-sm font-medium tabular-nums text-[var(--apple-label)]">
            {formatAmount(expense.amount)}원
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-[var(--apple-secondary-label)]">
          <span>{formatDateKR(expense.createdAt)}</span>
          {showSubmitter && expense.submitter && (
            <span>{expense.submitter.name}</span>
          )}
        </div>
      </div>
    </div>
  );
}
