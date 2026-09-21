"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import { CalendarIcon, CreditCard, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateISO } from "@/lib/validations/expense-form";
import { needsCardLastFourWarning } from "@/lib/expense-convert";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// 입금요청 → 법카 사용으로 변경
//
// 수정 폼 안에서 열리지만 폼과는 별개 요청(POST /convert-to-card)이다. 다이얼로그는
// 포털로 그려져 폼 밖에 있지만, 트리거 버튼은 폼 안에 있으므로 반드시 type="button".
// 보이는 조건(SUBMITTED·사입 아님·후지급 없음)은 canShowConvertButton이 정하고,
// 최종 판단은 서버가 한다 — 409가 오면 서버 문구를 그대로 보여주고 화면을 새로고침한다.
// ---------------------------------------------------------------------------

interface ConvertToCardDialogProps {
  expenseId: string;
  /** 현재 거래일(YYYY-MM-DD). 카드 결제일로 미리 채운다. */
  transactionDate: string;
  /**
   * 보는 사람(=제출자) 프로필의 카드 끝 4자리. 없으면 카드 내역이 이 건과 합쳐지지
   * 않으므로 변경 **전에** 경고한다. 변경을 막지는 않는다 — 카드가 아예 없는 건이 아니라
   * 등록만 안 한 경우가 대부분이고, 설정에서 등록하면 다음 동기화부터 합쳐진다.
   */
  viewerCardLastFour?: string | null;
  /** 폼이 제출 중이면 함께 잠근다. */
  disabled?: boolean;
}

export function ConvertToCardDialog({
  expenseId,
  transactionDate,
  viewerCardLastFour = null,
  disabled = false,
}: ConvertToCardDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>(
    transactionDate ? new Date(transactionDate + "T00:00:00") : undefined,
  );
  const [merchantName, setMerchantName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const warnMissingCard = needsCardLastFourWarning(viewerCardLastFour);

  const handleConvert = async () => {
    if (!date) {
      toast.error("거래일을 선택해주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/expenses/${expenseId}/convert-to-card`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionDate: formatDateISO(date),
          merchantName: merchantName.trim() || null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        // 409(승인됨·연결됨 등)·403 — 서버 문구에 다음 행동이 들어 있으니 조금 오래 띄운다.
        toast.error(json?.error?.message ?? "법카 사용으로 변경하지 못했습니다.", { duration: 8000 });
        if (res.status === 409) {
          setOpen(false);
          router.refresh();
        }
        return;
      }
      toast.success("법카 사용으로 변경되었습니다. 승인 없이 바로 등록됩니다.");
      // 변경 전 경고를 못 본 경우(서버가 본 제출자 프로필에만 4자리가 없을 때)만 사후 안내.
      // 경고를 보고 "그래도 변경"을 누른 사람에게 같은 말을 또 하지 않는다.
      if (!warnMissingCard && json?.data && json.data.cardLastFour == null) {
        toast.info("설정에서 카드 끝 4자리를 등록하면 이후 카드 내역이 이 건과 자동으로 합쳐집니다.", {
          duration: 8000,
        });
      }
      setOpen(false);
      router.push(`/expenses/${expenseId}`);
      router.refresh();
    } catch {
      toast.error("법카 사용으로 변경하는 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="w-full sm:w-auto sm:mr-auto rounded-full h-11 glass border-[var(--apple-separator)] text-[var(--apple-label)] apple-press"
      >
        <CreditCard className="size-4" aria-hidden />
        법카 사용으로 변경
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (submitting) return;
          setOpen(next);
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-subheadline font-semibold text-[var(--apple-label)]">
              법카 사용으로 변경
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed text-[var(--apple-secondary-label)]">
              법인카드로 결제한 비용이면 승인 없이 바로 법카 사용으로 등록됩니다. 계좌 정보는
              지워지고, 이후 카드 내역이 자동으로 들어오면 이 건과 합쳐집니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>
                거래일 <span className="text-[var(--apple-red)]">*</span>
              </Label>
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger
                  className={cn(
                    "flex h-11 w-full items-center justify-start gap-2 rounded-xl border border-[var(--apple-separator)] bg-[var(--apple-secondary-system-background)] px-3 text-sm transition-colors hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)]",
                    !date && "text-[var(--apple-secondary-label)]",
                  )}
                  aria-label={`거래일: ${date ? format(date, "yyyy.MM.dd", { locale: ko }) : "날짜 선택"}`}
                >
                  <CalendarIcon className="size-4 text-[var(--apple-secondary-label)]" aria-hidden />
                  <span className="tabular-nums">
                    {date ? format(date, "yyyy.MM.dd", { locale: ko }) : "날짜 선택"}
                  </span>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => {
                      setDate(d ?? undefined);
                      setDateOpen(false);
                    }}
                    disabled={(d) => d > new Date()}
                    locale={ko}
                  />
                </PopoverContent>
              </Popover>
              <p className="text-[11px] text-[var(--apple-secondary-label)]">
                카드 결제일을 넣어주세요. 결제일 앞뒤 2일 안의 카드 내역이 이 건과 합쳐집니다.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="convert-merchant-name">
                가맹점명{" "}
                <span className="text-[11px] font-normal text-[var(--apple-secondary-label)]">(선택)</span>
              </Label>
              <Input
                id="convert-merchant-name"
                value={merchantName}
                onChange={(e) => setMerchantName(e.target.value)}
                maxLength={200}
                placeholder="예: 교보문고"
                className="h-11"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !submitting) {
                    e.preventDefault();
                    void handleConvert();
                  }
                }}
              />
            </div>

            {/* 카드 끝 4자리 미등록 — 변경 전 경고(DESIGN.md Alerts: 12px 반경, 경고색 10%/20%, 아이콘+텍스트) */}
            {warnMissingCard && (
              <div
                role="alert"
                className="flex gap-2.5 rounded-xl border border-[rgba(255,149,0,0.2)] bg-[rgba(255,149,0,0.1)] dark:bg-[rgba(255,159,10,0.14)] p-4"
              >
                <TriangleAlert className="size-4 shrink-0 mt-0.5 text-[var(--apple-orange)]" aria-hidden />
                <div className="space-y-1.5">
                  <p className="text-[13px] font-medium leading-relaxed text-[var(--apple-label)]">
                    카드 끝 4자리가 등록돼 있지 않아 이후 카드 내역이 자동으로 합쳐지지 않습니다.
                    설정에서 등록한 뒤 변경하는 것을 권합니다.
                  </p>
                  <Link
                    href="/settings"
                    className="inline-flex min-h-11 items-center text-[13px] font-medium text-[var(--apple-blue)] underline-offset-4 hover:underline"
                  >
                    설정으로 이동
                  </Link>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="rounded-full h-11 glass border-[var(--apple-separator)]"
            >
              취소
            </Button>
            <Button
              type="button"
              onClick={handleConvert}
              disabled={submitting || !date}
              className="rounded-full h-11 bg-[var(--apple-blue)] hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)] text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  변경 중...
                </>
              ) : warnMissingCard ? (
                "그래도 변경"
              ) : (
                "법카 사용으로 변경"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
