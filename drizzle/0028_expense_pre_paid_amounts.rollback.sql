-- 0028 되돌리기. 앱 코드를 먼저 0028 이전으로 되돌린 다음 적용한다.
-- 금액으로 정한 선지급 건은 pre_paid_percentage(환산 비율)로 계산되게 돌아간다 — 몇 원 어긋날 수 있으니
-- 지우기 전에 아래 SELECT 결과를 남겨 둔다.
SET lock_timeout = '3s';
SET statement_timeout = '30s';
BEGIN;
SELECT p.expense_id, e.title, e.amount, p.amount AS pre_paid_amount, e.pre_paid_percentage
  FROM expenseone.expense_pre_paid_amounts p JOIN expenseone.expenses e ON e.id = p.expense_id;
DROP TABLE expenseone.expense_pre_paid_amounts;
COMMIT;
