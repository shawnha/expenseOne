-- ---------------------------------------------------------------------------
-- 0012_expenses_branch
-- 비용에 "호점" 구분 컬럼을 추가한다.
--   - 마트/약국 실비 청구 리스트를 세무법인에 전달할 때 1호점/2호점을 구분해야
--     하는데, 데이터로 자동 판별할 근거가 없어 관리자가 목록에서 직접 지정한다.
--   - null = 미지정. 코드값: 'STORE_1'(1호점), 'STORE_2'(2호점).
--   - 마트/약국에 한정된 개념이지만 컬럼은 expenses에 두고 nullable로 관리한다.
-- ---------------------------------------------------------------------------

BEGIN;

SET LOCAL statement_timeout = '60s';

ALTER TABLE expenseone.expenses
  ADD COLUMN IF NOT EXISTS branch varchar(20);

CREATE INDEX IF NOT EXISTS idx_expenses_branch
  ON expenseone.expenses (branch)
  WHERE branch IS NOT NULL;

COMMIT;
