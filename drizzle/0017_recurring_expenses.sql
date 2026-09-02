-- 반복 입금요청 (정기 지출 자동 등록)
--
-- 월세·구독료처럼 매번 같은 내용으로 올리는 입금요청을 미리 등록해두면,
-- 예정일에 cron이 실제 입금요청을 만들어 승인 대기로 올린다.
--
-- 주기는 (frequency, interval)로 표현한다. 격월·분기를 따로 두지 않고
-- MONTHLY + interval 2/3으로 처리하면 규칙이 하나로 유지된다.
--   매주 월요일     WEEKLY,  interval 1, weekday 1
--   매달 25일       MONTHLY, interval 1, day_of_month 25
--   3개월마다 1일   MONTHLY, interval 3, day_of_month 1
--   매년 3월 1일    YEARLY,  interval 1, month_of_year 3, day_of_month 1

CREATE TABLE IF NOT EXISTS expenseone.recurring_expenses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 생성될 입금요청의 내용
  title             varchar(200) NOT NULL,
  description       text,
  amount            integer NOT NULL CHECK (amount > 0),
  currency          varchar(3) NOT NULL DEFAULT 'KRW',
  category          varchar(100) NOT NULL,
  bank_name         varchar(50)  NOT NULL,
  account_holder    varchar(100) NOT NULL,
  account_number    varchar(50)  NOT NULL,
  company_id        uuid NOT NULL REFERENCES expenseone.companies(id),
  -- 이 사람이 제출한 것으로 만들어진다. 알림도 이 사람에게 간다.
  submitted_by_id   uuid NOT NULL REFERENCES expenseone.users(id) ON DELETE CASCADE,

  -- 주기
  frequency         varchar(10) NOT NULL CHECK (frequency IN ('WEEKLY','MONTHLY','YEARLY')),
  interval_count    integer NOT NULL DEFAULT 1 CHECK (interval_count BETWEEN 1 AND 12),
  -- MONTHLY/YEARLY: 1~31. 그 달에 없는 날(2월 31일)이면 말일로 대체한다.
  day_of_month      integer CHECK (day_of_month BETWEEN 1 AND 31),
  -- YEARLY: 1~12
  month_of_year     integer CHECK (month_of_year BETWEEN 1 AND 12),
  -- WEEKLY: 0(일)~6(토)
  weekday           integer CHECK (weekday BETWEEN 0 AND 6),

  -- 납입 기일을 생성일로부터 며칠 뒤로 잡을지. null이면 기일 없음.
  due_date_offset_days integer,

  -- 증빙서류를 매번 붙일지. 켜면 아래 템플릿 첨부를 복사해서 붙인다.
  attach_files      boolean NOT NULL DEFAULT false,

  is_active         boolean NOT NULL DEFAULT true,
  -- 다음 생성 예정일. cron은 이 값만 보고 고르므로 조회가 단순하고,
  -- 생성 후 다음 값으로 밀기 때문에 같은 날 두 번 돌아도 중복 생성되지 않는다.
  next_run_date     date NOT NULL,
  last_run_at       timestamptz,
  last_expense_id   uuid REFERENCES expenseone.expenses(id) ON DELETE SET NULL,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- 주기별로 필요한 값이 채워져 있어야 한다. 없으면 다음 날짜를 계산할 수 없다.
  CONSTRAINT recurring_schedule_fields CHECK (
    (frequency = 'WEEKLY'  AND weekday IS NOT NULL) OR
    (frequency = 'MONTHLY' AND day_of_month IS NOT NULL) OR
    (frequency = 'YEARLY'  AND day_of_month IS NOT NULL AND month_of_year IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_recurring_due
  ON expenseone.recurring_expenses (next_run_date)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_recurring_submitter
  ON expenseone.recurring_expenses (submitted_by_id);

-- 템플릿 첨부. 생성 시 **스토리지 파일을 복사**해서 새 attachments 행을 만든다.
-- 같은 파일을 여러 비용이 공유하면, 한 건에서 첨부를 지울 때 스토리지 원본이
-- 사라져 나머지 건의 첨부가 깨진다(deleteAttachment/deleteExpense가 fileKey로
-- 원본을 지운다). 복사하면 각 건이 독립적이라 그 규칙을 신경 쓸 필요가 없다.
CREATE TABLE IF NOT EXISTS expenseone.recurring_expense_attachments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_expense_id  uuid NOT NULL
    REFERENCES expenseone.recurring_expenses(id) ON DELETE CASCADE,
  document_type         varchar(100) NOT NULL,
  file_name             varchar(255) NOT NULL,
  file_key              varchar(500) NOT NULL,
  file_url              text NOT NULL,
  file_size             integer NOT NULL,
  mime_type             varchar(100) NOT NULL,
  uploaded_by_id        uuid NOT NULL REFERENCES expenseone.users(id),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_attachments_parent
  ON expenseone.recurring_expense_attachments (recurring_expense_id);
