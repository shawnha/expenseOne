-- 0027 되돌리기. 앱 코드를 먼저 0027 이전으로 되돌린 다음 적용한다(본 기록만 사라진다 — 계획·이력은 그대로).
SET lock_timeout = '3s';
SET statement_timeout = '30s';
BEGIN;
DROP TABLE expenseone.plan_seen;
DROP TABLE expenseone.plan_seen_all;
COMMIT;
