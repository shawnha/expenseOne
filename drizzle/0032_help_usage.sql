-- 도움말 노출과 클릭을 날짜·화면 크기·무작위 탭 키별로 한 번씩 기록한다.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE expenseone.help_usage (
  day date NOT NULL,
  viewport text NOT NULL CHECK (viewport IN ('mobile', 'desktop')),
  tab_key uuid NOT NULL,
  clicked boolean NOT NULL,
  PRIMARY KEY (day, viewport, tab_key)
);
ALTER TABLE expenseone.help_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON expenseone.help_usage FROM PUBLIC, anon, authenticated;

COMMIT;
