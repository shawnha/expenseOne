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

  const { data: appUsers } = await supabase
    .from("users")
    .select("id, name, email")
    .eq("is_active", true)
    .order("name");

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div>
        <h1 className="text-title3 text-[var(--apple-label)]">
          고위드 카드 관리
        </h1>
        <p className="text-footnote text-[var(--apple-secondary-label)] mt-0.5">
          법인카드와 사용자를 매핑하고, 거래 내역을 동기화합니다.
        </p>
      </div>
      <GowidCardMappings
        appUsers={(appUsers ?? []).map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
        }))}
      />
    </div>
  );
}
