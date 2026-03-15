import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { UsersTable } from "./users-table";

export default async function AdminUsersPage() {
  // DEV ONLY: mock data
  if (process.env.BYPASS_AUTH === 'true') {
    const mockUsers = [
      { id: "dev-user-id", name: "개발자", email: "dev@company.com", role: "ADMIN", department: "개발팀", isActive: true, createdAt: "2026-01-01T00:00:00Z", cardLastFour: "1234" },
      { id: "user-2", name: "김철수", email: "kim@company.com", role: "MEMBER", department: "디자인팀", isActive: true, createdAt: "2026-01-15T00:00:00Z", cardLastFour: "5678" },
      { id: "user-3", name: "이영희", email: "lee@company.com", role: "MEMBER", department: "마케팅팀", isActive: true, createdAt: "2026-02-01T00:00:00Z", cardLastFour: null },
      { id: "user-4", name: "박지민", email: "park@company.com", role: "MEMBER", department: "개발팀", isActive: false, createdAt: "2026-02-15T00:00:00Z", cardLastFour: "9012" },
    ];

    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-[var(--apple-label)]">사용자 관리</h1>
          <p className="text-sm text-[var(--apple-secondary-label)]">팀원 역할 및 계정을 관리하세요.</p>
        </div>
        <UsersTable users={mockUsers} currentUserId="dev-user-id" />
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();

  if (profile?.role !== "ADMIN") redirect("/");

  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      department: users.department,
      isActive: users.isActive,
      createdAt: users.createdAt,
      cardLastFour: users.cardLastFour,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  const serialized = allUsers.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
    cardLastFour: u.cardLastFour,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg sm:text-xl font-semibold text-[var(--apple-label)]">사용자 관리</h1>
        <p className="text-sm text-[var(--apple-secondary-label)]">
          팀원 역할 및 계정을 관리하세요.
        </p>
      </div>
      <UsersTable users={serialized} currentUserId={authUser.id} />
    </div>
  );
}
