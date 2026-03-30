import Link from "next/link";
import { ExpenseOneLogo } from "@/components/layout/expense-one-logo";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--apple-system-background,#f2f2f7)] px-4 text-center">
      {/* Branding */}
      <div className="mb-6">
        <ExpenseOneLogo size="lg" showIcon />
      </div>

      {/* Glass card */}
      <div className="glass w-full max-w-sm rounded-2xl border border-[var(--apple-separator,rgba(0,0,0,0.1))] p-8">
        <p className="mb-2 text-5xl font-bold text-[var(--apple-blue,#007AFF)]">404</p>
        <h1 className="mb-2 text-lg font-semibold text-[var(--apple-label,#1c1c1e)]">
          페이지를 찾을 수 없습니다
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-[var(--apple-secondary-label,#8e8e93)]">
          요청하신 페이지가 존재하지 않거나 이동되었습니다.
        </p>
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--apple-blue,#007AFF)] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[color-mix(in_srgb,var(--apple-blue,#007AFF)_85%,black)]"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
