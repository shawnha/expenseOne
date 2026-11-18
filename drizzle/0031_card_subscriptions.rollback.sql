-- 0031 되돌리기. 앱 코드를 먼저 0031 이전으로 되돌린 다음 적용한다.
-- 정기 결제 표시만 사라진다(비용 자체는 그대로). 지우기 전에 아래 SELECT 결과를 남겨 둔다.
SET lock_timeout = '3s';
SET statement_timeout = '30s';
BEGIN;
SELECT s.id, s.owner_id, s.merchant_name, s.title, s.category, s.is_active, count(c.expense_id) AS charges
  FROM expenseone.card_subscriptions s
  LEFT JOIN expenseone.card_subscription_charges c ON c.subscription_id = s.id
 GROUP BY s.id;
DROP TABLE expenseone.card_subscription_charges;
DROP TABLE expenseone.card_subscriptions;
COMMIT;
