import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleError } from "@/lib/api-utils";
import { getAdminDashboardData } from "@/services/admin-dashboard.service";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = request.nextUrl;
    const data = await getAdminDashboardData(searchParams.get("period") ?? "this_month", searchParams.get("company"));
    return NextResponse.json({ data });
  } catch (err) {
    return handleError(err);
  }
}
