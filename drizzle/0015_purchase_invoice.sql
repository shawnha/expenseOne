-- 사입 → 약국 세금계산서 발행 추적
--
-- 사입은 우리가 물건을 사서 약국에 납품하는 건이다. 비용(amount)은 나간 돈이고,
-- 발행할 계산서는 약국에 청구할 돈이라 금액이 다르다(마진). 그래서 청구 기준
-- 공급가액을 따로 받는다. 부가세·합계는 저장하지 않고 공급가액에서 계산한다 —
-- 셋을 다 저장하면 수정 때 어긋나고, 어긋나면 어느 게 맞는지 알 수 없다.

ALTER TABLE expenseone.expenses
  ADD COLUMN IF NOT EXISTS is_purchase        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pharmacy_name      varchar(100),
  ADD COLUMN IF NOT EXISTS pharmacy_biz_no    varchar(12),
  ADD COLUMN IF NOT EXISTS supply_amount      integer,
  ADD COLUMN IF NOT EXISTS purchase_items     text,
  ADD COLUMN IF NOT EXISTS invoice_issued_at  timestamptz;

-- 매일 도는 알림 cron은 "미발행 사입 건"만 훑는다. 부분 인덱스면 충분하다.
CREATE INDEX IF NOT EXISTS idx_expenses_purchase_unissued
  ON expenseone.expenses (transaction_date)
  WHERE is_purchase = true AND invoice_issued_at IS NULL;
