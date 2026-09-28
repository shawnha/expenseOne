import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { taxInvoiceRequests, type TaxInvoiceRequestRow } from "@/lib/db/schema-tax-invoice";
import {
  findHometaxMatch,
  issuerName,
  summarizeItems,
  type HometaxInvoiceRef,
  type TaxInvoiceStatus,
} from "@/lib/tax-invoice";
import type { CreateTaxInvoiceInput, UpdateTaxInvoiceInput } from "@/lib/validations/tax-invoice";
import { AppError } from "./attachment.service";
import { notifyTaxInvoiceIssued, notifyTaxInvoiceRequested } from "./notification.service";

// ---------------------------------------------------------------------------
// 세금계산서 발행 요청 (drizzle/0026)
//
// 누구나 요청하고, 본인 것만 본다. 관리자는 전부 보고 홈택스에서 발행한 뒤 "발행 완료" 로 닫는다.
// ERP(hanahone_erp)는 **읽기만** 한다 — SIMS 홀세일 전표(wholesale_sales)로 요청을 미리 채우고,
// 홈택스 매출 계산서(invoices)로 "이미 발행된 것 같다" 를 알려 준다. ERP 표에는 절대 쓰지 않는다.
// ---------------------------------------------------------------------------

export interface Actor {
  id: string;
  name: string;
  role: "MEMBER" | "ADMIN";
}

export interface TaxInvoiceView {
  id: string;
  issuerCode: string;
  issuerName: string;
  buyerName: string;
  buyerBizNo: string;
  buyerCeo: string | null;
  buyerEmail: string | null;
  buyerAddress: string | null;
  items: string;
  supplyAmount: number;
  vatAmount: number;
  total: number;
  supplyDate: string;
  chargeType: string;
  memo: string | null;
  erpSalesDate: string | null;
  erpDocumentNo: string | null;
  status: TaxInvoiceStatus;
  requestedById: string | null;
  requestedByName: string | null;
  issuedAt: string | null;
  issuedByName: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  /** 발행 대기인데 홈택스에 같은 계산서가 보이면(관리자 화면 전용). */
  hometaxMatch: HometaxInvoiceRef | null;
  /** 이 사람이 고치거나 취소할 수 있나(발행 대기 + 본인 또는 관리자). */
  canEdit: boolean;
}

const iso = (v: Date | string | null) => (v == null ? null : new Date(v).toISOString());

function assertCanTouch(actor: Actor, row: TaxInvoiceRequestRow) {
  if (actor.role !== "ADMIN" && row.requestedById !== actor.id) {
    throw new AppError("FORBIDDEN", "본인이 요청한 건만 고칠 수 있습니다.");
  }
}

async function loadRow(id: string): Promise<TaxInvoiceRequestRow> {
  const [row] = await db.select().from(taxInvoiceRequests).where(eq(taxInvoiceRequests.id, id));
  if (!row) throw new AppError("NOT_FOUND", "요청을 찾을 수 없습니다.");
  return row;
}

function toColumns(input: CreateTaxInvoiceInput) {
  return {
    issuerCode: input.issuerCode,
    buyerName: input.buyerName,
    buyerBizNo: input.buyerBizNo,
    buyerCeo: input.buyerCeo,
    buyerEmail: input.buyerEmail,
    buyerAddress: input.buyerAddress,
    items: input.items,
    supplyAmount: input.supplyAmount,
    vatAmount: input.vatAmount,
    supplyDate: input.supplyDate,
    chargeType: input.chargeType,
    memo: input.memo,
    erpSalesDate: input.erpSalesDate,
    erpDocumentNo: input.erpDocumentNo,
  };
}

// --- 쓰기 -----------------------------------------------------------------------------

export async function createTaxInvoiceRequest(actor: Actor, input: CreateTaxInvoiceInput) {
  const [row] = await db
    .insert(taxInvoiceRequests)
    .values({ ...toColumns(input), requestedById: actor.id })
    .returning();

  // 알림이 실패해도 요청은 이미 들어갔다.
  try {
    await notifyTaxInvoiceRequested({
      requestId: row.id,
      requesterId: actor.id,
      requesterName: actor.name,
      buyerName: row.buyerName,
      total: row.supplyAmount + row.vatAmount,
    });
  } catch (err) {
    console.error("[Notification] 세금계산서 요청 알림 실패:", err);
  }
  return row;
}

