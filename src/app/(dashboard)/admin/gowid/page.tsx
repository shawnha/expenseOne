import { getAdminCommonCardUsage } from "@/services/common-card-usage.service";
import { Pagination } from "@/components/expenses/pagination";
import { redirect } from "next/navigation";
import { getAuthUser, getCachedClient } from "@/lib/supabase/cached";
import { GowidCardMappings } from "./gowid-card-mappings";

export const dynamic = "force-dynamic";

export default async function GowidSettingsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const authUser = await getAuthUser();
  if (!authUser) redirect("/login");

  const supabase = await getCachedClient();
  const { data: user } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();

  if (user?.role !== "ADMIN") redirect("/");

  const page = Math.max(1, Math.min(10000, Number.parseInt((await searchParams).page ?? "1", 10) || 1));
  const [{ data: appUsers }, { data: companyRows }, usage] = await Promise.all([
    supabase.from("users").select("id, name, email").eq("is_active", true).order("name"),
    supabase.from("companies").select("id, name, slug").eq("is_active", true).order("sort_order"),
    getAdminCommonCardUsage(page),
  ]);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div>
        <h1 className="text-title3 text-[var(--apple-label)]">카드 관리</h1>
        <p className="text-footnote text-[var(--apple-secondary-label)] mt-0.5">
          법인카드를 발급사별로 분류하고, 사용자와 회사를 매핑합니다.
        </p>
      </div>
      <section id="common-card-usage" className="glass space-y-3 p-4 sm:p-5">
        <h2 className="text-subheadline font-semibold">공용 카드 사용 이력</h2>
        {usage.rows.length === 0 ? (
          <p className="text-sm text-[var(--apple-secondary-label)]">등록된 사용 기록이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-[var(--apple-separator)]">
            {usage.rows.map((entry) => (
              <li key={entry.id} className="grid gap-1 py-2.5 text-sm sm:grid-cols-[1fr_1.5fr_1fr] sm:gap-3">
                <span className="font-medium">{entry.userName ?? "이전 사용자"}</span>
                <span>{entry.companyName ?? "이전 법인"} · •••• {entry.lastFour}</span>
                <span className="tabular-nums text-[var(--apple-secondary-label)]">
                  {entry.startedOn} ~ {entry.endedOn ?? "사용 중"}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={page} total={usage.total} totalPages={usage.totalPages} />
      </section>
      <GowidCardMappings
        appUsers={(appUsers ?? []).map((u) => ({ id: u.id, name: u.name, email: u.email }))}
        companies={(companyRows ?? []).map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
      />
    </div>
  );
}
