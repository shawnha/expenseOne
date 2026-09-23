-- 0025 되돌리기. 앱 코드를 먼저 0025 이전으로 되돌린 다음 적용한다(표시 기록은 사라진다).
SET lock_timeout = '3s';
SET statement_timeout = '30s';
BEGIN;
ALTER TABLE expenseone.cost_plans
  DROP CONSTRAINT cost_plans_paid_pair,
  DROP COLUMN paid_at,
  DROP COLUMN paid_by_id;
COMMIT;
