BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE expenseone.brand_settlement_viewers (
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES expenseone.companies(id) ON DELETE CASCADE,
  granted_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id)
);

CREATE TABLE expenseone.brand_settlement_subjects (
  source_type text NOT NULL CHECK (source_type IN ('PLAN', 'REQUEST')),
  source_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES expenseone.companies(id) ON DELETE CASCADE,
  brand_name varchar(100) NOT NULL CHECK (length(btrim(brand_name)) > 0),
  period_month date NOT NULL CHECK (extract(day FROM period_month) = 1),
  updated_by_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_type, source_id)
);
CREATE INDEX idx_brand_settlement_company_period ON expenseone.brand_settlement_subjects(company_id, period_month);

ALTER TABLE expenseone.brand_settlement_viewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenseone.brand_settlement_subjects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON expenseone.brand_settlement_viewers, expenseone.brand_settlement_subjects FROM PUBLIC, anon, authenticated;
COMMIT;