export async function updateTaxInvoiceRequest(actor: Actor, id: string, input: UpdateTaxInvoiceInput) {
  const row = await loadRow(id);
  assertCanTouch(actor, row);
  if (row.status !== "REQUESTED") {
    throw new AppError("VALIDATION_ERROR", "발행 대기 중인 요청만 고칠 수 있습니다.");
  }
  const [updated] = await db
    .update(taxInvoiceRequests)
    .set({ ...toColumns(input), updatedAt: sql`now()` })
    // 그사이 발행·취소됐으면 0행 — 발행된 계산서와 다른 내용으로 요청이 바뀌면 안 된다.
    .where(and(eq(taxInvoiceRequests.id, id), eq(taxInvoiceRequests.status, "REQUESTED")))
    .returning();
  if (!updated) throw new AppError("VALIDATION_ERROR", "그사이 발행되었거나 취소되었습니다. 새로고침해주세요.");
  return updated;
}

/** 관리자: 발행 완료 ↔ 발행 대기. 잘못 눌렀을 때 되돌릴 수 있어야 또 놓치지 않는다. */
export async function setTaxInvoiceIssued(actor: Actor, id: string, issued: boolean) {
  if (actor.role !== "ADMIN") throw new AppError("FORBIDDEN", "관리자만 발행 처리할 수 있습니다.");
  const row = await loadRow(id);
  if (row.status === "CANCELLED") throw new AppError("VALIDATION_ERROR", "취소된 요청입니다.");
  if ((row.status === "ISSUED") === issued) return row;

  const [updated] = await db
    .update(taxInvoiceRequests)
    .set(
      issued
        ? { status: "ISSUED", issuedAt: sql`now()`, issuedById: actor.id, updatedAt: sql`now()` }
        : { status: "REQUESTED", issuedAt: null, issuedById: null, updatedAt: sql`now()` },
    )
    .where(and(eq(taxInvoiceRequests.id, id), eq(taxInvoiceRequests.status, issued ? "REQUESTED" : "ISSUED")))
    .returning();
  if (!updated) throw new AppError("VALIDATION_ERROR", "상태가 그사이 바뀌었습니다. 새로고침해주세요.");

  if (issued && updated.requestedById && updated.requestedById !== actor.id) {
    try {
      await notifyTaxInvoiceIssued({
        requestId: updated.id,
        requesterId: updated.requestedById,
        buyerName: updated.buyerName,
        total: updated.supplyAmount + updated.vatAmount,
      });
    } catch (err) {
      console.error("[Notification] 세금계산서 발행 알림 실패:", err);
    }
  }
  return updated;
}

/** 발행 대기 중인 요청만 취소한다. 이미 발행된 계산서는 홈택스에서 수정세금계산서로 처리할 일이다. */
export async function cancelTaxInvoiceRequest(actor: Actor, id: string, reason: string | null) {
  const row = await loadRow(id);
  assertCanTouch(actor, row);
  if (row.status !== "REQUESTED") {
    throw new AppError("VALIDATION_ERROR", "발행 대기 중인 요청만 취소할 수 있습니다.");
  }
  const [updated] = await db
    .update(taxInvoiceRequests)
    .set({
      status: "CANCELLED",
      cancelledAt: sql`now()`,
      cancelledById: actor.id,
      cancelReason: reason,
      updatedAt: sql`now()`,
    })
    .where(and(eq(taxInvoiceRequests.id, id), eq(taxInvoiceRequests.status, "REQUESTED")))
    .returning();
  if (!updated) throw new AppError("VALIDATION_ERROR", "그사이 발행되었거나 취소되었습니다. 새로고침해주세요.");
  return updated;
}

// --- 읽기 -----------------------------------------------------------------------------

