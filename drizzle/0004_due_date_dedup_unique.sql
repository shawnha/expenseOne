-- ---------------------------------------------------------------------------
-- 0004_due_date_dedup_unique
-- Adds a unique partial index for due-date reminder dedup so concurrent cron
-- runs cannot insert duplicate reminders. Pairs with the cron route's
-- INSERT ... ON CONFLICT DO NOTHING (to be wired up after this migration).
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_due_date_dedup
  ON expenseone.notifications (related_expense_id, type, title, recipient_id)
  WHERE type = 'DUE_DATE_REMINDER';
