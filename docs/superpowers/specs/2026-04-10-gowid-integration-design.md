# GoWid OpenAPI Integration Design

**Date**: 2026-04-10
**Replaces**: Codef integration (feature/codef-integration branch, not merged to main)

## Overview

고위드(GoWid) OpenAPI를 사용하여 법인카드 거래 내역을 자동으로 가져오고, 사용자에게 미제출 거래를 알림 + 프리필 폼으로 제출을 유도하는 기능.

## Why GoWid over Codef

| | Codef | GoWid |
|---|---|---|
| 인증 | 사용자별 카드사 로그인 (ID/PW) | 회사 API 키 1개 |
| 암호화 | AES-256-GCM + RSA (SDK) | 불필요 |
| 연동 복잡도 | SDK + 암호화 + connectedId | 단순 REST (fetch) |
| 카드 커버리지 | 사용자가 직접 등록한 카드만 | 고위드에 등록된 전체 법인카드 (15장) |
| 설정 | 사용자별 카드사 로그인 필요 | 관리자가 API 키 설정 + 카드 매핑 |

## GoWid API Summary

- **Base URL**: `https://openapi.gowid.com`
- **Auth**: `Authorization: {API_KEY}` header
- **Key Endpoints**:
  - `GET /v1/members` — 법인 소속 사용자 조회
  - `GET /v1/expenses?page=0&size=N` — 전체 지출내역 목록
  - `GET /v1/expenses/not-submitted?page=0&size=N` — 미제출 영수증 목록
  - `GET /v1/expenses/{expenseId}` — 지출내역 단건 상세
  - `PUT /v1/expenses/{expenseId}/memo` — 메모 수정

- **Expense Data Fields**:
  - `expenseId` (number): GoWid 고유 ID
  - `expenseDate` (string, YYYYMMDD): 사용일
  - `expenseTime` (string, HHMMSS): 사용시간
  - `useAmount` (number): 사용금액
  - `currency` (string): KRW/USD
  - `krwAmount` (number): 원화 환산 금액
  - `storeName` (string): 가맹점명
  - `storeAddress` (string): 가맹점 주소
  - `cardAlias` (string|null): 카드 소지자 이름
  - `shortCardNumber` (string): "롯데 9884" 형식
  - `approvalStatus` (string): NOT_SUBMITTED 등

## Architecture

### DB Schema Changes

#### 1. `gowid_card_mappings` 테이블 (NEW)

카드 끝4자리 → 앱 사용자 매핑. 관리자가 설정.

```
gowid_card_mappings:
  id: UUID (PK)
  card_last_four: VARCHAR(4) NOT NULL UNIQUE
  card_alias: VARCHAR(100)           -- GoWid에서 가져온 카드 별칭 (참고용)
  user_id: UUID FK(users) NULL       -- 매핑된 앱 사용자 (NULL이면 미매핑)
  company_id: UUID FK(companies) NULL
  created_at: TIMESTAMP
  updated_at: TIMESTAMP
```

#### 2. `gowid_transactions` 테이블 (NEW)

GoWid에서 가져온 미제출 거래 스테이징.

```
gowid_transactions:
  id: UUID (PK)
  gowid_expense_id: INTEGER NOT NULL UNIQUE  -- GoWid expenseId (dedup key)
  user_id: UUID FK(users) NULL               -- 매핑된 앱 사용자
  card_last_four: VARCHAR(4)
  card_alias: VARCHAR(100)
  expense_date: VARCHAR(8)                   -- YYYYMMDD
  expense_time: VARCHAR(6)                   -- HHMMSS
  amount: INTEGER NOT NULL                   -- 원화 금액 (KRW)
  currency: VARCHAR(3) DEFAULT 'KRW'
  store_name: VARCHAR(500)
  store_address: VARCHAR(500)
  status: VARCHAR(20) DEFAULT 'pending'      -- pending | consumed | dismissed
  consumed_expense_id: UUID FK(expenses) NULL
  consumed_at: TIMESTAMP NULL
  notified_at: TIMESTAMP NULL                -- 알림 발송 시각
  created_at: TIMESTAMP
  updated_at: TIMESTAMP
```

#### 3. Notification Type 추가

`GOWID_NEW_TRANSACTION` enum 값 추가.

### New Files

```
src/lib/gowid/
  client.ts          -- GoWid REST API client (fetch wrapper)

src/services/
  gowid.service.ts   -- Sync logic, card mapping, transaction staging

src/app/api/cron/
  gowid-sync/
    route.ts         -- Vercel Cron endpoint

src/app/(dashboard)/settings/gowid/
  page.tsx           -- 카드 매핑 관리 UI (Server Component)
  gowid-settings-client.tsx  -- Client Component

src/app/api/gowid/
  card-mappings/
    route.ts         -- CRUD for card mappings
```

### Modified Files

```
src/lib/db/schema.ts              -- 새 테이블 스키마 추가
src/app/(dashboard)/expenses/new/corporate-card/
  page.tsx                         -- GoWid prefill 지원 (stagingId → gowidTxId)
  corporate-card-form.tsx          -- 프리필 데이터 표시
vercel.json                        -- gowid-sync cron 추가
src/types/index.ts                 -- 새 타입 추가
```

## Sync Flow

```
Vercel Cron (매일 9시 KST)
  → GET /v1/expenses/not-submitted (GoWid API)
  → 각 거래에 대해:
    1. gowid_expense_id로 dedup (이미 있으면 skip)
    2. card_last_four로 gowid_card_mappings 조회 → user_id 매핑
    3. gowid_transactions에 INSERT
    4. user_id가 있고 notified_at이 NULL이면:
       → 인앱 알림 생성 (GOWID_NEW_TRANSACTION)
       → Web Push 발송
       → notified_at 업데이트
    5. user_id가 없으면 (미매핑 카드):
       → ADMIN에게 알림 ("미매핑 카드 거래 N건")
```

## Prefill Flow

```
알림 클릭 → /expenses/new/corporate-card?gowidTxId=<uuid>
  → Server: gowid_transactions에서 조회
  → 검증: userId 매칭, status=pending
  → prefillData: { amount, storeName, transactionDate, gowidTxId }
  → 폼 프리필 + 제출
  → expense 생성 + gowid_transactions.status='consumed'
```

## Settings UI

관리자 전용 `/settings/gowid` 페이지:

1. **카드 매핑 목록**: GoWid에서 가져온 카드 목록 + 매핑된 사용자
2. **매핑 설정**: 각 카드에 앱 사용자 드롭다운 선택
3. **수동 동기화 버튼**: 즉시 GoWid 동기화 트리거
4. **마지막 동기화 시각** 표시

초기 데이터: GoWid `/v1/members` + `/v1/expenses/not-submitted`에서 카드 목록 자동 수집 → `cardAlias`↔`users.name` 자동 매칭 제안.

## Environment Variables

```
GOWID_API_KEY=57babdd8-5636-4f11-8f2f-1061069f6799
```

## Codef Code Handling

- Codef 코드는 `feature/codef-integration` 브랜치에만 존재 (main 미머지)
- GoWid 통합은 main 브랜치에서 직접 작업
- Codef 코드 삭제 불필요 (별도 브랜치)

## Out of Scope

- GoWid 승인상태 양방향 동기화 (우리 앱 제출 → GoWid 상태 변경)
- GoWid 해외 거래 자동 환율 변환 (기존 KRW/USD 시스템 사용)
- GoWid 증빙 사진 동기화