/** 관리자는 전부, 나머지는 본인 것만. 발행 대기가 위, 그 안에서 오래된 것부터(놓치지 않게). */
export async function listTaxInvoiceRequests(actor: Actor): Promise<TaxInvoiceView[]> {
  const rows = await db
    .select({
      r: taxInvoiceRequests,
      requestedByName: sql<string | null>`(SELECT name FROM expenseone.users WHERE id = ${taxInvoiceRequests.requestedById})`,
      issuedByName: sql<string | null>`(SELECT name FROM expenseone.users WHERE id = ${taxInvoiceRequests.issuedById})`,
    })
    .from(taxInvoiceRequests)
    .where(actor.role === "ADMIN" ? undefined : eq(taxInvoiceRequests.requestedById, actor.id))
    .orderBy(
      sql`CASE ${taxInvoiceRequests.status} WHEN 'REQUESTED' THEN 0 WHEN 'ISSUED' THEN 1 ELSE 2 END`,
      sql`CASE WHEN ${taxInvoiceRequests.status} = 'REQUESTED' THEN ${taxInvoiceRequests.createdAt} END ASC`,
      desc(taxInvoiceRequests.createdAt),
    )
    .limit(300);

  const hometax = actor.role === "ADMIN" ? await loadHometaxCandidates(rows.map((x) => x.r)) : [];

  return rows.map(({ r, requestedByName, issuedByName }) => {
    const total = r.supplyAmount + r.vatAmount;
    return {
      id: r.id,
      issuerCode: r.issuerCode,
      issuerName: issuerName(r.issuerCode),
      buyerName: r.buyerName,
      buyerBizNo: r.buyerBizNo,
      buyerCeo: r.buyerCeo,
      buyerEmail: r.buyerEmail,
      buyerAddress: r.buyerAddress,
      items: r.items,
      supplyAmount: r.supplyAmount,
      vatAmount: r.vatAmount,
      total,
      supplyDate: r.supplyDate,
      chargeType: r.chargeType,
      memo: r.memo,
      erpSalesDate: r.erpSalesDate,
      erpDocumentNo: r.erpDocumentNo,
      status: r.status as TaxInvoiceStatus,
      requestedById: r.requestedById,
      requestedByName,
      issuedAt: iso(r.issuedAt),
      issuedByName,
      cancelledAt: iso(r.cancelledAt),
      cancelReason: r.cancelReason,
      createdAt: iso(r.createdAt)!,
      hometaxMatch:
        r.status === "REQUESTED"
          ? findHometaxMatch(
              { issuerCode: r.issuerCode, bizNo: r.buyerBizNo, total, supplyDate: r.supplyDate },
              hometax,
            )
          : null,
      canEdit: r.status === "REQUESTED" && (actor.role === "ADMIN" || r.requestedById === actor.id),
    };
  });
}

export async function getTaxInvoiceRequest(actor: Actor, id: string) {
  const row = await loadRow(id);
  if (actor.role !== "ADMIN" && row.requestedById !== actor.id) {
    throw new AppError("NOT_FOUND", "요청을 찾을 수 없습니다.");
  }
  return row;
}

/** 발행 대기 요청들의 사업자번호로 ERP 홈택스 매출 계산서를 한 번에 가져온다. */
async function loadHometaxCandidates(rows: TaxInvoiceRequestRow[]): Promise<HometaxInvoiceRef[]> {
  const pending = rows.filter((r) => r.status === "REQUESTED");
  if (pending.length === 0) return [];
  const bizNos = [...new Set(pending.map((r) => r.buyerBizNo))];
  const minDate = pending.map((r) => r.supplyDate).sort()[0];
  try {
    const found = await db.execute<{ issue_date: string; total: string; biz_no: string; entity_code: string }>(sql`
      SELECT i.issue_date::text AS issue_date, i.total::text AS total,
             regexp_replace(coalesce(i.counterparty_biz_no, ''), '[^0-9]', '', 'g') AS biz_no, i.entity_code
        FROM hanahone_erp.invoices i
       WHERE i.direction = 'sales' AND i.source_kind = 'tax_invoice' AND i.status <> 'cancelled'
         AND i.issue_date >= (${minDate}::date - 7)
         AND regexp_replace(coalesce(i.counterparty_biz_no, ''), '[^0-9]', '', 'g') IN (${sql.join(
           bizNos.map((b) => sql`${b}`),
           sql`, `,
         )})
       LIMIT 2000`);
    return [...found].map((f) => ({
      issueDate: f.issue_date,
      total: Math.round(Number(f.total)),
      bizNo: f.biz_no,
      issuerCode: f.entity_code,
    }));
  } catch (err) {
    // ERP 표를 못 읽어도 목록은 떠야 한다 — 대조 힌트만 빠진다.
    console.error("[TaxInvoice] 홈택스 대조 실패:", err);
    return [];
  }
}

// --- 입력 도우미: 거래처 찾기 · SIMS 전표 불러오기 ----------------------------------------

export interface BuyerSuggestion {
  name: string;
  bizNo: string;
  ceo: string | null;
  email: string | null;
  address: string | null;
  source: "request" | "hometax";
}

/**
 * 거래처 이름으로 찾기. ① 전에 요청한 거래처(대표자·이메일까지 기억) ② ERP 가 모은 홈택스 매출 계산서의
 * 상대방(이름·사업자번호). SIMS 거래처 이름은 계산서 상호와 거의 안 맞아서(549곳 중 4곳) 쓰지 않는다.
 *
 * ⚠️ 권한: ERP 는 홀세일 매출을 master 한 명에게만 보여 준다. 여기서 넓히지 않는다 — ②는 관리자만,
 * ①도 관리자가 아니면 **본인 요청**에서만 찾는다(남의 요청은 목록에서도 안 보인다).
 */
