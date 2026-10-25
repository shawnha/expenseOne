-- 0028 선지급 "금액으로" 입력 — 2026-10-16
-- 지금까지 부분 선지급은 비율(pre_paid_percentage, 정수 %)로만 정했다. 계약금 300만원처럼 금액이 먼저인 건은
-- 비율로 바꾸면 반올림 때문에 실제 송금액과 몇 원~몇만 원 어긋난다. 그래서 금액을 **그대로** 따로 둔다.
--   expense_pre_paid_amounts : 금액으로 정한 선지급 건만 한 줄. 없으면 예전대로 비율로 계산한다.
-- expenses 에 컬럼을 붙이지 않는다(결합 검토 I3·P2). pre_paid_percentage 에는 앱이 환산 비율(1~99)을 같이 적는다 —
-- ERP(transaction-match·approvals)와 기존 필터·칩이 그 칸으로 "부분 선지급"을 알아본다.
-- 비용은 물리 삭제라 ON DELETE CASCADE(이 표는 비용의 속성 한 칸일 뿐, 따로 남길 기록이 아니다).
-- 새 표 규칙: 같은 트랜잭션에서 RLS + REVOKE.
SET lock_timeout = '3s';
SET statement_timeout = '30s';
BEGIN;
CREATE TABLE expenseone.expense_pre_paid_amounts (
  expense_id uuid PRIMARY KEY REFERENCES expenseone.expenses (id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE expenseone.expense_pre_paid_amounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON expenseone.expense_pre_paid_amounts FROM anon, authenticated;
SELECT relname, relrowsecurity FROM pg_class
 WHERE oid = 'expenseone.expense_pre_paid_amounts'::regclass;
SELECT table_name, grantee, count(*) FROM information_schema.role_table_grants
 WHERE table_schema = 'expenseone' AND table_name = 'expense_pre_paid_amounts' GROUP BY 1, 2 ORDER BY 1, 2;
COMMIT;
