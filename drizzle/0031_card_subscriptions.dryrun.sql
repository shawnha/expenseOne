-- 0031 시험 적용(끝에 ROLLBACK — 아무것도 남지 않는다). 본 파일과 내용이 같다.
-- AI 구독처럼 매달 같은 가맹점에서 카드로 나가는 돈을 「정기 결제」로 묶어 본다.
--   card_subscriptions        : 사람 한 명 × 가맹점 하나 = 한 줄(정기 결제 하나). merchant_key = 가맹점 이름을 소문자·공백 정리한 값.
--   card_subscription_charges : 그 정기 결제로 표시한 법카 비용 한 건 = 한 줄.
-- 반복 지급(recurring_expenses)에 방식을 하나 더 넣지 않는다 — 그 표는 cron 이 next_run_date 로 골라
-- 입금요청을 만드는 표라, 법카 줄이 섞이면 잘못 제출될 수 있다.
-- expenses 에 컬럼·FK 를 붙이지 않는다(결합 검토 P2). charges.expense_id 는 FK 없이 두고 읽을 때 JOIN 으로 거른다
-- (0029 recurring_occurrences.expense_id 와 같은 방식). 비용이 지워지면 그 줄은 목록에서 안 보일 뿐이다.
-- cost_plans·비용계획과 무관. ERP 복제 대상 아님.
-- 새 표 규칙: 같은 트랜잭션에서 RLS + REVOKE.
SET lock_timeout = '3s';
SET statement_timeout = '30s';
BEGIN;
CREATE TABLE expenseone.card_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES expenseone.users (id) ON DELETE CASCADE,
  company_id uuid REFERENCES expenseone.companies (id) ON DELETE SET NULL,
  merchant_key text NOT NULL CHECK (merchant_key <> ''),
  merchant_name text NOT NULL,
  title text NOT NULL,
  category text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT card_subscriptions_owner_merchant UNIQUE (owner_id, merchant_key)
);
CREATE TABLE expenseone.card_subscription_charges (
  expense_id uuid PRIMARY KEY,
  subscription_id uuid NOT NULL REFERENCES expenseone.card_subscriptions (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_card_subscription_charges_sub ON expenseone.card_subscription_charges (subscription_id);
ALTER TABLE expenseone.card_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenseone.card_subscription_charges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON expenseone.card_subscriptions FROM anon, authenticated;
REVOKE ALL ON expenseone.card_subscription_charges FROM anon, authenticated;
SELECT relname, relrowsecurity FROM pg_class
 WHERE oid IN ('expenseone.card_subscriptions'::regclass, 'expenseone.card_subscription_charges'::regclass);
SELECT table_name, grantee, count(*) FROM information_schema.role_table_grants
 WHERE table_schema = 'expenseone' AND table_name IN ('card_subscriptions', 'card_subscription_charges')
   AND grantee IN ('anon', 'authenticated') GROUP BY 1, 2 ORDER BY 1, 2;
ROLLBACK;
