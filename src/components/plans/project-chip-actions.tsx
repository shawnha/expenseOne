"use client";

import { useRef, useState } from "react";
import { MoreHorizontal, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BoardProject } from "@/services/plan.service";
import { planFetch } from "./plan-client";

// ---------------------------------------------------------------------------
// 보드의 프로젝트 칩에서 바로 쓰는 관리 메뉴(참여자 관리·삭제).
//
// 선택된 칩 옆의 "⋯" 버튼(44px)으로 연다 — 폰·키보드도 같은 길. 오른쪽 클릭은 칩 쪽에서
// 이 메뉴를 열도록 open 을 올려 받는다. 삭제는 만든 사람·대표만(canDelete, 서버가 최종).
// ---------------------------------------------------------------------------

export function ProjectChipActions({
  project,
  open,
  onOpenChange,
  onManageMembers,
  onDeleted,
}: {
  project: BoardProject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onManageMembers: () => void;
  onDeleted: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const lock = useRef(false);

  async function handleDelete() {
    if (lock.current) return;
    lock.current = true;
    setDeleting(true);
    try {
      const res = await planFetch<{ id: string; planCount: number }>(`/api/plans/projects/${project.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      const n = res.data.planCount;
      toast.success(
        n > 0 ? `'${project.name}' 프로젝트와 계획 ${n}건을 삭제했습니다.` : `'${project.name}' 프로젝트를 삭제했습니다.`,
      );
      setConfirmOpen(false);
      onDeleted();
    } finally {
      setDeleting(false);
      lock.current = false;
    }
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={`${project.name} 프로젝트 관리`}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--apple-secondary-label)] transition-colors hover:bg-[var(--apple-tertiary-system-fill)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--apple-blue)]"
            />
          }
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={6} className="w-48 glass-strong p-1">
          <DropdownMenuItem className="min-h-11" onClick={onManageMembers}>
            <Users className="size-4" aria-hidden="true" />
            <span>참여자 관리</span>
          </DropdownMenuItem>
          {project.canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="min-h-11 text-[var(--apple-red)] data-[highlighted]:text-[var(--apple-red)]"
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                <span>프로젝트 삭제</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={(next) => !deleting && setConfirmOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>프로젝트 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{project.name}</strong> 프로젝트와 그 안의 계획·메모·연결이 모두 목록에서 사라집니다.
              참여자에게도 더 이상 보이지 않습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <Button type="button" variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? "삭제하는 중..." : "삭제"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
