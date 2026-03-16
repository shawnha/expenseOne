# ExpenseOne 성능 최적화 구현 계획

## 분석 요약

**현재 상태**: 프로덕션 운영 중 (expenseone.vercel.app), 10~50명 사용
**목표**: 사용자 체감 성능 2~4초 개선, 서버 리소스 효율화
**기술 스택**: Next.js 14 (App Router), Supabase, Drizzle ORM, Vercel

---

## 우선순위 결정 기준

| 기준 | 가중치 |
|------|--------|
| 사용자 체감 개선 폭 | 40% |
| 구현 소요 시간 (짧을수록 높음) | 25% |
| 회귀 버그 위험 (낮을수록 높음) | 20% |
| 다른 작업과의 의존성 | 15% |

---

## Phase 1: 즉시 체감 가능한 저위험 변경 (예상 1~2시간, 체감 개선 1.5~2.5초)

### [ ] Step 1: Dashboard 6개 순차 쿼리를 Promise.all로 병렬화
**원본 이슈**: P0-1
**파일**: `src/app/(dashboard)/page.tsx`
**현재 문제**: getDashboardData()에서 6개 Supabase 쿼리가 순차 실행 (await 5개 연속, line 80~132)
**수정 내용**:
- userProfile 조회 이후의 5개 쿼리(totalApproved, submittedCount, pendingCount, approvedCount, recentExpenses)를 Promise.all로 묶기
- userRole 조회는 먼저 실행해야 함 (pendingCount 쿼리 조건이 role에 의존)
- 따라서: getUser() -> userProfile(role) -> Promise.all([나머지 5개])

**예상 개선**: 각 쿼리 100~200ms라면 5개 순차 = 500~1000ms -> 병렬 = 100~200ms (약 400~800ms 절약)
**위험도**: 매우 낮음 (쿼리 내용 변경 없음, 실행 순서만 변경)
**수용 기준**:
- 대시보드 데이터가 동일하게 표시됨
- 개발자 도구에서 서버 응답 시간 단축 확인

### [ ] Step 2: 스플래시 화면 1800ms를 500ms로 단축
**원본 이슈**: P0-3
**파일**: `src/components/layout/plug-splash.tsx`
**현재 문제**: connecting 모드의 duration이 1800ms (line 16), exit까지 2200ms 소요
**수정 내용**:
- connecting duration: 1800 -> 500
- exit transition: duration + 400 -> duration + 200
- 총 시간: 2200ms -> 700ms (1500ms 절약)

**예상 개선**: 1.5초 직접 절약 (로그인 후 첫 화면)
**위험도**: 매우 낮음 (시각적 효과만 변경, 로직 없음)
**수용 기준**:
- 스플래시 애니메이션이 자연스럽게 보임
- 로그인 후 대시보드까지 체감 시간 단축

### [ ] Step 3: attachments 테이블에 expenseId 인덱스 추가
**원본 이슈**: P0-5
**파일**: `src/lib/db/schema.ts`
**현재 문제**: attachments 테이블에 expense_id 외래키는 있으나 인덱스 없음 (line 137~154)
**수정 내용**:
```typescript
// attachments 테이블 정의에 인덱스 추가
(table) => [
  index("idx_attachments_expense_id").on(table.expenseId),
  index("idx_attachments_uploaded_by_id").on(table.uploadedById),  // P1-13도 함께
]
```
- P1-13 (uploadedById 인덱스)도 함께 추가 (같은 테이블, 같은 마이그레이션)

**예상 개선**: 비용 상세 페이지 첨부파일 조회 속도 향상 (데이터 증가 시 효과 커짐)
**위험도**: 매우 낮음 (인덱스 추가는 기존 기능에 영향 없음)
**의존성**: `npx drizzle-kit push` 또는 `npx drizzle-kit generate` 실행 필요
**수용 기준**:
- 마이그레이션 성공
- 비용 상세 페이지 정상 동작

**Phase 1을 먼저 하는 이유**:
> 세 가지 모두 회귀 위험이 거의 0이고, 수정 범위가 작으며, 합산 체감 개선이 2초 이상이다. 프로덕션 앱에서 가장 안전하면서 효과가 큰 변경이다.

---

## Phase 2: Layout 레벨 인증 최적화 (예상 1~1.5시간, 체감 개선 0.5~1초)

### [ ] Step 4: Layout의 중복 Auth 호출을 React cache()로 제거
**원본 이슈**: P0-2
**파일**: `src/lib/supabase/server.ts` (또는 새 파일 `src/lib/auth-cache.ts`)
**현재 문제**:
- layout.tsx에서 getUser() 호출 (line 58)
- 각 page.tsx에서도 getUser() 재호출 (dashboard/page.tsx line 43)
- 요청당 3~4회 중복 인증 호출

