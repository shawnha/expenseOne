# 카드 결제 식비 자동분류 + 알림 스킵

**Status**: Approved (브레인스토밍 완료)
**Date**: 2026-04-29
**Author**: shawn@hanah1.com + Claude

---

## 배경

현재 `syncGowidTransactions`(`src/services/gowid.service.ts`)와 `processCodefNotify`(`src/services/codef-notify.service.ts`)는 새 카드 거래가 들어오면 매핑된 사용자에게 무조건 인앱 알림 + 푸시(+Slack)를 보낸다. 이때 식비/간식·커피처럼 "법카사용 제출이 무의미한" 거래까지 매번 알림이 가서 노이즈가 크다.

회사 정책상 식비/간식·커피는 ExpenseOne에 개별 제출하지 않는다(쿠팡이츠·우아한형제들·메가커피 등 빈도가 너무 잦음). 다만 관리자는 대시보드에서 식비 총합을 파악할 수 있어야 한다.

`financeone.mapping_rules`(802건)와 `financeone.transactions`(4400+건, 96% 자동 매핑, 3427건 사람 confirm)에 식비 카테고리 매핑 정보가 이미 누적되어 있다. 이 데이터를 활용해 식비를 자동 감지하고, 자동 expense를 만들어 알림 없이 처리한다.

## 목표

- 식비 계열 카드 거래에 대해 Slack/푸시/인앱 알림 스킵
- 자동으로 `expenses` 레코드 생성 (APPROVED, category=FinanceOne leaf 이름) → 대시보드 합계에 반영
- 회식은 제외 (오분류 우려)
- 미매칭 거래는 기존 알림 흐름 유지

## 비목표

- FinanceOne `mapping_rules` 자체를 ExpenseOne에서 수정하지 않음 (read-only)
- ExpenseOne에서 카테고리 변경 시 FinanceOne 동기화 안 함 (정정 빈도 낮음)
- 기존 pending `gowid_transactions` 백필 안 함 (신규 거래만 적용)

---

## 식비 leaf set

`financeone.internal_accounts` 중 자동분류 대상 (entity별):

| entity | code | name | leaf id | 비고 |
|---|---|---|---|---|
| 1 (HOI) | EXP-030-001 | 점심 | 319 | |
| 1 (HOI) | EXP-030-002 | 간식/커피 | 320 | |
| 2 (한아원코리아) | EXP-030-001 | 식비 | 359 | |
| 2 (한아원코리아) | EXP-030-002 | 간식/커피 | 360 | |
| 2 (한아원코리아) | EXP-093-001 | 약국식비 | 437 | |
| 2 (한아원코리아) | EXP-094-001 | 리테일식비 | 449 | |
| 3 (한아원리테일) | EXP-030-001 | 점심 | 399 | |
| 3 (한아원리테일) | EXP-030-002 | 간식/커피 | 400 | |

**제외**: 회식(321/361/401), 식비/복리후생 parent(318/358/398), 정식결제(447, 카드대금 정산), 복리후생 parent.

leaf id는 환경에 따라 변할 수 있어서 코드에서는 `(entity_id, code)` 페어로 조회한다. 자세한 매핑은 `src/lib/financeone/meal-accounts.ts`(신규)에서 단일 출처로 관리.

## company ↔ entity 매핑

GoWid는 `companySlug`(korea/retail/hoi) 기반, FinanceOne은 `entity_id`(1/2/3) 기반. 한 번만 매핑 정의:

```ts
export const COMPANY_TO_ENTITY: Record<string, number> = {
  hoi: 1,
  korea: 2,
  retail: 3,
};
```

(검증: `financeone.entities`에서 코드 시작 시 sanity check.)

---

## 매칭 전략 (Layer Cake)

### L1. `financeone.mapping_rules` 직접 매칭

