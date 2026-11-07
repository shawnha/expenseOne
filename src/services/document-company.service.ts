import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { DocumentCompany } from "@/lib/ocr/company";

/** ERP의 법인 원장을 읽기만 한다. 사업자번호를 별도로 복제하거나 하드코딩하지 않는다. */
export async function getDocumentCompanies(): Promise<DocumentCompany[]> {
  const rows = await db.execute<{ id: string; name: string; business_number: string | null; legal_name: string | null; name_en: string | null }>(sql`
    SELECT c.id, c.name, e.business_number, e.name AS legal_name, e.name_en
      FROM expenseone.companies c
      LEFT JOIN hanahone_erp.entities e ON e.code = CASE c.slug
        WHEN 'korea' THEN 'HOK' WHEN 'retail' THEN 'HOR' WHEN 'hoi' THEN 'HOI'
        WHEN 'partners' THEN 'HOP' WHEN 'wholesale' THEN 'HOW' END
        AND e.is_active = true
     WHERE c.is_active = true
     ORDER BY c.sort_order, c.name
  `);
  return [...rows].map((r) => ({
    id: r.id, name: r.name, businessNumber: r.business_number,
    aliases: [r.legal_name, r.name_en].filter((n): n is string => !!n),
  }));
}
