-- 사입 계산서 줄에 부가세를 **함께 저장**한다.
--
-- 지금까지는 공급가액만 저장하고 부가세를 round(공급가액 * 0.1)로 파생했다.
-- 그런데 사용자는 총액으로 입력한다(2026-09-02 제보). 총액에서 역산할 때
-- 부가세를 다시 반올림으로 구하면 **총액의 약 9%가 표현되지 않는다** —
-- supply + round(supply/10)은 s가 1 늘 때 1 또는 2씩 뛰어서 도달 불가능한
-- 총액이 11개 중 1개꼴로 생긴다(5·16·27…). 사용자가 친 총액이 조용히 다른
-- 값이 되면 안 되므로, 부가세를 차액으로 잡아 함께 저장한다.
--
-- 합계는 이제 오직 supply_amount + vat_amount 로만 정의된다.

ALTER TABLE expenseone.purchase_invoice_lines
  ADD COLUMN IF NOT EXISTS vat_amount integer NOT NULL DEFAULT 0;

-- 기존 줄(현재 0건)은 옛 규칙대로 채워 합계가 달라지지 않게 한다.
UPDATE expenseone.purchase_invoice_lines
SET vat_amount = round(supply_amount * 0.1)
WHERE vat_amount = 0 AND supply_amount > 0;

ALTER TABLE expenseone.purchase_invoice_lines
  ADD CONSTRAINT vat_amount_non_negative CHECK (vat_amount >= 0);