```sql
SELECT mr.internal_account_id
FROM financeone.mapping_rules mr
WHERE mr.entity_id = $entityId
  AND (
    mr.counterparty_pattern = $storeName  -- exact 우선
    OR similarity(mr.counterparty_pattern, $storeName) >= 0.5  -- trigram fallback
  )
ORDER BY
  (mr.counterparty_pattern = $storeName) DESC,  -- exact 먼저
  similarity(mr.counterparty_pattern, $storeName) DESC,
  mr.confidence DESC,
  mr.hit_count DESC
LIMIT 1;
```

`idx_mapping_rules_trgm` GIN index가 이미 있어서 trigram 매칭은 빠름.

매칭된 `internal_account_id`가 식비 leaf set에 있으면 → **식비**, source = `mapping_rules`.

### L2. `financeone.transactions` 이력 다수결

L1 미매칭 시 fallback. 같은 가맹점이 과거에 어떻게 분류됐는지 본다.

```sql
SELECT t.internal_account_id, count(*) AS uses
FROM financeone.transactions t
WHERE t.entity_id = $entityId
  AND t.is_cancel = false
  AND t.is_duplicate = false
  AND t.mapping_source IN ('confirmed', 'manual', 'exact')
  AND t.internal_account_id IS NOT NULL
  AND (
    t.counterparty = $storeName
    OR similarity(t.counterparty, $storeName) >= 0.5
  )
GROUP BY t.internal_account_id;
```

- 총 매칭 거래 ≥ 3건
- 식비 leaf로 분류된 비율 ≥ 80%
- → **식비**, source = `history_majority`

신뢰도 낮은 분류(`auto`, `similar`)는 다수결 풀에서 제외.

### L3. 미매칭 → 기존 알림 흐름

---

## 식비 매칭 시 동작

1. `expenses` 레코드 자동 생성:
   ```
   submittedById = mapping.userId
   companyId     = mapping.companyId
   type          = 'CORPORATE_CARD'
   status        = 'APPROVED'
   transactionDate = expense.expenseDate
   amount        = round(expense.krwAmount)
   currency      = expense.currency
   merchantName  = expense.storeName
   cardLastFour  = lastFour
   category      = FinanceOne leaf name 그대로 ("식비" / "간식/커피" / "점심" / "약국식비" / "리테일식비")
   gowidTxId     = gowid_transactions.id
   submittedAt   = now()
   approvedAt    = now()
   approvedById  = null  -- system auto
   autoClassified         = true
   autoClassifiedSource   = 'mapping_rules' | 'history_majority'
   autoClassifiedAccountId = matchedAccountId
   ```
   첨부파일 없음.

2. `gowid_transactions` 업데이트:
   ```
   status            = 'consumed'
   consumedExpenseId = <new expense id>
   consumedAt        = now()
   ```

3. **알림 발송 안 함**:
   - `createNotification` 호출 없음
   - `sendPushToUser` 호출 없음
   - Slack 호출 없음
   - admin 알림 없음 (이미 처리 완료)

4. 카운터 증가: 응답에 `autoClassified` 카운트 추가 → cron 응답 로깅에 노출.

## 사용자 수정

- 자동분류 expense도 일반 expense와 동일하게 view/edit/cancel 가능
- category 변경 시 ExpenseOne 쪽만 갱신 (FinanceOne 동기화 X — 정정 빈도 낮다고 판단)
- cancel은 일반 흐름 따름. cancel된 자동 expense의 `gowid_transactions`는 'consumed' 그대로 둠 (재발송 X) — 사용자가 직접 새 expense 만들어야 함

## Schema 변경

```sql
-- drizzle/0008_expenses_auto_classified.sql
ALTER TABLE expenseone.expenses
  ADD COLUMN auto_classified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN auto_classified_source VARCHAR(32),
  ADD COLUMN auto_classified_account_id INTEGER;

CREATE INDEX idx_expenses_auto_classified
  ON expenseone.expenses (auto_classified)
  WHERE auto_classified = TRUE;
```

`src/lib/db/schema.ts`의 `expenses` 테이블에 동일하게 추가.

`auto_classified_account_id`는 FinanceOne `internal_accounts.id`를 그대로 저장 (FK 제약 없음 — cross-schema 의존 회피, lookup만).