**수정 내용**:
```typescript
// src/lib/auth-cache.ts
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

export const getUserProfile = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("users").select("*").eq("id", userId).single();
  return data;
});
```
- layout.tsx와 page.tsx 모두 이 cached 함수를 사용하도록 변경

**예상 개선**: 요청당 인증 호출 3~4회 -> 1회 (200~400ms 절약)
**위험도**: 중간 (인증 로직 변경이므로 모든 페이지에서 테스트 필요)
**의존성**: 없음 (독립적으로 수행 가능)
**수용 기준**:
- 모든 보호 페이지에서 인증 정상 동작
- 미인증 사용자 리다이렉트 정상 동작
- 서버 로그에서 중복 auth 호출 제거 확인

**Phase 2를 두 번째로 하는 이유**:
> 인증 최적화는 모든 페이지에 영향을 미치므로 Phase 1의 안전한 변경을 먼저 배포한 뒤 진행하는 것이 안전하다. 효과는 크지만 회귀 테스트 범위가 넓다.

---

## Phase 3: Admin 페이지 Server Component 전환 + Streaming (예상 2~3시간, 체감 개선 0.5~1.5초)

### [ ] Step 5: next.config.ts 최적화 설정 추가
**원본 이슈**: P1-12
**파일**: `next.config.ts`
**현재 문제**: 빈 설정 파일 (최적화 옵션 없음)
**수정 내용**:
```typescript
const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-icons"],
  },
};
```

**위험도**: 낮음
**수용 기준**: 빌드 성공, 기존 기능 정상

### [ ] Step 6: Admin Dashboard를 하이브리드 SSR + CSR로 전환
**원본 이슈**: P0-4 (admin/page.tsx)
**파일**: `src/app/(dashboard)/admin/page.tsx`
**현재 문제**: 전체 "use client" (line 1), 초기 로딩 시 빈 화면 + API fetch
**수정 방법**:
- Server Component로 전환하여 초기 데이터를 서버에서 fetch
- 기간 필터 Select만 Client Component로 분리
- 차트 컴포넌트는 Client Component로 유지하되 Suspense로 감싸기

**구조**:
```
admin/page.tsx (Server) -- 초기 데이터 fetch, statCards 렌더
  -> AdminDashboardClient (Client) -- 기간 필터, 차트 인터랙션
```

**예상 개선**: FCP 0.5~1초 단축 (서버 렌더링으로 초기 콘텐츠 즉시 표시)
**위험도**: 중간 (기존 동작 보존 주의 필요)
**수용 기준**:
- 초기 로딩 시 통계 카드가 즉시 표시됨
- 기간 필터 변경 시 데이터 정상 갱신
- 차트가 정상 렌더링됨

### [ ] Step 7: loading.tsx 추가 (Streaming/Suspense)
**원본 이슈**: P1-9
**파일**: 여러 위치에 loading.tsx 생성
**현재 문제**: loading.tsx가 0개 (전체 앱에서 스트리밍 없음)
**수정 내용**:
- `src/app/(dashboard)/loading.tsx` -- 대시보드 메인 로딩
- `src/app/(dashboard)/expenses/loading.tsx` -- 비용 목록 로딩
- `src/app/(dashboard)/admin/loading.tsx` -- 관리자 로딩
- `src/app/(dashboard)/notifications/loading.tsx` -- 알림 로딩

각 loading.tsx에 스켈레톤 UI 배치

**예상 개선**: 페이지 전환 시 즉각적인 피드백 (체감 속도 향상)
**위험도**: 매우 낮음 (추가 파일, 기존 코드 변경 없음)
**수용 기준**:
- 페이지 전환 시 스켈레톤 UI가 표시됨
- 데이터 로드 완료 후 실제 콘텐츠로 교체됨

### [ ] Step 8: Notifications 페이지를 Server Component로 전환
**원본 이슈**: P0-4 (notifications/page.tsx)
**파일**: `src/app/(dashboard)/notifications/page.tsx`
**현재 문제**: "use client" 전체 클라이언트 렌더링
**수정 내용**:
- 초기 알림 목록을 서버에서 fetch
- "모두 읽음" 버튼 등 인터랙션만 Client Component로 분리

**예상 개선**: FCP 0.3~0.5초 단축
**위험도**: 중간
**수용 기준**: 알림 목록 정상 표시, 읽음 처리 정상 동작

