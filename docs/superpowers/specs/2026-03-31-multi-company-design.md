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
| 회사 추가 | 관리자가 관리 페이지에서 추가/편집 | 향후 회사 확장 가능성 |
| ADMIN 권한 | 전체 회사 관리 + 회사별 필터 | 역할 체계 2단계 유지 (MEMBER/ADMIN) |
| 회사별 분리 항목 | Slack 채널, 부서, 법인카드 | 운영 실정에 맞춤 |

## Data Model Changes

### New Table: `companies`

```
companies
├── id (UUID, PK)
├── name (varchar 100, NOT NULL, UNIQUE)
├── slug (varchar 50, NOT NULL, UNIQUE) — URL/필터용
├── slack_channel_id (varchar 50, nullable) — 회사별 Slack 채널
├── slack_bot_token (text, nullable) — 회사별 봇 토큰 (같은 워크스페이스면 공유 가능)
├── sort_order (integer, default 0)
├── is_active (boolean, default true)
└── created_at (timestamp, NOT NULL)
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
- `UNIQUE(name)` → `UNIQUE(name, company_id)` 로 변경 (같은 이름 부서가 다른 회사에 존재 가능)

## Feature Changes

### 1. 비용 제출 폼 (법카사용 + 입금요청)

- 폼 상단에 **회사 세그먼트 컨트롤** 추가
- 사용자의 소속 회사(`users.company_id`)가 기본값으로 선택
- 탭 한 번으로 다른 회사로 전환 가능
- 소속과 다른 회사 선택 시 주의 안내 표시 (주황색)
- 회사 변경 시 부서 목록도 해당 회사의 부서로 갱신
- `expenses.company_id`에 선택된 회사 ID 저장

### 2. Slack 라우팅

- 기존: 단일 `SLACK_CHANNEL_ID` 환경변수
- 변경: `companies.slack_channel_id`에서 동적 조회
- `slack.service.ts`의 `sendSlackMessage(text)` → `sendSlackMessage(text, companyId)`
- 회사에 slack_channel_id가 없으면 해당 회사 Slack 알림 스킵 (silent)
- `slack_bot_token`은 같은 워크스페이스면 하나로 공유 (companies 테이블에 null이면 환경변수 폴백)

### 3. 관리 대시보드

- 비용 관리, 승인 대기, 리포트 페이지에 **회사 필터 탭** 추가: 전체 / 코리아 / 리테일
- 비용 목록에 회사 라벨(컬러 배지) 표시
- 필터는 URL 쿼리파라미터로 유지 (`?company=korea`)

### 4. 회사 관리 페이지 (신규)

- `/admin/companies` 경로
- 회사 목록 CRUD (이름, Slack 채널 ID, 정렬순서, 활성/비활성)
- 사이드바 관리 메뉴에 "회사" 항목 추가

### 5. 부서 관리

- 부서가 회사에 종속됨
- 부서 목록 페이지에 회사 필터 추가
- 부서 추가/편집 시 회사 선택 필수
- 제출 폼에서 회사 변경 시 부서 드롭다운이 해당 회사 부서로 갱신

### 6. 사용자 프로필 / 설정

- 설정 페이지에 **소속 회사** 세그먼트 컨트롤 추가
- 사용자 관리 페이지에 회사 컬럼 추가

### 7. 온보딩

- 최초 가입 온보딩 플로우에 소속 회사 선택 단계 추가
- 회사 미선택 시 온보딩 완료 불가

## Migration Strategy

1. `companies` 테이블 생성 + 시드 (코리아, 리테일)
2. `users`, `expenses`, `departments`에 `company_id` 컬럼 추가 (nullable로 시작)
3. 기존 데이터 마이그레이션: 모든 기존 레코드를 한아원코리아로 설정
4. `expenses.company_id`를 NOT NULL로 변경
5. `departments` UNIQUE 제약조건 변경

## Environment Variable Changes

- `SLACK_CHANNEL_ID` — 폴백용으로 유지 (companies에 없는 경우)
- `SLACK_BOT_TOKEN` — 폴백용으로 유지
- 새 환경변수 불필요 (모두 DB에서 관리)

## API Changes

- `POST /api/expenses` — body에 `companyId` 필드 추가 (필수)
- `GET /api/expenses` — `company` 쿼리파라미터 추가 (선택)
- `GET /api/departments` — `companyId` 쿼리파라미터 추가
- `POST /api/companies` — 회사 생성 (ADMIN)
- `PATCH /api/companies/:id` — 회사 수정 (ADMIN)
- `GET /api/companies` — 회사 목록

## Out of Scope

- 회사별 ADMIN 분리 (SUPER_ADMIN 역할) — 현재 ADMIN은 전체 접근
- 회사별 카테고리 분리 — 카테고리는 전체 공유
- 회사 삭제 — 비활성화만 지원
- 멀티 Slack 워크스페이스 — 같은 워크스페이스 전제
