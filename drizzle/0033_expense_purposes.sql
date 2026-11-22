-- 기존 비용 분류와 별도로 비용 성격을 기록한다.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE expenseone.expense_purposes (
  expense_id uuid PRIMARY KEY,
  purpose text NOT NULL CHECK (purpose IN ('shooting', 'marketing', 'outsourcing', 'other')),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE expenseone.expense_purposes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON expenseone.expense_purposes FROM PUBLIC, anon, authenticated;

COMMIT;
