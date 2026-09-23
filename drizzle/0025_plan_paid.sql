-- 0025 비용계획 "지급 완료" 표시 — 2026-09-23
-- 참여자 누구나 체크한다(대표 전용인 0023 ERP 표시와 다르다). 체크한 계획은 카드가 한 줄로 접히고
-- 그 달 맨 아래로 내려간다. version 은 올리지 않는다(0023 과 같은 이유 — 열려 있는 수정과 부딪치지 않게).
-- cost_plans 는 expenseone 전용 표(복제·게시 없음) — ERP 와 무관.
SET lock_timeout = '3s';
SET statement_timeout = '30s';
BEGIN;
ALTER TABLE expenseone.cost_plans
  ADD COLUMN paid_at timestamptz,
  ADD COLUMN paid_by_id uuid REFERENCES expenseone.users (id) ON DELETE SET NULL,
  ADD CONSTRAINT cost_plans_paid_pair CHECK (paid_by_id IS NULL OR paid_at IS NOT NULL);
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_schema = 'expenseone' AND table_name = 'cost_plans' AND column_name IN ('paid_at', 'paid_by_id');
COMMIT;
