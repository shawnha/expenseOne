-- 0019 되돌리기 — 적용 직전(2026-09-17) 카탈로그 스냅샷에서 자동 생성
-- 쓰기 권한·기본권한·삭제한 정책 6개를 적용 전과 똑같이 복원한다.
BEGIN;
SET LOCAL lock_timeout = '5s';

GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON expenseone.attachments TO anon;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON expenseone.attachments TO authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON expenseone.codef_connections TO anon;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON expenseone.codef_connections TO authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON expenseone.codef_transactions_staging TO anon;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON expenseone.codef_transactions_staging TO authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON expenseone.companies TO anon;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON expenseone.companies TO authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON expenseone.departments TO anon;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON expenseone.departments TO authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON expenseone.expenses TO anon;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON expenseone.expenses TO authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON expenseone.gowid_card_mappings TO anon;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON expenseone.gowid_card_mappings TO authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON expenseone.gowid_transactions TO anon;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON expenseone.gowid_transactions TO authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON expenseone.notifications TO anon;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON expenseone.notifications TO authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON expenseone.push_subscriptions TO anon;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON expenseone.push_subscriptions TO authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON expenseone.users TO anon;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON expenseone.users TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA expenseone
  GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA expenseone
  GRANT UPDATE ON SEQUENCES TO anon, authenticated;

CREATE POLICY expenses_delete_own ON expenseone.expenses AS PERMISSIVE FOR DELETE TO authenticated USING ((submitted_by_id = auth.uid()));
CREATE POLICY expenses_insert ON expenseone.expenses AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((submitted_by_id = auth.uid()));
CREATE POLICY expenses_update_admin ON expenseone.expenses AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM expenseone.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'ADMIN'::expenseone.user_role)))));
CREATE POLICY expenses_update_own ON expenseone.expenses AS PERMISSIVE FOR UPDATE TO authenticated USING ((submitted_by_id = auth.uid()));
CREATE POLICY users_insert ON expenseone.users AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()));
CREATE POLICY users_update_own ON expenseone.users AS PERMISSIVE FOR UPDATE TO authenticated USING ((id = auth.uid()));

COMMIT;
