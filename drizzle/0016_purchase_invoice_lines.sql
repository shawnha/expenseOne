-- 사입 한 건에 약국이 여러 곳일 수 있다.
--
-- 사입 한 번으로 들여온 물건을 여러 약국에 나눠 납품하는 경우가 있다.
-- 세금계산서는 공급받는자가 한 명이라 보통 약국 수만큼 발행하고, 같은 사업자의
-- 여러 지점이면 한 장에 납품처만 여럿일 수도 있다. 둘 다 담으려면 약국을
-- **줄(line)**로 두고 발행 여부를 줄마다 갖는 게 맞다.
--
-- 0015에서 expenses에 직접 붙였던 약국 컬럼을 이 테이블로 옮긴다.

CREATE TABLE IF NOT EXISTS expenseone.purchase_invoice_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id        uuid NOT NULL REFERENCES expenseone.expenses(id) ON DELETE CASCADE,
  pharmacy_name     varchar(100) NOT NULL,
  pharmacy_biz_no   varchar(12),
  -- 이 약국에 청구할 공급가액. 부가세·합계는 저장하지 않고 여기서 계산한다.
  supply_amount     integer NOT NULL CHECK (supply_amount > 0),
  purchase_items    text,
  -- 발행 완료 시각. null이면 미발행(알림 대상).
  invoice_issued_at timestamptz,
  -- 입력 순서 보존. 같은 사입 안에서 약국 순서가 뒤바뀌면 대조하기 어렵다.
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_lines_expense
  ON expenseone.purchase_invoice_lines (expense_id);

-- 매일 도는 알림은 "미발행 줄"만 훑는다.
CREATE INDEX IF NOT EXISTS idx_purchase_lines_unissued
  ON expenseone.purchase_invoice_lines (expense_id)
  WHERE invoice_issued_at IS NULL;

-- 0015 컬럼에 이미 들어간 값이 있으면 줄로 옮긴다(현재 0건이지만 방어적으로).
INSERT INTO expenseone.purchase_invoice_lines
  (expense_id, pharmacy_name, pharmacy_biz_no, supply_amount, purchase_items, invoice_issued_at)
SELECT id, pharmacy_name, pharmacy_biz_no, supply_amount, purchase_items, invoice_issued_at
FROM expenseone.expenses
WHERE is_purchase = true
  AND pharmacy_name IS NOT NULL
  AND supply_amount IS NOT NULL
  AND supply_amount > 0
  AND NOT EXISTS (
    SELECT 1 FROM expenseone.purchase_invoice_lines l WHERE l.expense_id = expenseone.expenses.id
  );

-- 옮겼으니 expenses의 단일 약국 컬럼은 걷어낸다. 남겨두면 어느 쪽이 진짜인지
-- 헷갈리고, 조회가 조용히 옛 컬럼을 보게 된다.
DROP INDEX IF EXISTS expenseone.idx_expenses_purchase_unissued;

ALTER TABLE expenseone.expenses
  DROP COLUMN IF EXISTS pharmacy_name,
  DROP COLUMN IF EXISTS pharmacy_biz_no,
  DROP COLUMN IF EXISTS supply_amount,
  DROP COLUMN IF EXISTS purchase_items,
  DROP COLUMN IF EXISTS invoice_issued_at;

-- is_purchase는 남긴다 — 사입 여부 자체는 비용의 성격이고, 줄이 0개인
-- (아직 약국을 안 채운) 상태도 표현할 수 있어야 한다.
CREATE INDEX IF NOT EXISTS idx_expenses_is_purchase
  ON expenseone.expenses (transaction_date)
  WHERE is_purchase = true;
