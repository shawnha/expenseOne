import { redirect } from "next/navigation";

export default async function BrandSettlementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams({ view: "settlements" });
  for (const [key, value] of Object.entries(await searchParams)) {
    if (key !== "view" && typeof value === "string") params.set(key, value);
  }
  redirect(`/expenses?${params}`);
}
