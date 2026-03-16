import { redirect } from "next/navigation";
import { getAuthUser, getCachedClient } from "@/lib/supabase/cached";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { PageTransition } from "@/components/layout/page-transition";
import { LoginSplash } from "@/components/layout/login-splash";
import { PullToRefresh } from "@/components/layout/pull-to-refresh";
import { Toaster } from "@/components/ui/sonner";
import type { User } from "@/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // DEV ONLY: Bypass auth for frontend preview
  if (process.env.BYPASS_AUTH === 'true') {
    const mockUser: User = {
      id: "dev-user-id",
      email: "dev@company.com",
      name: "개발자",
      role: "ADMIN",
      department: "개발팀",
      profileImageUrl: null,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return (
      <>
        <PullToRefresh />
        <Toaster position="top-center" richColors />
        <div className="flex h-screen overflow-hidden">
          <Sidebar user={mockUser} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header user={mockUser} unreadCount={3} />
            <main className="flex-1 overflow-y-auto p-4 lg:p-6">
              <PageTransition>{children}</PageTransition>
            </main>
          </div>
        </div>
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

  // Fetch profile and notification count in parallel
  const [profileResult, notifResult] = await Promise.all([
    supabase.from("users").select("*").eq("id", authUser.id).single(),
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("recipient_id", authUser.id)
      .eq("is_read", false),
  ]);

  const { data: userProfile, error: profileError } = profileResult;
  const { count: unreadCount } = notifResult;

  if (profileError) {
    console.error("Failed to fetch user profile:", profileError.message);
  }

  // Redirect to onboarding if profile is incomplete
  if (userProfile && !userProfile.onboarding_completed) {
    redirect("/onboarding");
  }

  // If no profile exists, create a default one or redirect
  const user: User = userProfile
    ? {
        id: userProfile.id,
        email: userProfile.email,
        name: userProfile.name,
        role: userProfile.role as User["role"],
        department: userProfile.department,
        profileImageUrl: userProfile.profile_image_url,
        isActive: userProfile.is_active,
        createdAt: userProfile.created_at,
        updatedAt: userProfile.updated_at,
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
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

  return (
    <>
      <LoginSplash />
      <PullToRefresh />
      <Toaster position="top-center" richColors />
      <div className="flex h-screen overflow-hidden">
        {/* Desktop Sidebar */}
        <Sidebar user={user} />

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header user={user} unreadCount={unreadCount ?? 0} />

          <main className="flex-1 overflow-y-auto p-4 lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
