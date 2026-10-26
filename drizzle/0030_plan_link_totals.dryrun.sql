SET lock_timeout = '3s'; SET statement_timeout = '30s';
-- 0030 ERP 읽기용 뷰 plan_link_totals — 2026-10-26
-- 요청: 한아원 ERP ① 통합(메일함 1-integ/20261026-2043-…-계획연결입금요청-현금흐름금액.md «① 회신»).
-- 계획에 연결된 비용(입금요청·법카)을 계획 한 줄로 모은다. ERP 예상현금흐름이 계획 금액 대신 연결된 입금요청의
-- 현재 금액·납기일로 줄을 바꾸는 데 쓴다. ERP 는 이 뷰만 읽고, 익스펜스원 표에도 ERP 표에도 쓰지 않는다.
--
-- 칸 뜻(살아 있는 연결 = unlinked_at IS NULL · 비용이 남아 있음 · status ∉ REJECTED, CANCELLED)
--   plan_id            계획. 연결이 한 번이라도 있었던 계획만 나온다(다 풀린 계획도 live_count 0 으로 남는다 — ERP 가 되돌릴 근거)
--   live_amount_sum    살아 있는 연결 비용의 현재 amount 합(원화 실지급액 · 원천징수 뒤 · USD 는 환산된 원화). 법카 포함
--   live_count         살아 있는 연결 건수
--   earliest_due_date  살아 있는 연결 중 가장 이른 납기일(due_date). 없으면 NULL
--   has_card           살아 있는 연결에 법카가 있는가(ERP: 지급됨 처리)
--   card_amount_sum    그중 법카 금액 합(요청에 없던 칸 — 입금요청과 법카가 섞인 계획을 나누라고 더함)
--   prepaid_amount     살아 있는 선지급 입금요청의 선지급금 합. 앱 lib/utils/pre-paid prePaidSplit 과 같은 규칙:
--                        금액 지정(expense_pre_paid_amounts, 0 < x < amount)이 있으면 그 금액,
--                        비율 1~99 면 round(amount × 비율 / 100), 그 밖(전액 선지급)은 amount 전부
--   prepaid_due_date   선지급금이 나가는 날 = 승인일(approved_at, KST 날짜). 아직 승인 전이면 제출일(created_at). 선지급 건이 없으면 NULL
--                        잔금(후지급)은 각 건의 due_date 로 나간다(= earliest_due_date 쪽)
--   last_changed_at    연결·해제·비용 수정·선지급 금액 수정 중 가장 늦은 시각(ERP 가 다시 읽을지 판단)
--
-- 규칙: expenses·users 에 컬럼·트리거·제약을 붙이지 않는다(뷰는 읽기만). 새 객체 규칙대로 같은 트랜잭션에서 REVOKE.
-- 소유자 = postgres(뷰는 소유자 권한으로 읽으므로 RLS 를 거치지 않는다) → anon·authenticated 에 아무 권한도 주지 않는다.
-- ERP 는 자기 SECURITY DEFINER 함수(postgres)로 읽는다. 다른 역할에 SELECT 가 필요하면 ERP 쪽 요청으로 따로 GRANT.
-- 참고: 뷰라서 expenses.amount·status·due_date·type·is_pre_paid·pre_paid_percentage·approved_at·created_at·updated_at 의
-- 타입을 바꾸려면 이 뷰를 먼저 지웠다 다시 만들어야 한다(pg_depend). 되돌리기 = 0030_plan_link_totals.rollback.sql.
BEGIN;

CREATE VIEW expenseone.plan_link_totals AS
WITH per_link AS (
  SELECT
    l.plan_id,
    l.created_at                    AS linked_at,
    l.unlinked_at,
    e.updated_at                    AS expense_updated_at,
    pa.updated_at                   AS prepaid_updated_at,
    (l.unlinked_at IS NULL AND e.id IS NOT NULL AND e.status NOT IN ('REJECTED', 'CANCELLED')) AS live,
    e.type,
    e.amount,
    e.due_date,
    e.is_pre_paid,
    CASE
      WHEN e.is_pre_paid IS NOT TRUE THEN NULL
      WHEN pa.amount IS NOT NULL AND pa.amount > 0 AND pa.amount < e.amount THEN pa.amount
      WHEN e.pre_paid_percentage BETWEEN 1 AND 99 THEN round(e.amount::numeric * e.pre_paid_percentage / 100)::integer
      ELSE e.amount
    END                             AS prepaid_amount,
    CASE
      WHEN e.is_pre_paid IS TRUE THEN (coalesce(e.approved_at, e.created_at) AT TIME ZONE 'Asia/Seoul')::date
    END                             AS prepaid_date
  FROM expenseone.plan_expense_links l
  LEFT JOIN expenseone.expenses e ON e.id = l.expense_id
  LEFT JOIN expenseone.expense_pre_paid_amounts pa ON pa.expense_id = e.id
)
SELECT
  plan_id,
  coalesce(sum(amount) FILTER (WHERE live), 0)::bigint                                   AS live_amount_sum,
  count(*) FILTER (WHERE live)::integer                                                  AS live_count,
  min(due_date) FILTER (WHERE live)                                                      AS earliest_due_date,
  coalesce(bool_or(type = 'CORPORATE_CARD') FILTER (WHERE live), false)                  AS has_card,
  coalesce(sum(amount) FILTER (WHERE live AND type = 'CORPORATE_CARD'), 0)::bigint       AS card_amount_sum,
  coalesce(sum(prepaid_amount) FILTER (WHERE live), 0)::bigint                           AS prepaid_amount,
  min(prepaid_date) FILTER (WHERE live)                                                  AS prepaid_due_date,
  greatest(max(linked_at), max(unlinked_at), max(expense_updated_at), max(prepaid_updated_at)) AS last_changed_at
FROM per_link
GROUP BY plan_id;

COMMENT ON VIEW expenseone.plan_link_totals IS
  'ERP 예상현금흐름용 읽기 전용: 계획별 살아 있는 연결 비용 합계·건수·가장 이른 납기일·법카 여부·선지급(0030, 2026-10-26). 칸 뜻은 drizzle/0030_plan_link_totals.sql 머리 주석.';

REVOKE ALL ON expenseone.plan_link_totals FROM PUBLIC, anon, authenticated;

-- 확인: 권한 0 · 행 수
SELECT grantee, count(*) FROM information_schema.role_table_grants
 WHERE table_schema = 'expenseone' AND table_name = 'plan_link_totals' AND grantee IN ('anon', 'authenticated', 'PUBLIC')
 GROUP BY 1;
SELECT count(*) AS plans, sum(live_count) AS live_links FROM expenseone.plan_link_totals;

ROLLBACK;
