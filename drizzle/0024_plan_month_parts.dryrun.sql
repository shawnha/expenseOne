-- 0024 비용계획 월 단위 세분(초·중순·말) — 2026-09-22
-- date_precision 에 MONTH_EARLY(초, 1~10일)·MONTH_MID(중순, 11~20일)를 더한다. MONTH 는 그대로 '말'(21일~말일).
-- 저장 날짜는 각 구간의 끝날: 초=10일, 중순=20일, 말=말일. 기존 행(DAY 34·MONTH 19)은 그대로 통과한다.
-- cost_plans 는 expenseone 전용 표(복제·게시 없음, postgres 권한만) — ERP 와 무관.
SET lock_timeout = '3s';
SET statement_timeout = '30s';
BEGIN;
ALTER TABLE expenseone.cost_plans
  DROP CONSTRAINT cost_plans_date_precision,
  DROP CONSTRAINT cost_plans_month_end,
  ADD CONSTRAINT cost_plans_date_precision
    CHECK (date_precision IN ('DAY', 'MONTH_EARLY', 'MONTH_MID', 'MONTH')),
  ADD CONSTRAINT cost_plans_month_end CHECK (
    date_precision = 'DAY'
    OR (date_precision = 'MONTH_EARLY' AND extract(day FROM planned_date) = 10)
    OR (date_precision = 'MONTH_MID' AND extract(day FROM planned_date) = 20)
    OR (date_precision = 'MONTH'
        AND planned_date = (date_trunc('month', planned_date::timestamp) + interval '1 month' - interval '1 day')::date)
  );
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'expenseone.cost_plans'::regclass AND conname IN ('cost_plans_date_precision', 'cost_plans_month_end');
ROLLBACK;
