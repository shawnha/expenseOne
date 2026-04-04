"use client";

import Link from "next/link";
import { CreditCard, Banknote, ArrowRight } from "lucide-react";
import { TiltCard } from "@/components/layout/tilt-card";

const expenseTypes = [
  {
    title: "법카사용 내역",
    description: "법인카드 사용내역을 제출합니다. 자동 승인됩니다.",
    href: "/expenses/new/corporate-card",
    icon: <CreditCard className="size-6 text-[var(--apple-blue)]" />,
  },
  {
    title: "입금요청",
    description: "입금을 요청합니다. 증빙서류 첨부 필수, 관리자 승인 후 처리됩니다.",
    href: "/expenses/new/deposit-request",
    icon: <Banknote className="size-6 text-[var(--apple-green)]" />,
  },
] as const;

export default function NewExpensePage() {
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="animate-fade-up">
        <h1 className="text-title3 text-[var(--apple-label)]">비용 제출</h1>
        <p className="mt-1 text-footnote text-[var(--apple-secondary-label)]">
          제출할 비용 유형을 선택해주세요.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {expenseTypes.map((type, index) => (
          <TiltCard key={type.href}>
            <Link
              href={type.href}
              className={`glass p-5 flex flex-col gap-3 transition-all duration-200 hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.08)] hover:shadow-lg hover:scale-[1.02] group apple-press animate-card-enter stagger-${index + 1}`}
            >
              <div className="flex items-center justify-center size-12 rounded-2xl bg-[var(--apple-secondary-system-background)]">
                {type.icon}
              </div>
              <div>
                <span className="text-subheadline font-semibold text-[var(--apple-label)] flex items-center gap-1">
                  {type.title}
                  <ArrowRight className="size-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 text-[var(--apple-blue)]" />
                </span>
                <p className="text-footnote text-[var(--apple-secondary-label)] leading-relaxed mt-1">
                  {type.description}
                </p>
              </div>
            </Link>
          </TiltCard>
        ))}
      </div>
    </div>
  );
}
