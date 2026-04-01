# 리포트 기능 개선 — 설계 문서

## 개요

기존 `/admin/reports` 페이지를 종합 분석 허브로 대폭 개선한다. 별도 페이지를 추가하지 않고, 하나의 리포트 페이지에서 모든 비용 분석을 제공한다.

- **접근 권한**: ADMIN 전용 (현행 유지)
- **레이아웃**: 원페이지 스크롤 (탭 없음)
- **반응형**: 데스크톱 2열 그리드 → 모바일 1열 스택

## 페이지 구조 (위 → 아래)

### 1. 필터 바

기간 프리셋 pill + 드롭다운 필터 + CSV 다운로드 버튼.

**기간 프리셋 (pill 형태, rounded-full)**:
- 이번 달 (기본값)
- 지난 달
- 이번 분기
- 최근 3개월
- 최근 6개월
- 올해
- 직접 입력 (날짜 피커 2개: 시작~종료)

**드롭다운 필터**:
- 유형: 전체 / 법카사용 / 입금요청
- 회사: 전체 / 한아원코리아 / 한아원리테일
- 부서: 전체 / (departments 테이블에서 동적 로드)
- 카테고리: 전체 / (expenses에서 distinct category 동적 로드)

**CSV 다운로드**: 현재 필터 조건에 맞는 데이터를 CSV로 내보내기. 기존 `/api/export/csv` 활용.

**모바일**: 기간 프리셋만 표시. 나머지 필터는 "필터" 버튼 → 바텀시트. 활성 필터 개수 뱃지 표시.

### 2. 요약 카드 (기간 비교 포함)

4개 카드, 각각 전기간 대비 증감률 표시.

| 카드 | 값 | 비교 |
|------|-----|------|
| 총 비용 | 선택 기간 합계 (KRW 포맷) | ▲/▼ % vs 동일 길이 직전 기간 |
| 승인 건수 | APPROVED 상태 건수 | ▲/▼ % |
| 평균 금액 | 총 비용 / 건수 | ▲/▼ % |
| 법카:입금 비율 | 법카 비율 : 입금 비율 | 변동 있으면 표시 |

**기간 비교 로직**: "이번 달" 선택 시 → "지난 달"과 비교. "최근 3개월" 선택 시 → "그 전 3개월"과 비교. 동일 길이의 직전 기간.

**데스크톱**: 4열 그리드.
**모바일**: 2×2 그리드.

### 3. 월별 비용 추이 (라인차트)

- full-width, 선택 기간 내 월별 총 비용을 라인차트로 표시
- 그래디언트 영역 채우기 (Apple 스타일)
- 데이터 포인트 hover 시 금액 표시
- X축: 월 라벨, Y축: 금액
- 기존 커스텀 SVG 차트 스타일 유지 (외부 라이브러리 미사용)

### 4. 카테고리별 비중 (도넛차트)

