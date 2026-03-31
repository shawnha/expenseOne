import { getActiveCompanies } from "@/services/company.service";
import DepositRequestForm from "./deposit-request-form";

export default async function DepositRequestPage() {
  const companies = await getActiveCompanies();
  const serialized = companies.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
  }));

  return <DepositRequestForm initialCompanies={serialized} />;
}
