# ExpenseOne Integration Guide

> 외부 시스템 연동을 위한 기술 문서. API 명세, DB 스키마, 인증, 비즈니스 로직 포함.

## Tech Stack

| 영역 | 기술 |
|------|------|
| Framework | Next.js 14+ (App Router) |
| DB | Supabase (PostgreSQL) |
| ORM | Drizzle ORM |
| Auth | Supabase Auth + Google SSO |
| Storage | Supabase Storage |
| Push | Web Push (VAPID) |
| Deploy | Vercel |

---

## 1. 인증 (Authentication)

### Google SSO Flow

```
Client → POST /api/auth/google-exchange { code, redirect_uri }
       ← { id_token }
Client → Supabase signInWithIdToken(id_token)
       → POST /api/auth/validate
       ← { ok: true } or { redirect: '/onboarding' }
```

- 이메일 도메인 제한: `ALLOWED_EMAIL_DOMAIN` 환경변수
- 첫 로그인 시 자동 사용자 생성 (MEMBER 역할)
- `INITIAL_ADMIN_EMAIL`에 해당하는 사용자는 ADMIN 역할 부여

### RBAC (역할 기반 접근 제어)

| 역할 | 권한 |
|------|------|
| **MEMBER** | 본인 비용 CRUD, 제출, 취소 |
| **ADMIN** | 전체 비용 조회, 승인/반려, 사용자/부서 관리, 리포트, CSV 내보내기 |

### CSRF 보호

모든 변경 요청(POST/PATCH/DELETE)은 `Origin` 헤더가 `NEXT_PUBLIC_APP_URL`과 일치해야 함.

---

## 2. DB 스키마

### users

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid (PK) | Supabase Auth uid |
| email | varchar(255), unique | 회사 도메인 이메일 |
| name | varchar(100) | 이름 |
| role | MEMBER \| ADMIN | 역할 |
| department | varchar(100), nullable | 부서 |
| profileImageUrl | text, nullable | 프로필 이미지 |
| cardLastFour | char(4), nullable | 법인카드 끝 4자리 |
| onboardingCompleted | boolean | 온보딩 완료 여부 |
| isActive | boolean | 활성 상태 |
| createdAt, updatedAt | timestamp | |

### expenses

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid (PK) | |
| type | CORPORATE_CARD \| DEPOSIT_REQUEST | 비용 유형 |
| status | SUBMITTED \| APPROVED \| REJECTED \| CANCELLED | 상태 |
| title | varchar(200) | 제목 |
| description | text, nullable | 설명 |
| amount | integer | 금액 (원 단위, >0) |
| category | varchar(100) | 카테고리 |
| transactionDate | date | 거래일 (YYYY-MM-DD) |
| merchantName | varchar(200), nullable | 가맹점명 (법카사용) |
| cardLastFour | char(4), nullable | 카드 끝 4자리 |
| bankName | varchar(100), nullable | 은행명 (입금요청) |
| accountHolder | varchar(100), nullable | 예금주 |
| accountNumber | varchar(50), nullable | 계좌번호 |
| isUrgent | boolean | 긴급 여부 |
| isPrePaid | boolean | 선지급 여부 |
| prePaidPercentage | integer(1-100), nullable | 선지급 비율 |
| remainingPaymentRequested | boolean | 후지급 요청 여부 |
| remainingPaymentApproved | boolean | 후지급 승인 여부 |
| rejectionReason | text, nullable | 반려 사유 |
| submittedById | uuid (FK → users) | 제출자 |
| approvedById | uuid (FK → users), nullable | 승인자 |
| approvedAt | timestamp, nullable | 승인 시각 |
| createdAt, updatedAt | timestamp | |

**인덱스:** `(submittedById, status)`, `(type, status, createdAt)`, `(transactionDate)`

### attachments

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid (PK) | |
| expenseId | uuid (FK → expenses, cascade) | |
| documentType | varchar(100) | ESTIMATE, BANK_COPY, ID_CARD, BIZ_LICENSE, RECEIPT, OTHER |
| fileName, fileKey, fileUrl | text | 파일 정보 |
| fileSize | integer | 바이트 단위 |
| mimeType | varchar(100) | |
| uploadedById | uuid (FK → users) | |
| createdAt | timestamp | |

**제한:** 파일당 10MB, 비용당 50MB. 허용 타입: JPEG, PNG, WebP, PDF.

### notifications

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid (PK) | |
| recipientId | uuid (FK → users, cascade) | |
| type | varchar | DEPOSIT_APPROVED, DEPOSIT_REJECTED, NEW_DEPOSIT_REQUEST, REMAINING_PAYMENT_REQUEST, REMAINING_PAYMENT_APPROVED, NEW_USER_JOINED |
| title, message | text | |
| relatedExpenseId | uuid (FK → expenses, set null), nullable | |
| isRead | boolean | |
| readAt | timestamp, nullable | |
| createdAt | timestamp | |