- 2열 그리드 왼쪽
- 도넛차트 + 범례 (카테고리명 + 퍼센트)
- Apple 컬러 팔레트 (#007AFF, #34C759, #FF9500, #5856D6, #FF3B30, #5AC8FA)
- 중앙에 총 카테고리 수 또는 최대 카테고리명 표시
- **모바일**: full-width, 범례 가로→세로 전환

### 5. 법카 vs 입금요청 비율 (스택 바차트)

- 2열 그리드 오른쪽
- 월별 스택 바: 법카(#007AFF) + 입금(#FF9500)
- 각 바에 퍼센트 라벨
- 범례: 법카 / 입금요청
- **모바일**: full-width

### 6. 부서별 비용 (수평 바차트)

- 2열 그리드 왼쪽
- 부서명 + 금액 라벨 + 수평 프로그레스 바
- 금액 기준 내림차순 정렬
- 최대값 대비 비율로 바 너비 결정
- **모바일**: full-width

### 7. 회사별 비교

- 2열 그리드 오른쪽
- 한아원코리아 vs 한아원리테일
- 각 회사: 총 금액 + 건수
- 시각적 대비 (코리아=#007AFF, 리테일=#5856D6)
- **모바일**: full-width

### 8. Top 5 제출자

- full-width
- 가로 스크롤 아바타 리스트
- 각 제출자: 프로필 이미지(또는 이름 첫글자 아바타) + 이름 + 금액
- 금액 기준 Top 5
- 데스크톱/모바일 동일 레이아웃

## API 설계

기존 `/api/admin/dashboard` 엔드포인트를 확장하거나, 새 `/api/admin/reports/data` 엔드포인트를 만든다.

### GET /api/admin/reports/data

**Query Parameters**:
- `startDate`: ISO 날짜 (필수)
- `endDate`: ISO 날짜 (필수)
- `type`: CORPORATE_CARD | DEPOSIT_REQUEST (선택)
- `companyId`: UUID (선택)
- `department`: string (선택)
- `category`: string (선택)

**Response**:
```json
{
  "summary": {
    "totalAmount": 42350000,
    "approvedCount": 128,
    "averageAmount": 330859,
    "corporateCardRatio": 72,
    "depositRequestRatio": 28,
    "comparison": {
      "totalAmountChange": 12.0,
      "approvedCountChange": 8.0,
      "averageAmountChange": -5.0,
      "ratioChange": 0
    }
  },
  "monthlyTrend": [
    { "month": "2026-01", "amount": 5200000 },
    { "month": "2026-02", "amount": 6800000 }
  ],
  "categoryBreakdown": [
    { "category": "식비", "amount": 14000000, "percentage": 33, "count": 45 }
  ],
  "typeRatio": [
    { "month": "2026-01", "corporateCard": 65, "depositRequest": 35 }
  ],
  "departmentBreakdown": [
    { "department": "마케팅팀", "amount": 15200000, "count": 35 }
  ],
  "companyComparison": [
    { "companyId": "...", "name": "한아원코리아", "slug": "korea", "amount": 28200000, "count": 89 },
    { "companyId": "...", "name": "한아원리테일", "slug": "retail", "amount": 14150000, "count": 39 }
  ],
  "topSubmitters": [
    { "userId": "...", "name": "김민수", "profileImageUrl": null, "amount": 5200000, "count": 12 }
  ]
}
```

## 데이터 흐름

1. 페이지 로드 → 기본 필터(이번 달) + API 호출
2. 필터 변경 → URL search params 업데이트 + API 재호출
3. 서버 컴포넌트에서 필터 목록(부서, 카테고리) 프리패치
4. 클라이언트 컴포넌트에서 차트 렌더링 + 필터 상호작용

## 기존 코드 변경 범위

- **수정**: `src/app/(dashboard)/admin/reports/page.tsx` — 전면 재작성
- **신규**: `src/app/api/admin/reports/data/route.ts` — 리포트 전용 API
- **수정**: 사이드바/네비게이션 — 리포트 메뉴 아이콘/라벨 변경 불필요 (기존 유지)
- **기존 유지**: `/api/admin/dashboard` — 대시보드용 API는 그대로
- **기존 유지**: `/api/export/csv` — CSV 다운로드 기존 API 활용

## 차트 구현

외부 차트 라이브러리 미사용. 기존 프로젝트 패턴(커스텀 SVG)을 따른다.
- 라인차트: SVG path + gradient fill
- 도넛차트: SVG circle + stroke-dasharray
- 바차트: div + Tailwind width percentage
- 스택바: div flex + percentage width

## 디자인 시스템 준수

- DESIGN.md의 Apple Liquid Glass 스타일
- 컬러: Apple 시맨틱 컬러 팔레트
- Typography: Pretendard Variable, text-subheadline/text-footnote 클래스
- 카드: 16px border-radius, 1px border
- 스페이싱: 4px 단위
- 다크모드: CSS 변수 기반 자동 전환
- 애니메이션: fadeInUp 400ms, 카드 stagger 50ms
- 접근성: WCAG AA, 44px 터치 타겟, aria-label
