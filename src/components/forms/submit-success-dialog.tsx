"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, CircleCheck } from "lucide-react";

interface SubmitSuccessDialogProps {
  open: boolean;
  /** 새로 작성하기 클릭 시 이동할 경로 */
  newSubmitPath: string;
  title?: string;
  description?: string;
  /**
   * 제출은 됐지만 첨부 업로드가 실패했을 때의 안내. 있으면 경고 상자와
   * 재첨부 버튼을 보여준다(토스트는 금방 사라지고 이 창은 모달이라).
   */
  warning?: string | null;
  /**
   * 경고가 있을 때 이동할 경로. 다시 첨부하려면 **수정 화면**이어야 한다
   * (`/expenses/<id>/edit`) — 상세 화면엔 보기·다운로드뿐이고 첨부를 추가할
   * 수단이 없다(`[id]/page.tsx`의 첨부 카드). 반품처럼 수정 화면이 없는 건만
   * 상세(`/expenses/<id>`)를 넘기고 `detailLabel`을 바꾼다.
   */
  detailHref?: string | null;
  /** 상세/수정 버튼 문구. 다시 첨부할 수 없는 건(반품)은 「상세 보기」로 바꾼다. */
  detailLabel?: string;
}

export function SubmitSuccessDialog({
  open,
  newSubmitPath,
  title = "제출 완료",
  description = "정상적으로 제출되었습니다.",
  warning,
  detailHref,
  detailLabel = "수정 화면에서 다시 첨부",
}: SubmitSuccessDialogProps) {
  const router = useRouter();
  // 첨부 실패 안내가 있으면 재첨부 버튼을 주 버튼으로 둔다.
  const showDetail = !!(warning && detailHref);

  return (
    <Dialog open={open} onOpenChange={() => {}} modal>
      <DialogContent showCloseButton={false} className="sm:max-w-[380px]">
        <DialogHeader className="items-center text-center">
          <div className="flex items-center justify-center size-14 rounded-full bg-[var(--apple-green)]/10 mb-2">
            <CircleCheck className="size-7 text-[var(--apple-green)]" />
          </div>
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {warning && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-[var(--apple-orange)]/20 bg-[var(--apple-orange)]/10 p-4 text-left"
          >
            <AlertTriangle className="size-4 shrink-0 mt-0.5 text-[var(--apple-orange)]" />
            <p className="text-[13px] text-[var(--apple-label)]">{warning}</p>
          </div>
        )}
        <DialogFooter className="flex flex-col gap-2 sm:flex-col">
          {showDetail && (
            <Button
              onClick={() => {
                if (detailHref) router.push(detailHref);
              }}
              className="w-full rounded-full h-11 bg-[var(--apple-blue)] hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)]"
            >
              {detailLabel}
            </Button>
          )}
          {/* 위계 3단. 경고가 있을 때 「추가 제출」까지 outline으로 두면
              바로 아래 「비용관리로 이동」과 배경·테두리·높이가 같아져
              두 버튼이 구분되지 않았다 — ghost로 한 단계 더 낮춘다. */}
          <Button
            variant={showDetail ? "ghost" : "default"}
            onClick={() => {
              router.push(newSubmitPath);
            }}
            className={
              showDetail
                ? "w-full rounded-full h-11 text-[var(--apple-secondary-label)]"
                : "w-full rounded-full h-11 bg-[var(--apple-blue)] hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)]"
            }
          >
            추가 제출
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              router.push("/expenses");
            }}
            className="w-full rounded-full h-11 glass border-[rgba(255,255,255,0.3)]"
          >
            비용관리로 이동
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
