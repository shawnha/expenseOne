-- ---------------------------------------------------------------------------
-- 0008_card_mappings_issuer
-- Adds an `issuer` column to gowid_card_mappings so cards can be grouped
-- by their issuing bank (롯데, 우리, 신한, ...). GoWid returns the issuer
-- name as a prefix in shortCardNumber (e.g. "롯데 9884"), so the gowid
-- sync code populates this column automatically; admins can also edit it
-- manually from the card-management page.
-- ---------------------------------------------------------------------------

BEGIN;

SET LOCAL statement_timeout = '60s';

ALTER TABLE expenseone.gowid_card_mappings
  ADD COLUMN IF NOT EXISTS issuer varchar(50);

CREATE INDEX IF NOT EXISTS idx_gowid_card_mappings_issuer
  ON expenseone.gowid_card_mappings (issuer);

COMMIT;
