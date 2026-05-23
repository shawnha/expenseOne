-- ---------------------------------------------------------------------------
-- 0010_expenses_has_freelancer_withholding
-- 비용 제출 시 "프리랜서 원천징수 (-3.3%)" 체크박스가 켜져 있었는지를 기록한다.
-- 기존에는 UI 상태로만 존재했고 금액 계산에만 영향을 줬는데, 관리자/제출자가
-- 전체 비용 필터에서 프리랜서 건만 따로 모아 볼 수 있도록 영구 플래그로
-- 승격한다.
-- ---------------------------------------------------------------------------

BEGIN;

SET LOCAL statement_timeout = '60s';

ALTER TABLE expenseone.expenses
  ADD COLUMN IF NOT EXISTS has_freelancer_withholding boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_expenses_has_freelancer_withholding
  ON expenseone.expenses (has_freelancer_withholding)
  WHERE has_freelancer_withholding = true;

COMMIT;
