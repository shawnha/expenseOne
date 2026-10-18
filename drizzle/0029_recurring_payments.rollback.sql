-- 0029 되돌리기. 코드(반복 지급 PR)를 먼저 되돌린 뒤 실행한다 — 새 칸·표를 읽는 코드가 남아 있으면 반복 화면·cron 이 오류.
-- 되돌리기 전에 AUTO 가 아닌 반복이 있으면 지운다(되돌린 뒤엔 은행·계좌 NOT NULL 을 다시 걸 수 없다).
-- 반복으로 깐 비용계획(cost_plans)은 지우지 않는다 — 평범한 계획으로 남는다.
SET lock_timeout = '3s';
SET statement_timeout = '30s';
BEGIN;
DROP TABLE IF EXISTS expenseone.recurring_occurrences;
DELETE FROM expenseone.recurring_expenses
 WHERE request_mode <> 'AUTO' OR category IS NULL OR bank_name IS NULL OR account_holder IS NULL OR account_number IS NULL;
ALTER TABLE expenseone.recurring_expenses
  DROP CONSTRAINT IF EXISTS recurring_plan_brand_same_company,
  DROP CONSTRAINT IF EXISTS recurring_plan_project_same_company,
  DROP CONSTRAINT IF EXISTS recurring_ends_after_start,
  DROP CONSTRAINT IF EXISTS recurring_brand_needs_project,
  DROP CONSTRAINT IF EXISTS recurring_none_needs_plan,
  DROP CONSTRAINT IF EXISTS recurring_auto_needs_account,
  DROP CONSTRAINT IF EXISTS recurring_plan_date_precision,
  DROP CONSTRAINT IF EXISTS recurring_request_mode,
  DROP COLUMN IF EXISTS ends_on,
  DROP COLUMN IF EXISTS starts_on,
  DROP COLUMN IF EXISTS plan_date_precision,
  DROP COLUMN IF EXISTS plan_brand_id,
  DROP COLUMN IF EXISTS plan_project_id,
  DROP COLUMN IF EXISTS request_mode,
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN bank_name SET NOT NULL,
  ALTER COLUMN account_holder SET NOT NULL,
  ALTER COLUMN account_number SET NOT NULL;
COMMIT;
