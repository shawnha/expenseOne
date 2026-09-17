-- =====================================================================
-- 0019: 브라우저(PostgREST) 경로의 쓰기 차단 — 권한 상승·승인 위조 방지
--
-- 2026-09-17 발견·재현: expenseone 스키마가 PostgREST에 노출돼 있고, 로그인한
-- 사용자(authenticated)에게 대부분 테이블의 INSERT/UPDATE/DELETE 권한이 있었다.
-- users/expenses의 UPDATE 정책에 WITH CHECK가 없어서, 회사 구글 계정 누구든
-- 브라우저에서
--   - 자기 users.role 을 ADMIN으로 올리고 (되돌리는 트랜잭션에서 실제 재현)
--   - 자기 입금요청 status 를 APPROVED로 바꾸고 (실제 재현)
--   - 승인 상태로 비용을 직접 INSERT하거나, 규칙을 우회해 DELETE할 수 있었다.
-- 같은 종류로
--   - gowid_card_mappings: 자기 매핑의 카드번호를 바꿔 남의 카드 식비 거래를
--     자기 이름의 승인 비용으로 자동 생성시킬 수 있었고
--   - notifications: 아무에게나 가짜 알림(임의 링크)을 넣을 수 있었다.
--
-- 앱과 ERP의 브라우저·사용자 세션 경로는 expenseone 테이블을 **읽기만** 한다
-- (조사: Supabase 클라이언트의 insert/update/upsert/delete 0건. 쓰기는 전부
-- Drizzle=postgres, 또는 SECURITY DEFINER(owner postgres) RPC). 그래서 쓰기
-- 권한을 스키마 전체에서 회수해도 정상 기능은 영향이 없다. SELECT는 유지한다
-- (대시보드·알림 Realtime·ERP 읽기가 쓴다). storage.objects는 건드리지 않는다
-- (비용 삭제 시 첨부 파일 정리가 사용자 세션으로 storage를 지운다).
--
-- 되돌리기: 0019_block_client_writes.rollback.sql (적용 직전 카탈로그 스냅샷에서 생성)
-- =====================================================================
BEGIN;

-- 정책 DROP은 테이블 잠금을 잡는다. 앱을 오래 막지 않게 빨리 실패시킨다(실패 시 재시도).
SET LOCAL lock_timeout = '5s';

-- 1) expenseone 모든 테이블: anon/authenticated 쓰기 성격 권한 회수 (SELECT 유지)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON ALL TABLES IN SCHEMA expenseone
  FROM anon, authenticated;

-- 2) 앞으로 만드는 테이블·시퀀스에도 쓰기 권한이 자동으로 붙지 않게.
--    (기존 기본권한이 새 테이블에 anon/authenticated 전체 쓰기를 주고 있었다)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA expenseone
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA expenseone
  REVOKE UPDATE ON SEQUENCES FROM anon, authenticated;

-- 3) 권한 회수로 무력화된 users/expenses 쓰기 정책 제거 — 이중 방어.
--    누가 나중에 GRANT ALL을 다시 줘도 허용 정책이 없으니 RLS가 쓰기를 거부한다.
DROP POLICY IF EXISTS users_insert          ON expenseone.users;
DROP POLICY IF EXISTS users_update_own      ON expenseone.users;
DROP POLICY IF EXISTS expenses_insert       ON expenseone.expenses;
DROP POLICY IF EXISTS expenses_update_own   ON expenseone.expenses;
DROP POLICY IF EXISTS expenses_update_admin ON expenseone.expenses;
DROP POLICY IF EXISTS expenses_delete_own   ON expenseone.expenses;

-- 4) 검증 — 하나라도 어긋나면 예외로 전체 롤백
DO $verify$
DECLARE
  t record;
  r name;
  p text;
BEGIN
  -- 모든 expenseone 테이블에 anon/authenticated 쓰기 권한이 하나도 없어야 한다
  FOR t IN SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'expenseone' AND c.relkind IN ('r', 'p') LOOP
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated']::name[] LOOP
      FOREACH p IN ARRAY ARRAY['INSERT', 'UPDATE', 'REFERENCES'] LOOP
        IF has_any_column_privilege(r, t.oid, p) THEN
          RAISE EXCEPTION '잔존 쓰기 권한: % 가 expenseone.% 에 %', r, t.relname, p;
        END IF;
      END LOOP;
      FOREACH p IN ARRAY ARRAY['DELETE', 'TRUNCATE', 'TRIGGER', 'MAINTAIN'] LOOP
        IF has_table_privilege(r, t.oid, p) THEN
          RAISE EXCEPTION '잔존 쓰기 권한: % 가 expenseone.% 에 %', r, t.relname, p;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- 읽기는 그대로여야 한다 (앱·Realtime·ERP가 쓰는 테이블)
  FOR t IN SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'expenseone'
             AND c.relname IN ('attachments','codef_connections','codef_transactions_staging','companies',
                               'departments','expenses','gowid_card_mappings','gowid_transactions',
                               'notifications','push_subscriptions','users') LOOP
    IF NOT has_table_privilege('authenticated', t.oid, 'SELECT') THEN
      RAISE EXCEPTION 'authenticated SELECT 사라짐(읽기 경로 깨짐): %', t.relname;
    END IF;
  END LOOP;

  -- 서버·워커 경로는 그대로여야 한다
  FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF NOT has_table_privilege('postgres', 'expenseone.users', p)
       OR NOT has_table_privilege('postgres', 'expenseone.expenses', p) THEN
      RAISE EXCEPTION 'postgres(Drizzle) % 사라짐', p;
    END IF;
    IF NOT has_table_privilege('service_role', 'expenseone.users', p)
       OR NOT has_table_privilege('service_role', 'expenseone.expenses', p) THEN
      RAISE EXCEPTION 'service_role % 사라짐', p;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('erp_ingest', 'expenseone.expenses', 'SELECT')
     OR NOT has_table_privilege('erp_ingest', 'expenseone.users', 'SELECT') THEN
    RAISE EXCEPTION 'erp_ingest SELECT 사라짐';
  END IF;

  -- users/expenses에는 읽기 정책만 남아야 한다
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'expenseone'
               AND tablename IN ('users', 'expenses') AND cmd <> 'SELECT') THEN
    RAISE EXCEPTION 'users/expenses 에 쓰기 정책이 남아 있음';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'expenseone' AND tablename = 'users'
        AND policyname IN ('users_select', 'erp_ingest_read')) <> 2
  OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'expenseone' AND tablename = 'expenses'
        AND policyname IN ('expenses_select_own', 'expenses_select_admin', 'erp_ingest_read')) <> 3 THEN
    RAISE EXCEPTION '읽기 정책 누락';
  END IF;
END
$verify$;

COMMIT;
