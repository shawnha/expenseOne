import { getActiveCompanies } from '@/services/company.service';
import { getAuthUser } from '@/lib/supabase/cached';
import { getMyCustomCategories } from '@/services/category.service';
import DepositBatchForm from './deposit-batch-form';
export const dynamic = 'force-dynamic';
export default async function DepositBatchPage() {
  const user = await getAuthUser();
  const [companies, categories] = await Promise.all([getActiveCompanies(), user ? getMyCustomCategories(user.id) : Promise.resolve([])]);
  return <DepositBatchForm initialCompanies={companies.map(c => ({ id: c.id, name: c.name, slug: c.slug, currency: c.currency ?? 'KRW' }))} myCategories={categories} />;
}
