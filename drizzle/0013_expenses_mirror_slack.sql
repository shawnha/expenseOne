-- 0013_expenses_mirror_slack.sql
--
-- 별도 Slack 워크스페이스(리테일 등)에 미러 게시한 메시지의 좌표를 저장한다.
-- 비용 수정·삭제·취소 시 코리아 채널 메시지와 함께 미러 메시지도 갱신/제거해야
-- 리테일 채널에 유령 메시지가 쌓이지 않는다.
--
-- 두 컬럼 모두 nullable: 미러 대상이 아닌 회사(코리아·HOI)나 미러 환경변수가
-- 설정되기 전에 생성된 비용은 NULL로 남고, 삭제 로직이 자연스럽게 건너뛴다.

BEGIN;
SET LOCAL statement_timeout = '60s';

ALTER TABLE expenseone.expenses
  ADD COLUMN IF NOT EXISTS mirror_slack_message_ts varchar(50),
  ADD COLUMN IF NOT EXISTS mirror_slack_channel_id varchar(50);

COMMIT;
