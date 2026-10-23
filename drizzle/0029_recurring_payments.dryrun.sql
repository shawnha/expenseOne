-- 0029 반복 지급 — 매달 나가는 돈을 한 번 등록하면 비용계획과 입금요청에 자동으로 나온다. 2026-10-18
-- 팀 피드백: "월마다 지급되는 지급건을 등록할 수 있는 기능". 반복 입금요청(0017)은 있었지만 0건 — 메뉴가 숨어 있고
-- 금액이 매달 같은 건만 받았다(실제 반복 지급은 거래처는 같고 금액이 매달 다르다: 물류비·특허 수수료 등).
--
-- recurring_expenses 에 칸 추가(0건 표, ERP 복제 대상 아님 — ERP 는 320 에서 권한만 잠갔다):
--   request_mode   AUTO   = 예정일에 같은 금액으로 입금요청을 자동 제출(0017 동작 그대로, 기존 기본값)
--                  REMIND = 예정일에 등록자에게 "이번 달 금액 넣고 올려 주세요" 알림 + 미리 채운 폼(자동 제출 없음)
--                  NONE   = 입금요청은 안 만들고 비용계획에만 표시(법카·자동이체 등)
--   plan_project_id / plan_brand_id / plan_date_precision = 비용계획에 미리 깔 때의 프로젝트·분류·날짜 정밀도
--   starts_on / ends_on = 회차 범위(끝 없음 = NULL)
--   AUTO 만 은행·계좌·카테고리가 꼭 있어야 한다(자동 제출이라 비면 안 된다). 비용계획에서 만든 반복은 계좌를 모를 수 있다.
--
-- recurring_occurrences: 회차(예정일) 하나 = 한 줄. 같은 회차를 두 번 만들지 않게 (반복, 날짜) UNIQUE.
--   plan_id      이 회차로 깐 비용계획(cost_plans, 소프트 삭제라 SET NULL 은 사실상 안 일어난다)
--   plan_version 우리가 마지막으로 쓴 cost_plans.version. 같으면 "사람이 안 건드린 계획" → 반복을 고치면 같이 고친다.
--   expense_id   이 회차의 입금요청. **FK 를 걸지 않는다** — expenses 에 RI 트리거가 붙으면 결합 검토 P2 위반,
--                expenses 는 물리 삭제라 지워지면 dangling 이 되는데 읽는 쪽이 JOIN 으로 거른다.
--   run_at       예정일 처리(자동 제출 또는 알림)를 한 시각. NULL = 아직.
--   reserved_at  사람이 알림 폼으로 이 회차 입금요청을 올리는 중(조건부 UPDATE 로 선점). 두 탭에서 동시에 올려
--                같은 달이 두 번 올라가는 것을 막는다. 2분 지나면 버려진 것으로 본다.
-- 새 표 규칙: 같은 트랜잭션에서 RLS + REVOKE.
--
-- ⚠️ 배포 순서: 이 파일을 07:00~08:30 창에 먼저 적용하고 확인한 뒤 PR 을 main 에 머지한다.
--    거꾸로 하면 비용계획 보드·상세(recurring_occurrences 조인)와 반복 지급 화면이 오류(42P01·42703)로 열리지 않는다.
--    이 파일만 먼저 적용해도 옛 코드는 그대로 돈다(새 칸은 기본값이 있고, 옛 등록 코드는 계좌·카테고리를 늘 넣는다).
-- 잠금: ALTER recurring_expenses(ACCESS EXCLUSIVE, 0건·cron 만 읽음), FK 검증으로 plan_projects·plan_brands·cost_plans 에
--    SHARE ROW EXCLUSIVE 를 잠깐 — 그 사이 계획 쓰기가 기다린다. lock_timeout 3s 라 못 잡으면 통째로 실패(재시도).
SET lock_timeout = '3s';
SET statement_timeout = '30s';
BEGIN;

