-- 0027 비용계획 "어디까지 봤나" — 2026-09-28
-- 다른 사람이 추가·수정·취소한 계획을 보드·사이드 메뉴에 표시하려면, 사람마다 마지막으로 본 시각이 필요하다.
--   plan_seen      : 계획별로 상세를 연 시각
--   plan_seen_all  : 보드에서 「모두 확인함」을 누른 시각(행이 없으면 코드의 기준 시각 2026-09-23 00:00 KST)
-- 보는 기록이라 변경 이력(plan_change_log)에 남기지 않는다. 새 표 규칙: 같은 트랜잭션에서 RLS + REVOKE.
SET lock_timeout = '3s';
SET statement_timeout = '30s';
BEGIN;
CREATE TABLE expenseone.plan_seen (
  user_id uuid NOT NULL REFERENCES expenseone.users (id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES expenseone.cost_plans (id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, plan_id)
);
CREATE INDEX idx_plan_seen_plan ON expenseone.plan_seen (plan_id);
CREATE TABLE expenseone.plan_seen_all (
  user_id uuid PRIMARY KEY REFERENCES expenseone.users (id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE expenseone.plan_seen ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenseone.plan_seen_all ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON expenseone.plan_seen FROM anon, authenticated;
REVOKE ALL ON expenseone.plan_seen_all FROM anon, authenticated;
SELECT relname, relrowsecurity FROM pg_class
 WHERE oid IN ('expenseone.plan_seen'::regclass, 'expenseone.plan_seen_all'::regclass) ORDER BY 1;
SELECT table_name, grantee, count(*) FROM information_schema.role_table_grants
 WHERE table_schema = 'expenseone' AND table_name IN ('plan_seen', 'plan_seen_all') GROUP BY 1, 2 ORDER BY 1, 2;
ROLLBACK;
