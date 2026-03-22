"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CircleCheck } from "lucide-react";

interface SubmitSuccessDialogProps {
  open: boolean;
  /** 새로 작성하기 클릭 시 이동할 경로 */
  newSubmitPath: string;
  title?: string;
  description?: string;
}

export function SubmitSuccessDialog({
  open,
  newSubmitPath,
  title = "제출 완료",
  description = "정상적으로 제출되었습니다.",
}: SubmitSuccessDialogProps) {
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
        <DialogFooter className="flex flex-col gap-2 sm:flex-col">
          <Button
            onClick={() => {
              window.location.href = newSubmitPath;
            }}
            className="w-full rounded-full h-11 bg-[var(--apple-blue)] hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)]"
          >
            추가 제출
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = "/expenses";
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
