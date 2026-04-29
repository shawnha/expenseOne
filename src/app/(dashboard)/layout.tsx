import { redirect } from "next/navigation";
import { getAuthUser, getCachedClient, getCachedCurrentUser } from "@/lib/supabase/cached";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { BottomTabBar } from "@/components/layout/bottom-tab-bar";
import { PullToRefresh } from "@/components/layout/pull-to-refresh";
import { SplashDismiss } from "@/components/layout/splash-dismiss";
import { PushPrompt } from "@/components/layout/push-prompt";
import { Toaster } from "@/components/ui/sonner";
import { SwUpdatePrompt } from "@/components/layout/sw-update-prompt";
import { BuildUpdateToast } from "@/components/layout/build-update-toast";
import { CompanySelectModal } from "@/components/layout/company-select-modal";
import { ParallaxOrbs } from "@/components/layout/parallax-orbs";
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
        <BuildUpdateToast />
        <Toaster position="top-center" richColors />
        <div className="flex h-dvh overflow-hidden">
          <Sidebar user={mockUser} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header user={mockUser} unreadCount={3} />
            <main className="relative flex-1 overflow-y-auto overflow-x-hidden p-4 pb-[calc(1rem+66px+env(safe-area-inset-bottom,0px))] lg:p-6 lg:pb-6" style={{ viewTransitionName: "main-content" }}>
              {/* Ambient gradient orbs for glass depth */}
              <ParallaxOrbs />
              <div className="relative z-[1]">
                {children}
              </div>
            </main>
          </div>
        </div>
        <BottomTabBar userId="dev-user-id" isAdmin={mockUser.role === "ADMIN"} unreadCount={3} />
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

  // Fetch profile (cached — shared with child pages) and notification count in parallel.
  // Hard 6s timeout guards against pooler stalls; if either query hangs, we
  // render the layout with a degraded fallback rather than blocking the
  // whole tree on a single slow query.
  const LAYOUT_TIMEOUT_MS = 6000;
  const layoutTimer = <T,>(p: PromiseLike<T>, fb: T): Promise<T> =>
    Promise.race([
      Promise.resolve(p),
      new Promise<T>((resolve) =>
        setTimeout(() => {
          console.error("[DashboardLayout] query timeout, falling back");
          resolve(fb);
        }, LAYOUT_TIMEOUT_MS),
      ),
    ]);

  const [cachedUser, notifResult] = await Promise.all([
    layoutTimer(getCachedCurrentUser(), null),
    layoutTimer(
      supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("recipient_id", authUser.id)
        .eq("is_read", false)
        .then((r) => ({ count: r.count })),
      { count: 0 } as { count: number | null },
    ),
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

  // Show company selection modal for existing users without a company
  const showCompanyModal = cachedUser != null && cachedUser.companyId == null;

  return (
    <>
      <PullToRefresh />
      <PushPrompt />
      <SwUpdatePrompt />
      <BuildUpdateToast />
      <Toaster position="top-center" richColors />
      {showCompanyModal && <CompanySelectModal />}
      <div className="flex h-dvh overflow-hidden">
        {/* Desktop Sidebar */}
        <Sidebar user={user} />

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header user={user} unreadCount={unreadCount ?? 0} />

          <main className="relative flex-1 overflow-y-auto overflow-x-hidden p-4 pb-[calc(1rem+66px+env(safe-area-inset-bottom,0px))] lg:p-6 lg:pb-6" style={{ viewTransitionName: "main-content" }}>
            {/* Ambient gradient orbs for glass depth */}
            <ParallaxOrbs />
            <div className="relative z-[1]">
              {children}
            </div>
          </main>
        </div>
      </div>
      <BottomTabBar
        userId={user.id}
        isAdmin={user.role === "ADMIN"}
        unreadCount={unreadCount ?? 0}
      />
    </>
  );
}
