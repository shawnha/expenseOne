BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DROP TABLE IF EXISTS expenseone.brand_settlement_subjects, expenseone.brand_settlement_viewers;
COMMIT;
