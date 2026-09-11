import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCachedCurrentUser } from "@/lib/supabase/cached";
import { listRecurringExpenses } from "@/services/recurring-expense.service";
import { getActiveCompanies } from "@/services/company.service";
import { CATEGORY_OPTIONS } from "@/lib/validations/expense-form";
import { getMyCustomCategories } from "@/services/category.service";
import { RecurringManager } from "./recurring-manager";

// ---------------------------------------------------------------------------
// 반복 입금요청 설정
//
// 월세·구독료처럼 매번 같은 내용으로 올리는 입금요청을 등록해두면, 예정일에
// 자동으로 승인 대기에 올라간다. 등록자에게도 알림이 가므로 금액이 달라졌으면
// 승인 전에 고칠 수 있다.
// ---------------------------------------------------------------------------

async function Content() {
  const user = await getCachedCurrentUser();
  if (!user) redirect("/login");

  const [rows, companies, myCategories] = await Promise.all([
    listRecurringExpenses(user.id, user.role === "ADMIN"),
    getActiveCompanies(),
    getMyCustomCategories(user.id),
  ]);

  // 반복 등록은 "한 번 만들어두고 계속 쓰는" 화면이다. 여기서만 프리셋으로
  // 제한하면 평소 쓰던 카테고리로는 반복 등록을 아예 못 만든다.
  const categoryOptions = [
    ...CATEGORY_OPTIONS.map((c) => ({ value: c.value, label: c.label })),
    ...myCategories.map((c) => ({ value: c, label: c })),
  ];

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div>
        <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--apple-label)] sm:text-2xl">
          반복 입금요청
        </h1>
        <p className="mt-1 text-[13px] text-[var(--apple-secondary-label)]">
          정해둔 날짜가 되면 입금요청이 자동으로 등록되고, 등록자에게 알림이 갑니다.
          금액이 달라졌으면 승인 전에 수정하시면 됩니다.
        </p>
      </div>

      <RecurringManager
        rows={rows}
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        categories={categoryOptions}
        defaultCompanyId={user.companyId ?? null}
      />
    </div>
  );
}

export default function RecurringPage() {
  return (
    <Suspense
      fallback={
        <div className="flex animate-pulse flex-col gap-4">
          <div className="h-6 w-40 rounded-lg bg-[var(--apple-tertiary-system-fill)]" />
          <div className="h-10 w-36 rounded-full bg-[var(--apple-tertiary-system-fill)]" />
          <div className="h-24 rounded-2xl bg-[var(--apple-tertiary-system-fill)]" />
        </div>
      }
    >
      <Content />
    </Suspense>
  );
}
