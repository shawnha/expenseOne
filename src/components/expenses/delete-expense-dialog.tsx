"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";

interface DeleteExpenseDialogProps {
  expenseId: string;
  expenseTitle: string;
}

export function DeleteExpenseDialog({
  expenseId,
  expenseTitle,
}: DeleteExpenseDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/expenses/${expenseId}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          const data = await res.json();
          toast.error(data.error?.message ?? "삭제에 실패했습니다.");
          return;
        }

        toast.success("비용이 삭제되었습니다.");
        setOpen(false);
        router.push("/expenses");
        router.refresh();
      } catch {
        toast.error("삭제 중 오류가 발생했습니다.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="destructive" size="sm">
            <Trash2 className="size-4 mr-1" />
            삭제
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>비용 삭제</DialogTitle>
          <DialogDescription>
            &quot;{expenseTitle}&quot; 비용을 삭제하시겠습니까? 이 작업은 되돌릴 수 없으며, 관련 첨부파일도 함께 삭제됩니다.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            취소
          </DialogClose>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? "삭제 중..." : "삭제"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
