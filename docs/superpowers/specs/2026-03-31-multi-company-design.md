# Multi-Company Support Design Spec

## Overview

ExpenseOne에 멀티 회사 지원을 추가한다. 한아원코리아와 한아원리테일이 하나의 ExpenseOne 인스턴스를 공유하되, 비용 데이터와 Slack 알림은 회사별로 분리한다.

## Problem

- 현재 단일 테넌트 구조: 모든 비용이 하나의 Slack 채널로 전송
- 한아원코리아 소속이 한아원리테일 비용을 올리기도 함
- 회사별 부서, 법인카드가 다름
- 관리자는 전체를 보되 회사별 필터링이 필요

## Design Decisions

| 결정 | 선택 | 이유 |
|------|------|------|
| 회사 구분 위치 | 비용 건별 (소속 기본값 + 오버라이드) | 한 사람이 두 회사 비용을 올리는 케이스 |
| 회사 추가 | /admin/settings 내 회사 섹션에서 편집 | 스코프 축소 — 전체 CRUD 페이지 불필요 |
| ADMIN 권한 | 전체 회사 관리 + 회사별 필터 | 역할 체계 2단계 유지 (MEMBER/ADMIN) |
| 회사별 분리 항목 | Slack 채널, 부서, 법인카드 | 운영 실정에 맞춤 |
| Slack 토큰 | 환경변수 유지 (DB 저장 안 함) | 같은 워크스페이스 + 보안 |
| 다른 회사 비용 UX | 주황 경고 대신 회사명 배지 + "(소속 외)" 텍스트 | 정상 업무에 경고는 과함 |

## Data Model Changes

### New Table: `companies`

```
companies
├── id (UUID, PK)
├── name (varchar 100, NOT NULL, UNIQUE)
├── slug (varchar 50, NOT NULL, UNIQUE) — URL/필터용
├── slack_channel_id (varchar 50, nullable) — 회사별 Slack 채널
├── sort_order (integer, default 0)
├── is_active (boolean, default true)
├── created_at (timestamp, NOT NULL)
└── updated_at (timestamp, NOT NULL)
```

초기 시드 데이터:
- `한아원코리아` (slug: `korea`, slack_channel_id: 기존 채널)
- `한아원리테일` (slug: `retail`, slack_channel_id: 리테일 채널)

### Modified Tables

**users**
- `+ company_id (UUID, FK → companies, nullable)` — 소속 회사. 온보딩 시 설정.

**expenses**
- `+ company_id (UUID, FK → companies, NOT NULL)` — 이 비용이 속한 회사. 제출 시 선택.

**departments**
- `+ company_id (UUID, FK → companies, NOT NULL)` — 회사별 부서 분리.
- `UNIQUE(name)` → `UNIQUE(name, company_id)` 로 변경

### New Indexes

- `expenses`: `(company_id, type, status, created_at)` 복합 인덱스
- `departments`: `(company_id)` 인덱스

## Feature Changes

### 1. 비용 제출 폼 (법카사용 + 입금요청)

- 폼 상단에 **회사 세그먼트 컨트롤** 추가
- 사용자의 소속 회사(`users.company_id`)가 기본값으로 선택
- 탭 한 번으로 다른 회사로 전환 가능
- 소속과 다른 회사 선택 시: 회사명 배지 강조 + "(소속 외)" 텍스트 (경고 아님)
- 회사 변경 시 부서 목록을 해당 회사 부서로 갱신 (기존 선택 초기화)
- 비활성 회사는 선택지에서 제외
- `expenses.company_id`에 선택된 회사 ID 저장

### 2. Slack 라우팅

변경 대상 함수 전체:
- `sendSlackMessage(text)` → `sendSlackMessage(text, companyId)` — 회사별 채널 조회
- `notifySlackCorporateCard(params)` — params에 `companyId` 추가
- `notifySlackApproved(params)` — params에 `companyId` 추가 (expense에서 가져옴)
- `notifyNewDepositRequest` — expense.company_id로 채널 라우팅

라우팅 로직:
1. `companyId`로 companies 테이블에서 `slack_channel_id` 조회
2. `slack_channel_id`가 있으면 해당 채널로 전송
3. 없으면 환경변수 `SLACK_CHANNEL_ID` 폴백
4. 둘 다 없으면 skip + 로그 기록
5. Slack 봇 토큰은 환경변수 `SLACK_BOT_TOKEN`만 사용 (DB 저장 안 함)

### 3. 관리 대시보드