## 적용 시점

- 신규 거래만 적용 (배포 이후 sync부터)
- 기존 pending `gowid_transactions`는 그대로 (사용자 수동 처리)

## Admin 가시성

- `/admin/expenses` 리스트:
  - 행에 "자동분류" 뱃지 표시
  - 필터 토글: "전체 / 자동분류 / 수동제출"
- `/admin/dashboard` 또는 별도 위젯:
  - 이번 달 자동분류 N건 / 합계 X원 (선택사항, MVP 후)

---

## 코드 변경 위치

| 파일 | 변경 |
|---|---|
| `src/services/financeone-classifier.service.ts` | **신규** — `classifyMealExpense(storeName, entityId)`, L1/L2 |
| `src/lib/financeone/meal-accounts.ts` | **신규** — 식비 leaf set, COMPANY_TO_ENTITY |
| `src/lib/db/schema.ts` | `expenses`에 auto_classified* 3컬럼 |
| `drizzle/0008_expenses_auto_classified.sql` | 신규 마이그레이션 |
| `src/services/gowid.service.ts:syncGowidTransactions` | 알림 호출 직전에 classifier 분기 |
| `src/services/codef-notify.service.ts:processCodefNotify` | 동일 분기 |
| `src/app/admin/expenses/page.tsx` (또는 컴포넌트) | "자동분류" 뱃지 + 필터 |
| `src/app/api/admin/expenses/route.ts` | autoClassified 필터 쿼리 파라미터 |

## 테스트

### Unit (classifier)
- mapping_rules 매칭: 쿠팡이츠 → 식비, 우아한형제들 → 식비, 메가엠지씨커피 → 간식/커피
- 다수결: 같은 가맹점 식비 5건 vs 회의 0건 → 식비 (`history_majority`)
- 회식만 분류된 가맹점 → 매칭 X (정상 알림 흐름)
- 다수결 임계치 미달 (총 2건) → 매칭 X
- 다수결 비율 미달 (식비 60%) → 매칭 X
- 미매칭 가맹점 → fallthrough

### Integration
- `syncGowidTransactions`에서 식비 거래 → expense row 생성, gowid_transactions consumed, notification 호출 0회
- 비식비 거래 → 기존대로 알림 1회 + push 1회
- 회식 카테고리 거래 → 알림 정상 발송

### Manual
- 1주 모니터링: cron 응답에서 일별 `autoClassified` 카운트 + 카테고리 분포 확인
- 자동분류된 expense가 `/admin/expenses`에서 뱃지 + 필터 정상

## 위험 / 모니터링

- **company → entity 매핑 누락**: 새 회사 추가 시 `COMPANY_TO_ENTITY`에 추가 안 하면 모든 거래가 미매칭으로 떨어져 알림 폭주. 매핑 누락 시 경고 로그.
- **storeName ↔ counterparty 표기 차이**: GoWid는 가맹점 등록명, FinanceOne은 카드사 명세서 텍스트. trigram similarity 0.5로 어느 정도 흡수되지만 첫 1주 false negative 비율 모니터링.
- **mapping_rules 신뢰도 변화**: FinanceOne에서 잘못 confirmed된 룰이 있을 경우 오분류 가능. admin 페이지에서 자동분류 expense 검수 가능하도록 뱃지 + 필터 제공.
- **cancel race**: 사용자가 자동 expense를 cancel하는 동안 새 GoWid sync가 같은 거래를 재처리하지 않도록 — gowid_transactions의 'consumed' 상태가 그대로 유지되어 자연 차단됨.

## 후속 작업 (이 spec 범위 외)

- 자동분류 통계 위젯 (월별/카테고리별)
- ExpenseOne ↔ FinanceOne category 양방향 동기화 (필요 시)
- 사용자 옵트아웃 (어떤 사용자는 직접 등록 선호) — 현재는 전 사용자 동일
- 회식 자동분류 (운영 데이터 쌓이면 신뢰도 검증 후 합류 검토)
