# HOI 회사 USD 통화 지원 — Design Spec

## Summary

HOI 회사 추가 + USD 통화 지원. 회사별 통화 설정, 한국수출입은행 환율 API 연동, 폼/표시/Slack 메시지에 달러+원화 병기.

**변경하지 않는 것:**
- 기존 한아원코리아/리테일의 KRW 동작
- 비즈니스 로직 (승인 플로우, 권한)
- UI 레이아웃/디자인

---

## 1. DB 스키마 변경

### companies 테이블
```sql
ALTER TABLE expenseone.companies ADD COLUMN currency varchar(3) NOT NULL DEFAULT 'KRW';
```

### expenses 테이블
```sql
ALTER TABLE expenseone.expenses ADD COLUMN currency varchar(3) NOT NULL DEFAULT 'KRW';
ALTER TABLE expenseone.expenses ADD COLUMN amount_original integer;
ALTER TABLE expenseone.expenses ADD COLUMN exchange_rate numeric(10,2);
```

- `amount`: 항상 KRW (리포트/대시보드 집계 기준)
- `amount_original`: 원래 통화 금액 (USD면 센트 단위 integer, KRW면 null)
- `currency`: 'KRW' | 'USD'
- `exchange_rate`: 적용 환율 (USD→KRW, 예: 1385.50). KRW면 null

### HOI 회사 추가
```sql
INSERT INTO expenseone.companies (name, slug, currency, slack_channel_id, sort_order)
VALUES ('HOI', 'hoi', 'USD', NULL, 2)
ON CONFLICT (slug) DO NOTHING;
```

---

## 2. 한국수출입은행 환율 API

### 서비스
- `src/services/exchange-rate.service.ts`
- API: `https://www.koreaexim.go.kr/site/program/financial/exchangeJSON`
- 파라미터: `authkey`, `searchdate` (YYYYMMDD), `data=AP01`
- 응답에서 `cur_unit=USD`의 `deal_bas_r` (매매기준율) 사용

### 캐싱
- 메모리 캐시 (Map), TTL 4시간
- 영업일 아닌 경우 (결과 없으면) 이전 영업일 자동 탐색 (최대 5일)
- 서버 재시작 시 캐시 초기화 → 첫 요청에서 재조회

### 환경변수
- `KOREAEXIM_API_KEY` — 제공된 키 사용

### API 엔드포인트
- `GET /api/exchange-rate?currency=USD` → `{ rate: 1385.50, date: "2026-04-05" }`
- 폼에서 실시간 환율 표시용

---

## 3. 폼 동작 변경

### 회사 선택 시
- HOI 선택 → 통화 USD 자동 전환
- 금액 입력 prefix: `$` (KRW: suffix `원`)
- USD 입력: 소수점 2자리 허용 (예: $1,500.00)
- 내부 저장: 센트 단위 integer (1500.00 → 150000)

### 환율 표시
- 폼 하단: "적용 환율: 1 USD = 1,385.50원 (2026.04.05 기준)"
- KRW 환산 금액 실시간 표시: "$1,500.00 → ₩2,078,250"

### 검증 스키마 변경
- `amount` 필드: USD일 때 `z.number().positive()` (소수 허용)
- 서버 전송 시: amount_original(센트), amount(KRW 환산), currency, exchange_rate

---

## 4. 금액 표시 규칙

| 위치 | USD 표시 | KRW 표시 |
|------|----------|----------|
| 리스트/카드 | $1,500.00 (₩2,078,250) | 2,078,250원 |
| 상세 페이지 | $1,500.00 (₩2,078,250) | 2,078,250원 |
| 대시보드 집계 | ₩ 기준 | ₩ 기준 |
| Slack | $1,500.00 (₩2,078,250) | 2,078,250원 |

### 포맷 함수
- `formatExpenseAmount(amount, currency, amountOriginal, exchangeRate)`
- USD: `$${(amountOriginal/100).toLocaleString('en-US', {minimumFractionDigits:2})} (₩${amount.toLocaleString('ko-KR')})`
- KRW: `${amount.toLocaleString('ko-KR')}원`

---

## 5. Slack 메시지 변경

`slack.service.ts`의 `notifySlackCorporateCard`, `notifySlackApproved`:
- expense에 currency/amountOriginal 포함
- USD: `• 금액: $1,500.00 (₩2,078,250)`
- KRW: `• 금액: 2,078,250원` (기존 유지)

---

## 6. 파일 변경 목록

| 파일 | 변경 |
|------|------|
| `src/lib/db/schema.ts` | companies에 currency, expenses에 currency/amountOriginal/exchangeRate |
| `src/services/exchange-rate.service.ts` | 새 파일: 환율 API + 캐시 |
| `src/app/api/exchange-rate/route.ts` | 새 파일: GET 환율 엔드포인트 |
| `src/lib/validations/expense-form.ts` | USD 금액 검증, parseAmountUSD |
| `src/lib/utils/expense-utils.ts` | formatExpenseAmount 추가 |
| `src/services/expense.service.ts` | createExpense에 환율 변환 |
| `src/services/slack.service.ts` | 통화별 금액 표시 |
| `src/components/forms/company-selector.tsx` | currency 정보 전달 |
| `corporate-card-form.tsx` | USD 입력 모드 |
| `deposit-request-form.tsx` | USD 입력 모드 |
| `drizzle/seed-companies.sql` | HOI 추가 |
| 표시 컴포넌트 (리스트, 상세 등) | formatExpenseAmount 사용 |

---

## 7. 성공 기준

- [ ] HOI 선택 시 $ 입력 모드 전환
- [ ] 환율 API 호출 및 실시간 표시
- [ ] DB에 currency, amountOriginal, exchangeRate 저장
- [ ] 리스트/상세에서 $X (₩Y) 표시
- [ ] Slack에 $X (₩Y) 형식 전송
- [ ] 기존 KRW 비용 동작 변경 없음
- [ ] 대시보드 집계 KRW 기준 유지
