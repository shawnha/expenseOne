-- ---------------------------------------------------------------------------
-- 0011_expenses_refund_type
-- 반품/환불(REFUND) 비용 유형을 추가한다.
--   - expense_type enum에 'REFUND' 값 추가
--   - original_expense_id: 반품이 상쇄하는 원거래(원래 구매 비용) 참조.
--     원거래가 삭제되더라도 반품 기록은 보존해야 하므로 ON DELETE SET NULL.
-- 반품 건은 amount를 양수로 저장하고(amount > 0 CHECK 제약 유지),
-- 화면/집계에서 차감(-)으로 처리한다.
--
-- 주의: ALTER TYPE ... ADD VALUE는 트랜잭션 안에서 실행해도 같은 트랜잭션에서
-- 사용할 수 없으므로 별도 문장으로 먼저 실행한다 (psql 자동커밋).
-- ---------------------------------------------------------------------------

ALTER TYPE expenseone.expense_type ADD VALUE IF NOT EXISTS 'REFUND';

BEGIN;

SET LOCAL statement_timeout = '60s';

ALTER TABLE expenseone.expenses
  ADD COLUMN IF NOT EXISTS original_expense_id uuid
    REFERENCES expenseone.expenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_original_expense_id
  ON expenseone.expenses (original_expense_id)
  WHERE original_expense_id IS NOT NULL;

COMMIT;
