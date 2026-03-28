import { redirect } from "next/navigation";
import { getAuthUser, getCachedClient, getCachedCurrentUser } from "@/lib/supabase/cached";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { BottomTabBar } from "@/components/layout/bottom-tab-bar";
import { PullToRefresh } from "@/components/layout/pull-to-refresh";
import { SplashDismiss } from "@/components/layout/splash-dismiss";
import { PushPrompt } from "@/components/layout/push-prompt";
import { Toaster } from "@/components/ui/sonner";
import type { User } from "@/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // DEV ONLY: Bypass auth for frontend preview
  if (process.env.BYPASS_AUTH === 'true' && process.env.NODE_ENV === 'development') {
    const mockUser: User = {
      id: "dev-user-id",
      email: "dev@company.com",
      name: "개발자",
      role: "ADMIN",
      department: "개발팀",
      profileImageUrl: null,
      cardLastFour: null,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return (
      <>
        <SplashDismiss />
        <PullToRefresh />
        <PushPrompt />
        <Toaster position="top-center" richColors />
        <div className="flex h-dvh overflow-hidden">
          <Sidebar user={mockUser} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header user={mockUser} unreadCount={3} />
            <main className={`relative flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-6 lg:pb-6 ${mockUser.role === "ADMIN" ? "pb-[calc(1rem+66px+env(safe-area-inset-bottom,0px))]" : ""}`}>
              {/* Ambient gradient orbs for glass depth */}
              <div className="ambient-orb ambient-orb-blue" aria-hidden="true" />
              <div className="ambient-orb ambient-orb-purple" aria-hidden="true" />
              <div className="ambient-orb ambient-orb-teal" aria-hidden="true" />
              <div className="relative z-[1]">
                {children}
              </div>
            </main>
          </div>
        </div>
        {mockUser.role === "ADMIN" && (
          <BottomTabBar userId="dev-user-id" isAdmin={true} unreadCount={3} />
        )}
      </>
    );
  }

  let supabase;
  try {
    supabase = await getCachedClient();
  } catch (e) {
    console.error("Failed to create Supabase client:", e);
    redirect("/login");
  }

  // Get authenticated user (cached — shared with child pages)
  const authUser = await getAuthUser();

  if (!authUser) {
    redirect("/login");
  }

  // Fetch profile (cached — shared with child pages) and notification count in parallel
  const [cachedUser, notifResult] = await Promise.all([
    getCachedCurrentUser(),
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("recipient_id", authUser.id)
      .eq("is_read", false),
  ]);

  const { count: unreadCount } = notifResult;

  // Redirect to onboarding if profile is incomplete
  if (cachedUser && !cachedUser.onboardingCompleted) {
    redirect("/onboarding");
  }

  // Map cached profile to User type, fallback to auth metadata if no profile
  const user: User = cachedUser
    ? {
        id: cachedUser.id,
        email: cachedUser.email,
        name: cachedUser.name,
        role: cachedUser.role,
        department: cachedUser.department,
        profileImageUrl: cachedUser.profileImageUrl,
        cardLastFour: null,
        isActive: cachedUser.isActive,
        createdAt: String(cachedUser.createdAt),
        updatedAt: String(cachedUser.updatedAt),
      }
    : {
        id: authUser.id,
        email: authUser.email ?? "",
        name:
          authUser.user_metadata?.full_name ??
          authUser.email?.split("@")[0] ??
          "사용자",
        role: "MEMBER",
        department: null,
        profileImageUrl: authUser.user_metadata?.avatar_url ?? null,
        cardLastFour: null,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

  return (
    <>
      <PullToRefresh />
      <PushPrompt />
      <Toaster position="top-center" richColors />
      <div className="flex h-dvh overflow-hidden">
        {/* Desktop Sidebar */}
        <Sidebar user={user} />

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header user={user} unreadCount={unreadCount ?? 0} />

          <main className={`relative flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-6 lg:pb-6 ${user.role === "ADMIN" ? "pb-[calc(1rem+66px+env(safe-area-inset-bottom,0px))]" : ""}`}>
            {/* Ambient gradient orbs for glass depth */}
            <div className="ambient-orb ambient-orb-blue" aria-hidden="true" />
            <div className="ambient-orb ambient-orb-purple" aria-hidden="true" />
            <div className="ambient-orb ambient-orb-teal" aria-hidden="true" />
            <div className="relative z-[1]">
              {children}
            </div>
          </main>
        </div>
      </div>
      {user.role === "ADMIN" && (
        <BottomTabBar
          userId={user.id}
          isAdmin={true}
          unreadCount={unreadCount ?? 0}
        />
      )}
    </>
  );
}
