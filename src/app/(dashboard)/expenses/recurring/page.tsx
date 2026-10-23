import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCachedCurrentUser } from "@/lib/supabase/cached";
import { listRecurringExpenses } from "@/services/recurring-expense.service";
import { getActiveCompanies } from "@/services/company.service";
import { CATEGORY_OPTIONS } from "@/lib/validations/expense-form";
import { getMyCustomCategories } from "@/services/category.service";
import { RecurringManager } from "./recurring-manager";

// ---------------------------------------------------------------------------
// 반복 지급
//
// 매달 나가는 돈을 한 번 등록하면 비용계획에 미리 깔리고, 예정일에 입금요청을
// 올리라고 알려 준다(방식에 따라 자동 제출 / 계획에만).
// ---------------------------------------------------------------------------

async function Content({ focusId }: { focusId: string | null }) {
  const user = await getCachedCurrentUser();
  if (!user) redirect("/login");

  const [rows, companies, myCategories] = await Promise.all([
    listRecurringExpenses(user.id, user.role === "ADMIN"),
    getActiveCompanies(),
    getMyCustomCategories(user.id),
  ]);

  // 반복 등록은 "한 번 만들어두고 계속 쓰는" 화면이다. 여기서만 프리셋으로
  // 제한하면 평소 쓰던 카테고리로는 반복 등록을 아예 못 만든다.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

  const categoryOptions = [
    ...CATEGORY_OPTIONS.map((c) => ({ value: c.value, label: c.label })),
    ...myCategories.map((c) => ({ value: c, label: c })),
  ];

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div>
        <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--apple-label)] sm:text-2xl">
          반복 지급
        </h1>
        <p className="mt-1 text-[13px] text-[var(--apple-secondary-label)]">
          매달 나가는 돈을 한 번 등록하면 비용계획에 미리 깔리고, 날짜가 되면 입금요청을 올리라고 알려 드려요.
        </p>
      </div>

      <RecurringManager
        rows={rows}
        companies={companies.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          currency: c.currency ?? "KRW",
        }))}
        categories={categoryOptions}
        defaultCompanyId={user.companyId ?? null}
        isAdmin={user.role === "ADMIN"}
        today={today}
        focusId={focusId}
      />
    </div>
  );
}

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const focusId = typeof sp.focus === "string" ? sp.focus : null;
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
      <Content focusId={focusId} />
    </Suspense>
  );
}
