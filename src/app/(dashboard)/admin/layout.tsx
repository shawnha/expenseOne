import { redirect } from "next/navigation";
import { getCachedCurrentUser } from "@/lib/supabase/cached";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCachedCurrentUser();

  if (!user || user.role !== "ADMIN") {
    redirect("/");
  }

  return <>{children}</>;
}
