import { redirect } from "next/navigation";
import { getAuthUser, getCachedClient } from "@/lib/supabase/cached";
import { GowidCardMappings } from "./gowid-card-mappings";

export const dynamic = "force-dynamic";

export default async function GowidSettingsPage() {
  const authUser = await getAuthUser();
  if (!authUser) redirect("/login");

  const supabase = await getCachedClient();
  const { data: user } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();

  if (user?.role !== "ADMIN") redirect("/");

  const [{ data: appUsers }, { data: companyRows }] = await Promise.all([
    supabase.from("users").select("id, name, email").eq("is_active", true).order("name"),
    supabase.from("companies").select("id, name, slug").eq("is_active", true).order("sort_order"),
  ]);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div>
        <h1 className="text-title3 text-[var(--apple-label)]">카드 관리</h1>
        <p className="text-footnote text-[var(--apple-secondary-label)] mt-0.5">
          법인카드를 발급사별로 분류하고, 사용자와 회사를 매핑합니다.
        </p>
      </div>
      <GowidCardMappings
        appUsers={(appUsers ?? []).map((u) => ({ id: u.id, name: u.name, email: u.email }))}
        companies={(companyRows ?? []).map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
      />
    </div>
  );
}
