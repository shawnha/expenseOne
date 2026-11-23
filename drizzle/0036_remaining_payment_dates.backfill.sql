BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Notification history is the evidence for legacy timestamps. The initial
-- approval anchors the current cycle after a revert and later re-approval.
INSERT INTO expenseone.expense_remaining_payment_dates (expense_id, requested_at, approved_at)
SELECT e.id,
       min(n.created_at) FILTER (WHERE n.type = 'REMAINING_PAYMENT_REQUEST'),
       max(n.created_at) FILTER (WHERE n.type = 'REMAINING_PAYMENT_APPROVED')
FROM expenseone.notifications n
JOIN expenseone.expenses e ON e.id = n.related_expense_id
WHERE e.type = 'DEPOSIT_REQUEST' AND e.status = 'APPROVED' AND e.is_pre_paid
  AND e.remaining_payment_requested
  AND n.created_at >= coalesce(e.approved_at, e.created_at)
  AND (n.type = 'REMAINING_PAYMENT_REQUEST'
    OR (n.type = 'REMAINING_PAYMENT_APPROVED' AND e.remaining_payment_approved))
GROUP BY e.id
ON CONFLICT (expense_id) DO UPDATE
SET requested_at = coalesce(expense_remaining_payment_dates.requested_at, excluded.requested_at),
    approved_at = coalesce(expense_remaining_payment_dates.approved_at, excluded.approved_at)
WHERE (expense_remaining_payment_dates.requested_at IS NULL AND excluded.requested_at IS NOT NULL)
   OR (expense_remaining_payment_dates.approved_at IS NULL AND excluded.approved_at IS NOT NULL);

COMMIT;
