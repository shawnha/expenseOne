import { sql } from "drizzle-orm";
import { check, date, index, integer, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { expenseSchema, users } from "./schema";

/**
 * tax_invoice_requests — 매출 세금계산서 발행 요청(drizzle/0026). **비용이 아니다** — expenses 와 따로 산다.
 * issuerCode = ERP entities.code(HOW 홀세일 등). 관리자가 홈택스에서 발행한 뒤 ISSUED 로 닫는다.
 * RLS 켜짐 + anon/authenticated 권한 없음 — 서버(postgres 롤)만 읽고 쓴다.
 */
export const taxInvoiceRequests = expenseSchema.table(
  "tax_invoice_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issuerCode: text("issuer_code").notNull().default("HOW"),
    buyerName: varchar("buyer_name", { length: 200 }).notNull(),
    buyerBizNo: varchar("buyer_biz_no", { length: 10 }).notNull(),
    buyerCeo: varchar("buyer_ceo", { length: 100 }),
    buyerEmail: varchar("buyer_email", { length: 254 }),
    buyerAddress: varchar("buyer_address", { length: 300 }),
    items: text("items").notNull(),
    supplyAmount: integer("supply_amount").notNull(),
    vatAmount: integer("vat_amount").notNull(),
    supplyDate: date("supply_date", { mode: "string" }).notNull(),
    chargeType: text("charge_type").notNull().default("CHARGE"),
    memo: text("memo"),
    erpSalesDate: date("erp_sales_date", { mode: "string" }),
    erpDocumentNo: varchar("erp_document_no", { length: 50 }),
    status: text("status").notNull().default("REQUESTED"),
    requestedById: uuid("requested_by_id").references(() => users.id, { onDelete: "set null" }),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    issuedById: uuid("issued_by_id").references(() => users.id, { onDelete: "set null" }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledById: uuid("cancelled_by_id").references(() => users.id, { onDelete: "set null" }),
    cancelReason: varchar("cancel_reason", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_tax_invoice_requests_status").on(t.status, t.createdAt),
    index("idx_tax_invoice_requests_requester").on(t.requestedById, t.createdAt),
    index("idx_tax_invoice_requests_buyer").on(t.buyerBizNo),
    check("tax_invoice_requests_issuer", sql`${t.issuerCode} IN ('HOW', 'HOK', 'HOR', 'HOP')`),
    check("tax_invoice_requests_biz_no", sql`${t.buyerBizNo} ~ '^[0-9]{10}$'`),
    check("tax_invoice_requests_amounts", sql`${t.supplyAmount} > 0 AND ${t.vatAmount} >= 0`),
    check("tax_invoice_requests_charge_type", sql`${t.chargeType} IN ('CHARGE', 'RECEIPT')`),
    check("tax_invoice_requests_status", sql`${t.status} IN ('REQUESTED', 'ISSUED', 'CANCELLED')`),
  ],
);

export type TaxInvoiceRequestRow = typeof taxInvoiceRequests.$inferSelect;
