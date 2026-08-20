-- 카드 끝 4자리의 unique 범위를 전역 → 회사별로 좁힌다.
--
-- 끝 4자리는 10,000가지뿐이라 법인이 늘면 서로 다른 회사의 카드가 같은 4자리로
-- 끝나는 일이 생긴다(카드 26장에서 이미 약 3%, 40장이면 약 8%). 전역 unique면
-- 그때 두 번째 카드를 아예 등록할 수 없고, 동기화는 두 회사의 거래를 한 매핑에
-- 몰아넣어 **엉뚱한 사람에게 알림이 가고 엉뚱한 법인 비용으로 잡힌다.**
--
-- NULLS NOT DISTINCT: 회사 미지정(company_id IS NULL) 행끼리도 같은 4자리를
-- 중복 등록하지 못하게 막는다. 기본값(NULLS DISTINCT)이면 NULL 회사 행이
-- 무제한으로 쌓인다.

ALTER TABLE expenseone.gowid_card_mappings
  DROP CONSTRAINT IF EXISTS gowid_card_mappings_card_last_four_key;

CREATE UNIQUE INDEX IF NOT EXISTS gowid_card_mappings_company_card_key
  ON expenseone.gowid_card_mappings (company_id, card_last_four)
  NULLS NOT DISTINCT;
