-- 0026 세금계산서 발행 요청 — 2026-09-23
-- 홀세일(HOW) 등에서 약국·의원에 판 건의 매출 세금계산서 발행을 요청하고, 관리자가 홈택스에서 발행한 뒤
-- "발행 완료"로 닫는다. **비용이 아니다** — expenses 에 넣지 않고(expense_type 에 값을 더하면 ERP 복제
-- CHECK 가 멈춘다) 전용 표로 둔다. 발행 법인은 ERP entities.code(HOW·HOK·HOR·HOP)로 적는다 —
-- 홀세일은 익스펜스원 companies 에 없다.
-- 새 표 규칙: 같은 트랜잭션에서 RLS + REVOKE ALL FROM anon, authenticated (서버는 postgres 롤로만 쓴다).
SET lock_timeout = '3s';
SET statement_timeout = '30s';
BEGIN;
CREATE TABLE expenseone.tax_invoice_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_code text NOT NULL DEFAULT 'HOW',
  buyer_name varchar(200) NOT NULL,
  buyer_biz_no varchar(10) NOT NULL,
  buyer_ceo varchar(100),
  buyer_email varchar(254),
  buyer_address varchar(300),
  items text NOT NULL,
  supply_amount integer NOT NULL,
  vat_amount integer NOT NULL,
  supply_date date NOT NULL,
  charge_type text NOT NULL DEFAULT 'CHARGE',
  memo text,
  erp_sales_date date,
  erp_document_no varchar(50),
  status text NOT NULL DEFAULT 'REQUESTED',
  requested_by_id uuid REFERENCES expenseone.users (id) ON DELETE SET NULL,
  issued_at timestamptz,
  issued_by_id uuid REFERENCES expenseone.users (id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancelled_by_id uuid REFERENCES expenseone.users (id) ON DELETE SET NULL,
  cancel_reason varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tax_invoice_requests_issuer CHECK (issuer_code IN ('HOW', 'HOK', 'HOR', 'HOP')),
  CONSTRAINT tax_invoice_requests_buyer_name_len CHECK (length(btrim(buyer_name)) BETWEEN 1 AND 200),
  CONSTRAINT tax_invoice_requests_biz_no CHECK (buyer_biz_no ~ '^[0-9]{10}$'),
  CONSTRAINT tax_invoice_requests_items_len CHECK (length(btrim(items)) BETWEEN 1 AND 1000),
  CONSTRAINT tax_invoice_requests_amounts CHECK (supply_amount > 0 AND vat_amount >= 0),
  CONSTRAINT tax_invoice_requests_charge_type CHECK (charge_type IN ('CHARGE', 'RECEIPT')),
  CONSTRAINT tax_invoice_requests_memo_len CHECK (memo IS NULL OR length(memo) <= 2000),
  CONSTRAINT tax_invoice_requests_status CHECK (status IN ('REQUESTED', 'ISSUED', 'CANCELLED')),
  CONSTRAINT tax_invoice_requests_issued_pair CHECK ((status = 'ISSUED') = (issued_at IS NOT NULL)),
  CONSTRAINT tax_invoice_requests_cancelled_pair CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL)),
  CONSTRAINT tax_invoice_requests_erp_ref_pair CHECK ((erp_sales_date IS NULL) = (erp_document_no IS NULL))
);
CREATE INDEX idx_tax_invoice_requests_status ON expenseone.tax_invoice_requests (status, created_at DESC);
CREATE INDEX idx_tax_invoice_requests_requester ON expenseone.tax_invoice_requests (requested_by_id, created_at DESC);
CREATE INDEX idx_tax_invoice_requests_buyer ON expenseone.tax_invoice_requests (buyer_biz_no);
ALTER TABLE expenseone.tax_invoice_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON expenseone.tax_invoice_requests FROM anon, authenticated;
SELECT relname, relrowsecurity FROM pg_class WHERE oid = 'expenseone.tax_invoice_requests'::regclass;
SELECT grantee, count(*) FROM information_schema.role_table_grants
 WHERE table_schema = 'expenseone' AND table_name = 'tax_invoice_requests' GROUP BY 1 ORDER BY 1;
COMMIT;
