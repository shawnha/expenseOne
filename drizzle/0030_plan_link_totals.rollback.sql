SET lock_timeout = '3s'; SET statement_timeout = '30s';
-- 0030 되돌리기. ERP 가 이 뷰를 읽기 시작했다면 ERP 쪽 읽기를 먼저 끈다(뷰가 없으면 ERP 동기화가 오류로 멈춘다).
BEGIN;
DROP VIEW IF EXISTS expenseone.plan_link_totals;
COMMIT;
