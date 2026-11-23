BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Match users and expenses at read time so their tables acquire no RI triggers.
CREATE TABLE expenseone.expense_team_members (
  user_id uuid NOT NULL,
  department_id uuid NOT NULL REFERENCES expenseone.departments(id) ON DELETE RESTRICT,
  PRIMARY KEY (user_id, department_id)
);

CREATE INDEX idx_expense_team_members_department ON expenseone.expense_team_members (department_id);

CREATE TABLE expenseone.expense_team_shares (
  expense_id uuid PRIMARY KEY,
  department_id uuid REFERENCES expenseone.departments(id) ON DELETE SET NULL
);

ALTER TABLE expenseone.expense_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenseone.expense_team_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON expenseone.expense_team_members, expenseone.expense_team_shares FROM PUBLIC, anon, authenticated;
COMMIT;
