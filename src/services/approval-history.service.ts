import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { expenses, users, companies } from '@/lib/db/schema';
import { AppError } from '@/services/attachment.service';

/** 관리자 본인의 최근 승인만 표시한다. 승인 취소된 건은 승인 대기 목록으로 돌아간다. */
export async function getMyRecentApprovals(user: { id: string; role: string }, companySlug?: string) {
  if (user.role !== 'ADMIN') throw new AppError('FORBIDDEN', '관리자만 조회할 수 있습니다.');
  const since = new Date(Date.now() - 7 * 86400000);
  return db.select({ id: expenses.id, title: expenses.title, amount: expenses.amount, currency: expenses.currency,
    amountOriginal: expenses.amountOriginal, approvedAt: expenses.approvedAt, submitterName: users.name, companyName: companies.name })
    .from(expenses).leftJoin(users, eq(users.id, expenses.submittedById)).leftJoin(companies, eq(companies.id, expenses.companyId))
    .where(and(eq(expenses.type, 'DEPOSIT_REQUEST'), eq(expenses.status, 'APPROVED'), eq(expenses.approvedById, user.id),
      gte(expenses.approvedAt, since), ...(companySlug ? [eq(companies.slug, companySlug)] : [])))
    .orderBy(desc(expenses.approvedAt)).limit(10);
}
