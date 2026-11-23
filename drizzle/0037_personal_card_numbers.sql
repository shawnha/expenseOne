BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE expenseone.personal_card_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES expenseone.companies(id) ON DELETE CASCADE,
  last_four varchar(4) NOT NULL CHECK (last_four ~ '^[0-9]{4}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id, last_four)
);
ALTER TABLE expenseone.personal_card_numbers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON expenseone.personal_card_numbers FROM PUBLIC, anon, authenticated;
CREATE TABLE expenseone.common_card_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mapping_id uuid NOT NULL,
  company_id uuid NOT NULL,
  last_four varchar(4) NOT NULL CHECK (last_four ~ '^[0-9]{4}$'),
  started_on date NOT NULL,
  ended_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_on IS NULL OR ended_on >= started_on),
  UNIQUE (user_id, mapping_id, started_on)
);
CREATE UNIQUE INDEX idx_common_card_open ON expenseone.common_card_usage (user_id, mapping_id) WHERE ended_on IS NULL;
CREATE INDEX idx_common_card_usage_user_started ON expenseone.common_card_usage (user_id, started_on);
ALTER TABLE expenseone.common_card_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON expenseone.common_card_usage FROM PUBLIC, anon, authenticated;
COMMIT;