**Phase 3을 세 번째로 하는 이유**:
> Server Component 전환은 가장 큰 아키텍처 변경이다. Phase 1~2의 안전한 최적화로 이미 2~3초 개선을 확보한 뒤, 이 단계에서 추가 개선을 진행한다. Step 5(config)와 Step 7(loading.tsx)은 위험이 낮으므로 먼저 처리하고, Step 6/8의 큰 전환을 이어서 진행한다.

---

## Phase 4: API 및 데이터 최적화 (예상 1.5~2시간)

### [ ] Step 9: Admin Dashboard 4개 COUNT 쿼리를 단일 SQL로 통합
**원본 이슈**: P1-7
**파일**: `src/app/api/admin/dashboard/route.ts`
**현재 문제**: Promise.all로 4개 별도 쿼리 실행 (line 52~74) -- 이미 병렬이지만 4개 DB 커넥션 사용
**수정 내용**:
```sql
SELECT
  SUM(amount) as total,
  COUNT(*) FILTER (WHERE status = 'SUBMITTED') as pending,
  COUNT(*) FILTER (WHERE status = 'APPROVED') as approved,
  COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected
FROM expenses
WHERE created_at BETWEEN $1 AND $2
```
- 4개 쿼리 -> 1개 쿼리로 통합 (DB 커넥션 75% 절약)

**위험도**: 낮음 (결과 동일, SQL만 변경)
**수용 기준**: 관리자 대시보드 통계가 동일하게 표시됨

### [ ] Step 10: CSV Export에 LIMIT 추가 (OOM 방지)
**원본 이슈**: P1-11
**파일**: `src/app/api/export/csv/route.ts`
**현재 문제**: 전체 데이터 무제한 조회 (line 77~86), 데이터 증가 시 OOM 위험
**수정 내용**:
- .limit(10000) 추가 (최대 10,000건)
- 응답 헤더에 X-Total-Count 추가하여 초과 시 알림
- 또는 스트리밍 CSV 생성으로 변경 (ReadableStream)

**위험도**: 낮음 (제한 추가만)
**수용 기준**:
- 10,000건 이하 정상 동작
- 초과 시 적절한 안내

### [ ] Step 11: Expense Detail 페이지 순차 쿼리 최적화
**원본 이슈**: P1-10
**파일**: `src/app/(dashboard)/expenses/[id]/page.tsx`
**현재 상태**: getUser() -> userProfile 조회 -> expense 조회 -> Promise.all([submitter, attachments])
**수정 내용**: 이미 부분적으로 최적화됨 (line 172). Step 4의 cache()를 적용하면 추가 개선 가능.

**위험도**: 낮음
**의존성**: Step 4 (auth cache) 먼저 적용 시 효과 극대화

**Phase 4를 네 번째로 하는 이유**:
> API 최적화는 서버 사이드만 영향받아 위험이 낮지만, 사용자 체감 개선이 Phase 1~3보다 작다. Admin 대시보드의 경우 Step 6에서 SSR 전환 후 이 단계에서 쿼리 통합까지 하면 효과가 배가된다.

---

## Phase 5: 번들 최적화 및 캐싱 (예상 1~1.5시간)

### [ ] Step 12: Header 컴포넌트에서 매 렌더 Supabase 클라이언트 생성 방지
**원본 이슈**: P2-16
**파일**: `src/components/layout/header.tsx`
**현재 문제**: `const supabase = createClient();` 가 컴포넌트 본문에서 매번 호출 (line 31)
**수정 내용**: useMemo 또는 모듈 레벨 싱글턴으로 변경

**위험도**: 낮음
**수용 기준**: 로그아웃 등 인증 관련 기능 정상 동작

### [ ] Step 13: 사용하지 않는 import/font 정리
**원본 이슈**: P2-18 (미사용 font-weight 300), P2-19 (PageTransition)
**파일**: layout.tsx, 관련 CSS
**현재 문제**:
- layout.tsx에서 PageTransition import (line 5) -- BYPASS_AUTH 경로에서만 사용
- 불필요한 font-weight 300 로드

**수정 내용**:
- PageTransition이 실제로 필요한지 확인, 불필요 시 dynamic import
- font-weight 300 제거

**위험도**: 매우 낮음
**수용 기준**: 번들 사이즈 감소 확인

