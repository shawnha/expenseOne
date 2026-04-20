import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users, companies, gowidCardMappings } from "@/lib/db/schema";
import { desc, eq, asc } from "drizzle-orm";
import { getAuthUser, getCachedClient } from "@/lib/supabase/cached";
import { UsersTable } from "./users-table";
import { getActiveCompanies } from "@/services/company.service";

export default async function AdminUsersPage() {
  // DEV ONLY: mock data
  if (process.env.BYPASS_AUTH === 'true') {
    const mockUsers = [
      { id: "dev-user-id", name: "개발자", email: "dev@company.com", role: "ADMIN", isActive: true, createdAt: "2026-01-01T00:00:00Z", cardLastFour: "1234", companyId: "c1", companyName: "한아원코리아", companySlug: "korea" },
      { id: "user-2", name: "김철수", email: "kim@company.com", role: "MEMBER", isActive: true, createdAt: "2026-01-15T00:00:00Z", cardLastFour: "5678", companyId: "c2", companyName: "한아원리테일", companySlug: "retail" },
      { id: "user-3", name: "이영희", email: "lee@company.com", role: "MEMBER", isActive: true, createdAt: "2026-02-01T00:00:00Z", cardLastFour: null, companyId: null, companyName: null, companySlug: null },
      { id: "user-4", name: "박지민", email: "park@company.com", role: "MEMBER", isActive: false, createdAt: "2026-02-15T00:00:00Z", cardLastFour: "9012", companyId: "c1", companyName: "한아원코리아", companySlug: "korea" },
    ];

    return (
      <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
        <div>
          <h1 className="text-title3 text-[var(--apple-label)]">사용자 관리</h1>
          <p className="text-sm text-[var(--apple-secondary-label)]">팀원 역할 및 계정을 관리하세요.</p>
        </div>
        <UsersTable users={mockUsers} currentUserId="dev-user-id" />
      </div>
    );
  }

  const supabase = await getCachedClient();
  const authUser = await getAuthUser();

  if (!authUser) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();

  if (profile?.role !== "ADMIN") redirect("/");

  const [allUsers, activeCompanies, cardMappings] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
        cardLastFour: users.cardLastFour,
        companyId: users.companyId,
        companyName: companies.name,
        companySlug: companies.slug,
      })
      .from(users)
      .leftJoin(companies, eq(users.companyId, companies.id))
      .orderBy(desc(users.createdAt)),
    getActiveCompanies(),
    db
      .select({
        id: gowidCardMappings.id,
        cardLastFour: gowidCardMappings.cardLastFour,
        cardAlias: gowidCardMappings.cardAlias,
        userId: gowidCardMappings.userId,
      })
      .from(gowidCardMappings)
      .where(eq(gowidCardMappings.isActive, true)),
  ]);

  // Group card mappings by userId
  const cardsByUser = new Map<string, { id: string; cardLastFour: string; cardAlias: string | null }[]>();
  const unmappedCards: { id: string; cardLastFour: string; cardAlias: string | null }[] = [];
  for (const m of cardMappings) {
    const entry = { id: m.id, cardLastFour: m.cardLastFour, cardAlias: m.cardAlias };
    if (m.userId) {
      const list = cardsByUser.get(m.userId) ?? [];
      list.push(entry);
      cardsByUser.set(m.userId, list);
    } else {
      unmappedCards.push(entry);
    }
  }

  const serialized = allUsers.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
    cardLastFour: u.cardLastFour,
    gowidCards: cardsByUser.get(u.id) ?? [],
  }));

  const companyOptions = activeCompanies.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
  }));

  return (
    <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
      <div>
        <h1 className="text-title3 text-[var(--apple-label)]">사용자 관리</h1>
        <p className="text-sm text-[var(--apple-secondary-label)]">
          팀원 역할 및 계정을 관리하세요.
        </p>
      </div>
      <UsersTable users={serialized} currentUserId={authUser.id} companies={companyOptions} unmappedCards={unmappedCards} />
    </div>
  );
}
