import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { User as UserType } from "@/types";

export default async function SettingsPage() {
  // DEV ONLY: mock data
  if (process.env.BYPASS_AUTH === 'true') {
    const user = {
      name: "개발자",
      email: "dev@company.com",
      role: "ADMIN" as const,
      department: "개발팀",
    };

    return (
      <div className="flex flex-col gap-5">
        <div className="animate-fade-up">
          <h1 className="text-lg sm:text-xl font-semibold text-[var(--apple-label)]">설정</h1>
          <p className="text-sm text-[var(--apple-secondary-label)]">계정 정보를 확인하세요.</p>
        </div>
        <SettingsContent user={user} />
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) redirect("/login");

  const { data: userProfile } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  const user: Pick<UserType, "name" | "email" | "role" | "department"> =
    userProfile
      ? {
          name: userProfile.name,
          email: userProfile.email,
          role: userProfile.role as UserType["role"],
          department: userProfile.department,
        }
      : {
          name:
            authUser.user_metadata?.full_name ??
            authUser.email?.split("@")[0] ??
            "사용자",
          email: authUser.email ?? "",
          role: "MEMBER",
          department: null,
        };

  return (
    <div className="flex flex-col gap-5">
      <div className="animate-fade-up">
        <h1 className="text-lg sm:text-xl font-semibold text-[var(--apple-label)]">설정</h1>
        <p className="text-sm text-[var(--apple-secondary-label)]">계정 정보를 확인하세요.</p>
      </div>
      <SettingsContent user={user} />
    </div>
  );
}

function SettingsContent({
  user,
}: {
  user: Pick<UserType, "name" | "email" | "role" | "department">;
}) {
  const fields = [
    { label: "이름", value: user.name },
    { label: "이메일", value: user.email },
    { label: "부서", value: user.department ?? "미지정" },
  ];

  const initial = user.name ? user.name.charAt(0) : "U";

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="glass p-6 animate-card-enter stagger-1">
        <h2 className="text-[15px] font-semibold text-[var(--apple-label)] mb-5">프로필 정보</h2>

        {/* Avatar */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-[rgba(0,122,255,0.12)] text-[#007AFF] text-xl sm:text-2xl font-semibold">
            {initial}
          </div>
          <div>
            <p className="text-base font-semibold text-[var(--apple-label)]">{user.name}</p>
            <span className={user.role === "ADMIN" ? "glass-badge glass-badge-blue animate-spring-pop" : "glass-badge glass-badge-gray animate-spring-pop"}>
              {user.role === "ADMIN" ? "관리자" : "멤버"}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {fields.map((field) => (
            <div key={field.label} className="flex flex-col gap-1">
              <span className="text-[13px] text-[var(--apple-secondary-label)]">{field.label}</span>
              <span className="text-sm font-medium text-[var(--apple-label)]">{field.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="glass p-6 animate-card-enter stagger-2">
        <h2 className="text-[15px] font-semibold text-[var(--apple-label)] mb-5">계정 정보</h2>
        <div className="space-y-3 text-sm text-[var(--apple-secondary-label)]">
          <p>프로필 정보는 Google 계정을 기반으로 자동 설정됩니다.</p>
          <p>역할 변경은 관리자에게 문의해주세요.</p>
          <p>부서 정보 변경이 필요한 경우 관리자에게 요청하세요.</p>
        </div>
      </div>
    </div>
  );
}