### [ ] Step 14: API 응답에 Cache-Control 헤더 추가
**원본 이슈**: P2-15
**파일**: 주요 GET API routes
**수정 내용**:
- 변경 빈도 낮은 데이터: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`
- 사용자별 데이터: `Cache-Control: private, max-age=30`
- CSV export: `Cache-Control: no-store` (이미 적절)

**위험도**: 중간 (캐시 무효화 이슈 가능)
**수용 기준**: 데이터 갱신이 적절한 시간 내에 반영됨

### [ ] Step 15: 파일 업로드 병렬화
**원본 이슈**: P2-14
**파일**: 파일 업로드 관련 API route
**수정 내용**: 여러 파일 업로드 시 순차 -> Promise.all로 변경

**위험도**: 낮음 (Supabase Storage 동시 요청 허용)
**수용 기준**: 다중 파일 첨부 정상 동작, 업로드 시간 단축

**Phase 5를 마지막으로 하는 이유**:
> 번들 최적화와 캐싱은 "있으면 좋은" 수준의 개선이다. 프로덕션 안정성이 확보된 후 점진적으로 적용해도 된다.

---

## 구현 순서 요약 및 근거

| 순서 | Step | 이슈 | 예상 개선 | 소요 시간 | 위험도 |
|------|------|------|----------|----------|--------|
| 1 | Dashboard Promise.all | P0-1 | 400~800ms | 20분 | 매우 낮음 |
| 2 | 스플래시 500ms로 단축 | P0-3 | 1,500ms | 10분 | 매우 낮음 |
| 3 | DB 인덱스 추가 (2개) | P0-5, P1-13 | 가변 | 15분 | 매우 낮음 |
| 4 | Auth cache() | P0-2 | 200~400ms | 45분 | 중간 |
| 5 | next.config 최적화 | P1-12 | 번들 감소 | 10분 | 낮음 |
| 6 | Admin SSR 전환 | P0-4 | 500~1000ms | 60분 | 중간 |
| 7 | loading.tsx 추가 | P1-9 | 체감 속도 | 30분 | 매우 낮음 |
| 8 | Notifications SSR | P0-4 | 300~500ms | 45분 | 중간 |
| 9 | Admin SQL 통합 | P1-7 | DB 효율화 | 30분 | 낮음 |
| 10 | CSV LIMIT | P1-11 | OOM 방지 | 15분 | 낮음 |
| 11 | Detail 쿼리 최적화 | P1-10 | 100~200ms | 15분 | 낮음 |
| 12 | Header 클라이언트 | P2-16 | 미미 | 10분 | 낮음 |
| 13 | 미사용 import 정리 | P2-18,19 | 번들 감소 | 15분 | 매우 낮음 |
| 14 | Cache-Control | P2-15 | 재방문 속도 | 30분 | 중간 |
| 15 | 파일 업로드 병렬화 | P2-14 | 업로드 속도 | 20분 | 낮음 |

**핵심 원칙**:
1. Step 1~3은 "수정 1줄로 1초 벌기" -- 즉시 배포 가능
2. Step 4는 모든 페이지에 영향 -- 단독 배포 후 모니터링
3. Step 5~8은 아키텍처 변경 -- 충분한 테스트 후 배포
4. Step 9~15는 점진적 개선 -- 여유 있을 때 진행

---

## 제외/연기 항목

| 이슈 | 사유 |
|------|------|
| P0-6 (N+1 notification batch insert) | request-remaining route 파일이 존재하지 않음. 해당 기능 확인 후 진행 |
| P1-8 (next/dynamic code splitting) | Step 6/8의 SSR 전환에서 자연스럽게 해결될 부분이 많음 |
| P2-17 (DB connection timeout) | Supabase 관리형이므로 우선순위 낮음 |

---

## 배포 전략

1. **Phase 1 (Step 1~3)**: 즉시 배포 가능. 하나의 PR로 묶어도 됨.
2. **Phase 2 (Step 4)**: 단독 PR. 배포 후 24시간 모니터링.
3. **Phase 3 (Step 5~8)**: Step 5+7은 한 PR, Step 6+8은 각각 별도 PR.
4. **Phase 4~5**: 각 Step별로 개별 PR 또는 Phase별 묶음.

## QA 체크리스트
- [ ] 대시보드 통계 정확성 확인
- [ ] 로그인 -> 대시보드 전체 흐름 테스트
- [ ] Admin 대시보드 기간 필터 동작 확인
- [ ] 알림 목록/읽음 처리 동작 확인
- [ ] 비용 제출 -> 상세 -> 첨부파일 전체 흐름 테스트
- [ ] CSV Export 동작 확인
- [ ] 모바일 반응형 확인
- [ ] `./qa-playwright-capture.sh http://localhost:8000 public/qa-screenshots` (해당 시)
