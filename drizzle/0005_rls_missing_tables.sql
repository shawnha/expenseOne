-- ---------------------------------------------------------------------------
-- 0005_rls_missing_tables
-- Closes the RLS gap on three tables that had no policies and were
-- relying entirely on app-layer auth: companies, gowid_card_mappings,
-- gowid_transactions. Server-side code paths use the service role and
-- bypass RLS, so these policies only constrain the authenticated client.
-- ---------------------------------------------------------------------------

-- companies — read by any signed-in user (company picker UI), mutate ADMIN only.
ALTER TABLE expenseone.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY companies_select ON expenseone.companies
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY companies_insert ON expenseone.companies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM expenseone.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'::expenseone.user_role
    )
  );

CREATE POLICY companies_update ON expenseone.companies
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM expenseone.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'::expenseone.user_role
    )
  );

CREATE POLICY companies_delete ON expenseone.companies
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM expenseone.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'::expenseone.user_role
    )
  );

-- gowid_card_mappings — settings UI lets a user see unmapped cards and
-- self-assign one, so SELECT is permissive. Mutations: members can only
-- update their own mapping (assign to self / clear), admins can do anything.
ALTER TABLE expenseone.gowid_card_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY gowid_mappings_select ON expenseone.gowid_card_mappings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY gowid_mappings_insert ON expenseone.gowid_card_mappings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM expenseone.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'::expenseone.user_role
    )
  );

CREATE POLICY gowid_mappings_update ON expenseone.gowid_card_mappings
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM expenseone.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'::expenseone.user_role
    )
  );

CREATE POLICY gowid_mappings_delete ON expenseone.gowid_card_mappings
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM expenseone.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'::expenseone.user_role
    )
  );

-- gowid_transactions — staged card transactions waiting for the user to
-- file an expense. Members see only their own (notification + prefill flow);
-- admins see everything. INSERT/UPDATE/DELETE are server-side only (cron +
-- admin sync), so no client policy is granted.
ALTER TABLE expenseone.gowid_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY gowid_tx_select ON expenseone.gowid_transactions
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM expenseone.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'::expenseone.user_role
    )
  );
