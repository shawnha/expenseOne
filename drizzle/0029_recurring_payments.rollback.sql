-- 0029 되돌리기. 순서:
--   0) **코드를 되돌리기 전에** 아래 UPDATE 를 먼저 실행한다. 옛 cron 은 처리 방식(request_mode)·끝나는 날을 모르고
--      켜진 반복을 전부 같은 금액으로 자동 제출한다 — 알림 모드(금액이 매달 다른 건) 반복이 지난 금액으로 올라간다.
--        UPDATE expenseone.recurring_expenses SET is_active = false
--         WHERE request_mode <> 'AUTO' OR (ends_on IS NOT NULL AND ends_on < (now() AT TIME ZONE 'Asia/Seoul')::date);
--   1) 코드(반복 지급 PR)를 되돌린다 — 새 칸·표를 읽는 코드가 남아 있으면 반복 화면·cron·비용계획 보드가 오류.
--   2) 이 파일을 실행한다. 1)과 2) 사이가 길어도 0) 덕에 옛 cron 이 엉뚱한 제출을 하지 않는다.
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