- 비용 관리, 승인 대기, 리포트 페이지에 **회사 필터 탭** 추가: 전체 / 코리아 / 리테일
- 대시보드 집계 카드(총 지출, 승인 대기 등)도 회사 필터 적용
- 비용 목록에 회사 라벨(컬러 배지) 표시
- 필터는 URL 쿼리파라미터로 유지 (`?company=korea`)
- CSV 내보내기에 회사 컬럼 추가

### 4. 회사 관리 (설정 내 통합)

- `/admin/companies` 별도 페이지 대신 관리 설정 내 **회사 섹션**으로 통합
- 회사 이름, Slack 채널 ID 편집
- 활성/비활성 토글 (최소 1개 활성 보장)
- 회사 추가 기능 (간단한 폼)

### 5. 부서 관리

- 부서가 회사에 종속됨
- 부서 목록 페이지에 회사 필터 추가
- 부서 추가/편집 시 회사 선택 필수
- 제출 폼에서 회사 변경 시 부서 드롭다운 갱신 + 기존 선택 초기화

### 6. 사용자 프로필 / 설정

- 설정 페이지에 **소속 회사** 세그먼트 컨트롤 추가
- 사용자 관리 페이지에 회사 컬럼 추가

### 7. 온보딩 + 기존 유저 마이그레이션

- 최초 가입 온보딩 플로우에 소속 회사 선택 단계 추가
- 회사 미선택 시 온보딩 완료 불가
- **기존 유저**: 로그인 시 `company_id`가 null이면 소속 회사 선택 모달 표시 (원타임)

## Migration Strategy (4단계)

Zero-downtime 보장을 위한 순서:

**Phase 1 — DB Schema (서비스 가동 중)**
1. `companies` 테이블 생성 + 시드 (코리아, 리테일)
2. `users`, `expenses`, `departments`에 `company_id` 컬럼 추가 (nullable)
3. `departments` UNIQUE 제약조건 변경

**Phase 2 — App Code Deploy**
4. 앱 코드 배포: company_id를 항상 저장하도록 변경
5. 제출 폼에 회사 선택 UI 추가
6. 기존 유저 company 선택 모달 추가

**Phase 3 — Data Backfill**
7. 기존 데이터 backfill: `UPDATE expenses SET company_id = '<코리아ID>' WHERE company_id IS NULL`
8. 동일하게 users, departments backfill
9. `WHERE company_id IS NULL` 카운트 0 확인

**Phase 4 — Finalize**
10. `expenses.company_id` NOT NULL로 변경
11. `departments.company_id` NOT NULL로 변경
12. 인덱스 추가

**롤백 계획**: Phase 2 이전이면 컬럼 DROP으로 원복. Phase 2 이후면 company_id 폴백 로직이 있어 앱은 정상 동작.

## API Changes

- `POST /api/expenses` — body에 `companyId` 추가. 누락 시 `users.company_id` 폴백 (하위 호환)
- `GET /api/expenses` — `company` 쿼리파라미터 추가 (slug 기반, 선택)
- `GET /api/departments` — `companyId` 쿼리파라미터 추가
- `GET /api/companies` — 회사 목록 (활성만)
- `PATCH /api/companies/:id` — 회사 수정 (ADMIN)

### Zod Schema Changes

- `createExpenseSchema`: `+ companyId: z.string().uuid().optional()` (폴백 있으므로 optional)
- `expenseQuerySchema`: `+ company: z.string().optional()` (slug)
- 신규 `companySchema`: `name, slug, slackChannelId, sortOrder, isActive`

## Edge Case Policies

| 시나리오 | 정책 |
|---------|------|
| 비활성 회사로 비용 제출 | 400 차단. 폼에서 비활성 회사 선택 불가. |
| 비활성 회사의 기존 SUBMITTED 비용 | 승인/반려 계속 가능. 조회 가능. |
| 회사 0개 (모두 비활성) | 최소 1개 활성 보장 (비활성화 시 체크) |
| company_id NULL인 유저의 비용 제출 | users.company_id 폴백 실패 시 400. 회사 선택 모달로 유도. |
| 회사 변경 시 부서 불일치 | 부서 선택 초기화 + 해당 회사 부서로 갱신 |
| Slack 채널 ID 미설정/잘못된 값 | skip + console.warn 로그 |
| 사용자 총 비용 집계 | 회사 필터 없이 조회 시 전체 합산 (의도된 동작) |

## Out of Scope

- 회사별 ADMIN 분리 (SUPER_ADMIN 역할) — 현재 ADMIN은 전체 접근
- 회사별 카테고리 분리 — 카테고리는 전체 공유
- 회사 삭제 — 비활성화만 지원
- 멀티 Slack 워크스페이스 — 같은 워크스페이스 전제
- 벌크 회사 재분류 도구 — 초기 마이그레이션은 전체 코리아로 세팅, 관리자가 개별 수정