ALTER TABLE expenseone.recurring_expenses
  ADD COLUMN request_mode text NOT NULL DEFAULT 'AUTO',
  ADD COLUMN plan_project_id uuid,
  ADD COLUMN plan_brand_id uuid,
  ADD COLUMN plan_date_precision text NOT NULL DEFAULT 'DAY',
  ADD COLUMN starts_on date,
  ADD COLUMN ends_on date,
  ALTER COLUMN category DROP NOT NULL,
  ALTER COLUMN bank_name DROP NOT NULL,
  ALTER COLUMN account_holder DROP NOT NULL,
  ALTER COLUMN account_number DROP NOT NULL,
  ADD CONSTRAINT recurring_request_mode CHECK (request_mode IN ('AUTO', 'REMIND', 'NONE')),
  ADD CONSTRAINT recurring_plan_date_precision
    CHECK (plan_date_precision IN ('DAY', 'MONTH_EARLY', 'MONTH_MID', 'MONTH')),
  ADD CONSTRAINT recurring_auto_needs_account CHECK (
    request_mode <> 'AUTO'
    OR (category IS NOT NULL AND bank_name IS NOT NULL AND account_holder IS NOT NULL AND account_number IS NOT NULL)),
  ADD CONSTRAINT recurring_none_needs_plan CHECK (request_mode <> 'NONE' OR plan_project_id IS NOT NULL),
  ADD CONSTRAINT recurring_brand_needs_project CHECK (plan_brand_id IS NULL OR plan_project_id IS NOT NULL),
  ADD CONSTRAINT recurring_ends_after_start CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
  -- 프로젝트·분류는 반복의 법인 것만(cost_plans 와 같은 복합 FK). MATCH SIMPLE 이라 NULL 이면 검사하지 않는다.
  ADD CONSTRAINT recurring_plan_project_same_company
    FOREIGN KEY (plan_project_id, company_id) REFERENCES expenseone.plan_projects (id, company_id),
  ADD CONSTRAINT recurring_plan_brand_same_company
    FOREIGN KEY (plan_brand_id, company_id) REFERENCES expenseone.plan_brands (id, company_id);

CREATE TABLE expenseone.recurring_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_expense_id uuid NOT NULL REFERENCES expenseone.recurring_expenses (id) ON DELETE CASCADE,
  occurrence_date date NOT NULL,
  plan_id uuid REFERENCES expenseone.cost_plans (id) ON DELETE SET NULL,
  plan_version integer,
  expense_id uuid,
  run_at timestamptz,
  reserved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_occurrences_once UNIQUE (recurring_expense_id, occurrence_date),
  CONSTRAINT recurring_occurrences_plan_version_pair CHECK (plan_id IS NULL OR plan_version IS NOT NULL)
);
CREATE UNIQUE INDEX recurring_occurrences_plan_key
  ON expenseone.recurring_occurrences (plan_id) WHERE plan_id IS NOT NULL;
CREATE UNIQUE INDEX recurring_occurrences_expense_key
  ON expenseone.recurring_occurrences (expense_id) WHERE expense_id IS NOT NULL;

ALTER TABLE expenseone.recurring_occurrences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON expenseone.recurring_occurrences FROM anon, authenticated;
-- 0017 표 두 개도 다시 확인(ERP 320 이 잠갔지만 이 파일만 봐도 알 수 있게).
REVOKE ALL ON expenseone.recurring_expenses FROM anon, authenticated;

SELECT relname, relrowsecurity FROM pg_class
 WHERE oid IN ('expenseone.recurring_occurrences'::regclass, 'expenseone.recurring_expenses'::regclass) ORDER BY 1;
SELECT table_name, grantee, count(*) FROM information_schema.role_table_grants
 WHERE table_schema = 'expenseone' AND table_name IN ('recurring_occurrences', 'recurring_expenses')
   AND grantee IN ('anon', 'authenticated') GROUP BY 1, 2 ORDER BY 1, 2;
ROLLBACK;
