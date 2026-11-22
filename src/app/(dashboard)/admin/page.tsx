import { redirect, unstable_rethrow } from "next/navigation";
import { getCachedCurrentUser } from "@/lib/supabase/cached";
import { getPeriodRange } from "@/lib/admin/dashboard-period";
import { getAdminDashboardData } from "@/services/admin-dashboard.service";
import { getActiveCompanies } from "@/services/company.service";
import { AdminDashboardContent } from "./dashboard-content";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage({ searchParams }: {
  searchParams: Promise<{ period?: string | string[]; company?: string | string[] }>;
}) {
  const user = await getCachedCurrentUser();
  if (user?.role !== "ADMIN") redirect("/");

  const params = await searchParams;
  const currentMonth = getPeriodRange("this_month").startDate.slice(0, 7);
  const requested = typeof params.period === "string" ? params.period : "";
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) && requested >= "1900-01" && requested <= currentMonth;
  const period = validMonth || ["3_months", "6_months", "this_year"].includes(requested) ? requested : currentMonth;
  const company = typeof params.company === "string" ? params.company : "";

  const [data, companies] = await Promise.all([
    getAdminDashboardData(period, company || null).catch((error) => {
      unstable_rethrow(error);
      console.error("[AdminDashboard] Failed to load dashboard", error instanceof Error ? error.name : "Unknown error");
      return null;
    }),
    getActiveCompanies().catch((error) => {
      unstable_rethrow(error);
      return [];
    }),
  ]);

  return <AdminDashboardContent
    data={data}
    period={period}
    currentMonth={currentMonth}
    company={company}
    companyOptions={companies.map(({ slug, name }) => ({ key: slug, label: name }))}
  />;
}
