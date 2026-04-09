-- ============================================================================
-- Codef API 연동 — 법카 거래 자동 감지 & Prefill
-- 모든 변경은 additive. 기존 데이터/쿼리 영향 0.
-- ============================================================================

-- 1. notification_type enum 값 추가 (IF NOT EXISTS 지원, 9.6+)
ALTER TYPE expenseone.notification_type ADD VALUE IF NOT EXISTS 'CODEF_NEW_TRANSACTION';
ALTER TYPE expenseone.notification_type ADD VALUE IF NOT EXISTS 'CODEF_TRANSACTION_CANCELLED';

-- 2. notifications 테이블에 link_url 컬럼 추가 (nullable, 기존 row 영향 0)
ALTER TABLE expenseone.notifications
  ADD COLUMN IF NOT EXISTS link_url text;

-- 3. codef_connections 테이블 생성
CREATE TABLE IF NOT EXISTS expenseone.codef_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES expenseone.users(id) ON DELETE CASCADE,
  connected_id_encrypted text NOT NULL,
  card_company varchar(20) NOT NULL,
  card_no_masked varchar(20),
  is_active boolean NOT NULL DEFAULT true,
  last_sync_at timestamp with time zone,
  last_sync_status varchar(20),
  last_sync_error text,
  backoff_until timestamp with time zone,
  consecutive_failures integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_codef_conn_user
  ON expenseone.codef_connections(user_id);

CREATE INDEX IF NOT EXISTS idx_codef_conn_active_backoff
  ON expenseone.codef_connections(is_active, backoff_until);

-- 4. codef_transactions_staging 테이블 생성
CREATE TABLE IF NOT EXISTS expenseone.codef_transactions_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES expenseone.users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES expenseone.codef_connections(id) ON DELETE CASCADE,

  -- Codef 원본 (dedup key)
  res_approval_no varchar(50) NOT NULL,
  res_approval_date varchar(8) NOT NULL,
  res_approval_time varchar(6) NOT NULL DEFAULT '',
  res_card_no varchar(30) NOT NULL,

  -- 표시용
  amount integer NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'KRW',
  merchant_name varchar(200),
  merchant_type varchar(100),
  is_cancelled boolean NOT NULL DEFAULT false,
  is_overseas boolean NOT NULL DEFAULT false,

  -- 라이프사이클
  status varchar(20) NOT NULL DEFAULT 'pending',
  consumed_expense_id uuid REFERENCES expenseone.expenses(id) ON DELETE SET NULL,
  consumed_at timestamp with time zone,
  dismissed_at timestamp with time zone,

  raw_payload jsonb,
  fetched_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Dedup: 같은 (user, card, date+time, approvalNo) 중복 INSERT 방지
CREATE UNIQUE INDEX IF NOT EXISTS idx_codef_stg_dedup
  ON expenseone.codef_transactions_staging(
    user_id, res_card_no, res_approval_date, res_approval_time, res_approval_no
  );

-- Idempotency: 한 staging 은 1 expense 에만 연결
CREATE UNIQUE INDEX IF NOT EXISTS idx_codef_stg_consumed_expense
  ON expenseone.codef_transactions_staging(consumed_expense_id)
  WHERE consumed_expense_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_codef_stg_user_pending
  ON expenseone.codef_transactions_staging(user_id, status);

CREATE INDEX IF NOT EXISTS idx_codef_stg_connection
  ON expenseone.codef_transactions_staging(connection_id);

-- 5. RLS (베타 사용자 영향 없도록 신규 테이블만 정책 추가)
ALTER TABLE expenseone.codef_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenseone.codef_transactions_staging ENABLE ROW LEVEL SECURITY;

-- 본인 connection 만 SELECT/UPDATE/DELETE 가능
DROP POLICY IF EXISTS codef_conn_owner ON expenseone.codef_connections;
CREATE POLICY codef_conn_owner ON expenseone.codef_connections
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 본인 staging 만 SELECT 가능 (INSERT/UPDATE 는 service role 만)
DROP POLICY IF EXISTS codef_stg_owner ON expenseone.codef_transactions_staging;
CREATE POLICY codef_stg_owner ON expenseone.codef_transactions_staging
  FOR SELECT
  USING (user_id = auth.uid());