### departments

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid (PK) | |
| name | varchar(100), unique | 부서명 |
| sortOrder | integer | 정렬 순서 |
| createdAt | timestamp | |

### push_subscriptions

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid (PK) | |
| userId | uuid (FK → users, cascade) | |
| endpoint | text | Web Push endpoint |
| p256dh, auth | text | 암호화 키 |
| createdAt | timestamp | |

---

## 3. 비즈니스 로직

### 법카사용 (CORPORATE_CARD)

```
제출 → 즉시 APPROVED (승인 불필요)
```
- 제출 시 자동 승인 (approvedAt = now)
- Slack + Web Push로 전체 ADMIN에게 알림
- 파일 첨부 선택

### 입금요청 (DEPOSIT_REQUEST)

```
제출(SUBMITTED) → 관리자 승인(APPROVED) or 반려(REJECTED)
```
- 파일 첨부 필수 (최소 1개, documentType 라벨 필수)
- 승인/반려 시 제출자에게 인앱 알림 + Web Push
- 새 입금요청 시 전체 ADMIN에게 알림

### 선지급/후지급 (Prepaid)

```
입금요청(isPrePaid=true, 50%) → 승인 → 후지급 요청 → 후지급 승인
```
- `prePaidPercentage`: 선지급 비율 (1-100%)
- 잔금 = `amount - (amount * prePaidPercentage / 100)`
- `remainingPaymentRequested` → `remainingPaymentApproved` 플로우

### 경쟁 상태 방지 (TOCTOU)

모든 상태 변경 쿼리에 WHERE 절로 현재 상태 검증:
- 승인: `WHERE status='SUBMITTED'`
- 후지급 요청: `WHERE status='APPROVED' AND remainingPaymentRequested=false`

---

## 4. API 명세

### 비용 (Expenses)

| Method | Endpoint | Auth | 설명 |
|--------|----------|------|------|
| GET | `/api/expenses` | Required | 목록 (페이징, 필터, 정렬) |
| POST | `/api/expenses` | Required | 생성 |
| GET | `/api/expenses/[id]` | Required | 상세 (첨부파일 포함) |
| PATCH | `/api/expenses/[id]` | Required | 수정 |
| DELETE | `/api/expenses/[id]` | Required | 삭제 |
| POST | `/api/expenses/[id]/approve` | ADMIN | 승인 |
| POST | `/api/expenses/[id]/reject` | ADMIN | 반려 (`{ rejectionReason }`) |
| POST | `/api/expenses/[id]/cancel` | Required | 취소 (본인만) |
| POST | `/api/expenses/[id]/request-remaining` | Required | 후지급 요청 |
| POST | `/api/expenses/[id]/approve-remaining` | ADMIN | 후지급 승인 |
| POST | `/api/expenses/bulk-action` | ADMIN | 일괄 승인/반려 |

#### GET /api/expenses 쿼리 파라미터

| 파라미터 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| page | integer | 1 | 페이지 |
| limit | integer | 20 (max 100) | 페이지당 건수 |
| type | string | - | CORPORATE_CARD \| DEPOSIT_REQUEST |
| status | string | - | SUBMITTED \| APPROVED \| REJECTED \| CANCELLED |
| category | string | - | 카테고리명 |
| startDate | YYYY-MM-DD | - | 시작일 |
| endDate | YYYY-MM-DD | - | 종료일 |
| search | string | - | 제목/가맹점명 검색 |
| sortBy | string | createdAt | createdAt \| amount \| status |
| sortOrder | string | desc | asc \| desc |

#### POST /api/expenses 요청 본문

```json
// 법카사용
{
  "type": "CORPORATE_CARD",
  "title": "사무용품 구매",
  "amount": 50000,
  "category": "ODD",
  "transactionDate": "2026-03-28",
  "merchantName": "쿠팡",
  "isUrgent": false,
  "description": "선택"
}

// 입금요청
{
  "type": "DEPOSIT_REQUEST",
  "title": "외주비 지급",
  "amount": 1000000,
  "category": "기타",
  "transactionDate": "2026-03-28",
  "bankName": "국민은행",
  "accountHolder": "홍길동",
  "accountNumber": "123-456-789",
  "isUrgent": false,
  "isPrePaid": true,
  "prePaidPercentage": 50
}
```

#### POST /api/expenses/bulk-action

```json
// 요청
{
  "action": "approve",
  "expenseIds": ["uuid1", "uuid2"]
}
// 또는
{
  "action": "reject",
  "expenseIds": ["uuid1"],
  "rejectionReason": "사유"
}

// 응답
{
  "data": { "success": 2, "failed": 0, "errors": [] }
}
```

