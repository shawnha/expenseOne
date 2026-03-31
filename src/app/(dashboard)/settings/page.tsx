import { redirect } from "next/navigation";
import { getAuthUser, getCachedClient } from "@/lib/supabase/cached";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  // DEV ONLY: mock data
  if (process.env.BYPASS_AUTH === 'true') {
    const user = {
      name: "개발자",
      email: "dev@company.com",
      role: "ADMIN" as const,
      department: "개발팀",
      cardLastFour: null as string | null,
      companyId: null as string | null,
    };

    return (
      <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
        <div className="animate-fade-up">
          <h1 className="text-lg sm:text-xl font-semibold text-[var(--apple-label)]">설정</h1>
          <p className="text-sm text-[var(--apple-secondary-label)]">계정 정보를 확인하고 수정하세요.</p>
        </div>
        <SettingsForm user={user} />
      </div>
    );
  }

  const supabase = await getCachedClient();
  const authUser = await getAuthUser();

  if (!authUser) redirect("/login");

  const { data: userProfile } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  const user = userProfile
    ? {
        name: userProfile.name,
        email: userProfile.email,
        role: userProfile.role as "MEMBER" | "ADMIN",
        department: userProfile.department as string | null,
        cardLastFour: (userProfile.card_last_four ?? null) as string | null,
        companyId: (userProfile.company_id ?? null) as string | null,
      }
    : {
        name:
          authUser.user_metadata?.full_name ??
          authUser.email?.split("@")[0] ??
          "사용자",
        email: authUser.email ?? "",
        role: "MEMBER" as const,
        department: null,
        cardLastFour: null,
        companyId: null,
      };

  return (
    <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
      <div className="animate-fade-up">
        <h1 className="text-lg sm:text-xl font-semibold text-[var(--apple-label)]">설정</h1>
        <p className="text-sm text-[var(--apple-secondary-label)]">계정 정보를 확인하고 수정하세요.</p>
      </div>
      <SettingsForm user={user} />
    </div>
  );
}
