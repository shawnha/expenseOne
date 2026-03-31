import { getActiveCompanies } from "@/services/company.service";
import CorporateCardForm from "./corporate-card-form";

export const dynamic = "force-dynamic";

export default async function CorporateCardPage() {
  const companies = await getActiveCompanies();
  const serialized = companies.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
  }));

  return <CorporateCardForm initialCompanies={serialized} />;
}