### 첨부파일 (Attachments)

| Method | Endpoint | Auth | 설명 |
|--------|----------|------|------|
| POST | `/api/attachments/upload` | Required | 업로드 (multipart/form-data) |
| GET | `/api/attachments/[id]/download` | Required | 다운로드 (signed URL 302) |
| DELETE | `/api/attachments/[id]` | Required | 삭제 (본인만) |

### 알림 (Notifications)

| Method | Endpoint | Auth | 설명 |
|--------|----------|------|------|
| GET | `/api/notifications` | Required | 목록 (page, limit) |
| GET | `/api/notifications/unread-count` | Required | 미읽은 건수 |
| PATCH | `/api/notifications/[id]/read` | Required | 읽음 처리 |
| PATCH | `/api/notifications/mark-all-read` | Required | 전체 읽음 |

### 프로필

| Method | Endpoint | Auth | 설명 |
|--------|----------|------|------|
| PATCH | `/api/profile` | Required | 프로필 수정 |
| POST | `/api/onboarding` | Required | 온보딩 완료 |

### 관리자 (Admin)

| Method | Endpoint | Auth | 설명 |
|--------|----------|------|------|
| GET | `/api/admin/dashboard?period=` | ADMIN | 대시보드 통계 |
| GET | `/api/admin/reports/department` | ADMIN | 부서별 리포트 |
| PATCH | `/api/admin/users` | ADMIN | 역할/활성 변경 |
| DELETE | `/api/admin/users` | ADMIN | 사용자 삭제 (cascade) |
| GET | `/api/export/csv` | ADMIN | CSV 내보내기 |

### 부서 (Departments)

| Method | Endpoint | Auth | 설명 |
|--------|----------|------|------|
| GET | `/api/departments` | Required | 목록 |
| POST | `/api/departments` | ADMIN | 생성 |
| PATCH | `/api/departments` | ADMIN | 수정 |
| DELETE | `/api/departments` | ADMIN | 삭제 |

### Push / Auth

| Method | Endpoint | Auth | 설명 |
|--------|----------|------|------|
| POST | `/api/push/subscribe` | Required | Web Push 구독 |
| DELETE | `/api/push/subscribe` | Required | 구독 해제 |
| POST | `/api/auth/google-exchange` | None | Google 토큰 교환 |
| POST | `/api/auth/validate` | None | 사용자 검증/생성 |

---

## 5. 응답 형식

### 성공

```json
{
  "data": { ... }
}
// 목록의 경우
{
  "data": [...],
  "meta": { "page": 1, "limit": 20, "total": 50, "totalPages": 3 }
}
```

### 에러

```json
{
  "error": {
    "code": "VALIDATION_ERROR | UNAUTHORIZED | FORBIDDEN | NOT_FOUND | INTERNAL_ERROR",
    "message": "한국어 에러 메시지"
  }
}
```

| HTTP | code | 설명 |
|------|------|------|
| 400 | VALIDATION_ERROR | 입력값 검증 실패 |
| 401 | UNAUTHORIZED | 인증 필요 |
| 403 | FORBIDDEN | 권한 부족 / CSRF 실패 |
| 404 | NOT_FOUND | 리소스 없음 |
| 500 | INTERNAL_ERROR | 서버 오류 |

---

## 6. 환경변수

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=

# Google SSO
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# App
NEXT_PUBLIC_APP_URL=
ALLOWED_EMAIL_DOMAIN=
INITIAL_ADMIN_EMAIL=

# Web Push (VAPID)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=

# Optional
SLACK_WEBHOOK_URL=
RESEND_API_KEY=
```

---

## 7. 연동 시 참고사항

### 외부 시스템에서 ExpenseOne 데이터 조회

ADMIN 계정의 세션 토큰으로 `GET /api/expenses` 호출. 필터(기간/상태/유형)로 필요한 데이터만 가져올 수 있음.

### ExpenseOne에서 외부 시스템으로 데이터 전송

승인 완료 시 webhook 호출 패턴 권장:
1. `approveExpense` 서비스 함수에 webhook 호출 추가
2. 또는 Supabase Realtime으로 expenses 테이블 변경 감지

### CSV 내보내기

`GET /api/export/csv` — 관리자 권한으로 전체 비용 데이터를 CSV로 내보내기 가능. UTF-8 BOM 포함으로 Excel 한국어 호환.

### Supabase 직접 접근

`SUPABASE_SERVICE_ROLE_KEY`로 RLS를 우회하여 직접 DB 접근 가능. 연동 시스템이 서버 사이드에서 실행되는 경우 권장.
