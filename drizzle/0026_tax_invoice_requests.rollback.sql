-- 0026 되돌리기. 앱 코드를 먼저 0026 이전으로 되돌린 다음 적용한다(요청 기록이 사라진다 — 필요하면 먼저 pg_dump).
SET lock_timeout = '3s';
SET statement_timeout = '30s';
BEGIN;
DROP TABLE expenseone.tax_invoice_requests;
COMMIT;
