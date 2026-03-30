import { redirect } from "next/navigation";

/**
 * /admin/dashboard → /admin redirect.
 * The admin dashboard lives at /admin (the admin route group's page.tsx).
 * This page handles stale bookmarks or manual URL entry.
 */
export default function AdminDashboardRedirect() {
  redirect("/admin");
}
