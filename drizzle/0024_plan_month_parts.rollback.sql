-- 0024 되돌리기. 초·중순으로 잡힌 계획은 '말'(그 달 말일)로 바꾼 뒤 옛 제약으로 돌린다.
-- 앱 코드를 먼저 0024 이전으로 되돌린 다음 적용한다(새 코드는 MONTH_EARLY/MID 를 쓸 수 있다).
SET lock_timeout = '3s';
SET statement_timeout = '30s';
BEGIN;
UPDATE expenseone.cost_plans
   SET date_precision = 'MONTH',
       planned_date = (date_trunc('month', planned_date::timestamp) + interval '1 month' - interval '1 day')::date,
       version = version + 1,
       updated_at = now()
 WHERE date_precision IN ('MONTH_EARLY', 'MONTH_MID');
ALTER TABLE expenseone.cost_plans
  DROP CONSTRAINT cost_plans_date_precision,
  DROP CONSTRAINT cost_plans_month_end,
  ADD CONSTRAINT cost_plans_date_precision CHECK (date_precision IN ('DAY', 'MONTH')),
  ADD CONSTRAINT cost_plans_month_end CHECK (
    date_precision = 'DAY'
    OR planned_date = (date_trunc('month', planned_date::timestamp) + interval '1 month' - interval '1 day')::date
  );
COMMIT;