export async function suggestBuyers(actor: Actor, q: string): Promise<BuyerSuggestion[]> {
  const isAdmin = actor.role === "ADMIN";
  const term = q.trim();
  if (term.length < 1) return [];
  const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

  const mine = await db.execute<{
    name: string; biz_no: string; ceo: string | null; email: string | null; address: string | null;
  }>(sql`
    SELECT DISTINCT ON (buyer_biz_no) buyer_name AS name, buyer_biz_no AS biz_no,
           buyer_ceo AS ceo, buyer_email AS email, buyer_address AS address
      FROM expenseone.tax_invoice_requests
     WHERE (buyer_name ILIKE ${like} OR buyer_biz_no LIKE ${`%${term.replace(/\D/g, "") || "~"}%`})
       ${isAdmin ? sql`` : sql`AND requested_by_id = ${actor.id}::uuid`}
     ORDER BY buyer_biz_no, created_at DESC
     LIMIT 10`);

  let hometax: { name: string; biz_no: string }[] = [];
  if (isAdmin) try {
    hometax = [
      ...(await db.execute<{ name: string; biz_no: string }>(sql`
        SELECT DISTINCT ON (biz) counterparty AS name, biz AS biz_no
          FROM (SELECT counterparty, regexp_replace(coalesce(counterparty_biz_no, ''), '[^0-9]', '', 'g') AS biz, issue_date
                  FROM hanahone_erp.invoices
                 WHERE direction = 'sales' AND counterparty ILIKE ${like}) s
         WHERE length(biz) = 10
         ORDER BY biz, issue_date DESC
         LIMIT 10`)),
    ];
  } catch (err) {
    console.error("[TaxInvoice] 거래처 찾기(ERP) 실패:", err);
  }

  const seen = new Set<string>();
  const out: BuyerSuggestion[] = [];
  for (const m of mine) {
    seen.add(m.biz_no);
    out.push({ name: m.name, bizNo: m.biz_no, ceo: m.ceo, email: m.email, address: m.address, source: "request" });
  }
  for (const h of hometax) {
    if (seen.has(h.biz_no)) continue;
    seen.add(h.biz_no);
    out.push({ name: h.name, bizNo: h.biz_no, ceo: null, email: null, address: null, source: "hometax" });
  }
  return out.slice(0, 12);
}

export interface ErpSalesDoc {
  salesDate: string;
  documentNo: string;
  payeeName: string;
  supplyAmount: number;
  vatAmount: number;
  total: number;
  items: string;
  lineCount: number;
}

/**
 * SIMS 홀세일 전표(하루치). 전표 번호는 날마다 1부터 다시 세서 (날짜, 번호)가 한 전표다.
 * ⚠️ 관리자 전용 — 부르는 쪽(라우트·화면)이 막는다. ERP 도 홀세일 매출은 master 에게만 보인다.
 */
export async function listErpSalesDocs(salesDate: string, q?: string, documentNo?: string): Promise<ErpSalesDoc[]> {
  const like = q?.trim() ? `%${q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  const rows = await db.execute<{
    document_no: string; payee: string; supply: string; vat: string; total: string; names: string[]; lines: number;
  }>(sql`
    SELECT document_no, max(payee_name) AS payee,
           sum(supply_amount)::text AS supply, sum(vat)::text AS vat, sum(total_amount)::text AS total,
           array_agg(product_name ORDER BY row_number) AS names, count(*)::int AS lines
      FROM hanahone_erp.wholesale_sales
     WHERE sales_date = ${salesDate}::date AND NOT coalesce(is_cancel, false)
       ${documentNo ? sql`AND document_no = ${documentNo}` : sql``}
       ${like ? sql`AND payee_name ILIKE ${like}` : sql``}
     GROUP BY document_no
     ORDER BY NULLIF(regexp_replace(document_no, '[^0-9]', '', 'g'), '')::int NULLS LAST, document_no
     LIMIT 200`);
  return [...rows].map((r) => {
    const supply = Math.round(Number(r.supply));
    const vat = Math.round(Number(r.vat));
    return {
      salesDate,
      documentNo: r.document_no,
      payeeName: r.payee,
      supplyAmount: supply,
      vatAmount: vat,
      total: Math.round(Number(r.total)),
      items: summarizeItems(r.names ?? []),
      lineCount: r.lines,
    };
  });
}

/** 사이드 메뉴 「세금계산서」 숫자(관리자): 발행 대기 건수. */
export async function countPendingTaxInvoices(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(taxInvoiceRequests)
    .where(eq(taxInvoiceRequests.status, "REQUESTED"));
  return Number(row?.n ?? 0);
}

export async function getRequesterName(userId: string): Promise<string | null> {
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  return u?.name ?? null;
}
