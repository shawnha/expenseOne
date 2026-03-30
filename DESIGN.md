# ExpenseOne Design System

## Product Context

**Product**: ExpenseOne -- 법인 경비 관리 PWA
**Target Users**: 10~50명 규모 팀의 직원(MEMBER) 및 관리자(ADMIN)
**Platform**: 반응형 웹 (모바일 우선, PWA 지원)
**Differentiator**: 비즈플레이, SAP Concur 같은 기존 엔터프라이즈 도구와 차별화된 소비자급 UX
**Language**: 한국어 UI (날짜: yyyy.mm.dd, 통화: 1,000원)

---

## Aesthetic Direction

**Style**: Apple Liquid Glass
**Philosophy**: 투명도, 블러, 미묘한 깊이감을 활용하여 깨끗하고 현대적인 인터페이스 구현. iOS/macOS의 glassmorphism 미학을 웹에 충실히 재현하되, 가독성과 접근성을 절대 희생하지 않음.

**핵심 원칙**:
- 콘텐츠 최우선 -- 장식보다 정보 전달
- 일관된 시각 언어 -- 모든 화면에서 동일한 느낌
- 의도적 모션 -- 목적 없는 애니메이션 금지
- 접근성 내장 -- WCAG AA 준수

---

## Typography

### Font Family

**Primary**: Pretendard Variable
- 한국어에 최적화된 서체, Apple SF Pro의 한국어 대안
- 가변 폰트로 용량 효율적

**CDN 로딩**:
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
```

**CSS 선언**:
```css
font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue', 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', sans-serif;
```

### Type Scale

| Token           | Size     | Weight | Usage                     |
|-----------------|----------|--------|---------------------------|
| `display`       | 2.25rem  | 700    | 히어로 헤딩, 빈 상태 제목   |
| `heading-1`     | 1.5rem   | 600    | 페이지 제목                |
| `heading-2`     | 1.25rem  | 600    | 섹션 제목                  |
| `subheading`    | 1.125rem | 600    | 카드 제목, 서브헤딩          |
| `body`          | 1rem     | 400    | 본문 텍스트                |
| `body-medium`   | 1rem     | 500    | 강조 본문                  |
| `caption`       | 0.8125rem| 400    | 날짜, 메타 정보             |
| `caption-medium`| 0.8125rem| 500    | 레이블, 카테고리             |
| `small`         | 0.75rem  | 500    | 배지, 태그 텍스트           |

### Data Display
```css
/* 숫자 데이터 표시 시 반드시 적용 */
font-variant-numeric: tabular-nums;
```
- 테이블, 금액, 통계 카드의 숫자에 적용
- 정렬된 열에서 숫자가 같은 너비를 차지하도록 보장

### Line Height
- 헤딩: 1.2
- 본문: 1.5
- 캡션: 1.4

### Letter Spacing
- Display: -0.02em
- Heading: -0.01em
- Body 이하: 0 (기본값)

---

## Color System

### CSS Variables

```css
:root {
  /* Primary */
  --color-primary: #007AFF;
  --color-secondary: #5856D6;

  /* Neutrals (warm gray) */
  --neutral-50: #F2F2F7;
  --neutral-100: #E5E5EA;
  --neutral-200: #D1D1D6;
  --neutral-300: #C7C7CC;
  --neutral-400: #AEAEB2;
  --neutral-500: #8E8E93;
  --neutral-600: #636366;
  --neutral-700: #48484A;
  --neutral-800: #3A3A3C;
  --neutral-900: #2C2C2E;
  --neutral-950: #1C1C1E;

  /* Semantic */
  --color-success: #34C759;
  --color-warning: #FF9500;
  --color-error: #FF3B30;
  --color-info: #5AC8FA;

  /* Glass - Light Mode */
  --glass-tint: rgba(255, 255, 255, 0.78);
  --glass-border: rgba(255, 255, 255, 0.5);

  /* Surface - Light Mode */
  --bg: #F2F2F7;
  --bg-content: #FFFFFF;
  --text-primary: #1C1C1E;
  --text-secondary: #636366;
  --text-tertiary: #8E8E93;
}

/* Dark Mode */
[data-theme="dark"] {
  --glass-tint: rgba(44, 44, 46, 0.6);
  --glass-border: rgba(255, 255, 255, 0.08);

  --bg: #1C1C1E;
  --bg-content: #2C2C2E;
  --text-primary: #F2F2F7;
  --text-secondary: #AEAEB2;
  --text-tertiary: #8E8E93;
}
```

### Color Usage Rules

| 용도                | Light Mode        | Dark Mode         |
|---------------------|-------------------|-------------------|
| 페이지 배경          | `--neutral-50`    | `--neutral-950`   |
| 카드/콘텐츠 배경      | `#FFFFFF`         | `--neutral-900`   |
| 기본 텍스트          | `--neutral-950`   | `--neutral-50`    |
| 보조 텍스트          | `--neutral-600`   | `--neutral-400`   |
| 힌트/비활성 텍스트    | `--neutral-500`   | `--neutral-500`   |
| 구분선               | `--neutral-100`   | `--neutral-800`   |
| Primary 버튼 배경    | `--color-primary` | `--color-primary` |
| Primary 버튼 텍스트   | `#FFFFFF`         | `#FFFFFF`         |

### Semantic Badge Colors

| 상태  | 배경 (Light)              | 텍스트 (Light) | 배경 (Dark)               | 텍스트 (Dark) |
|-------|--------------------------|---------------|--------------------------|---------------|
| 승인  | `rgba(52,199,89,0.12)`   | `#248A3D`     | `rgba(52,199,89,0.15)`   | `#30D158`     |
| 반려  | `rgba(255,59,48,0.12)`   | `#D70015`     | `rgba(255,59,48,0.15)`   | `#FF453A`     |
| 대기  | `rgba(255,149,0,0.12)`   | `#C93400`     | `rgba(255,149,0,0.15)`   | `#FF9F0A`     |

---

## Spacing System

### Base Unit: 4px

| Token  | Value | px  | Usage                              |
|--------|-------|-----|------------------------------------|
| `2xs`  | 0.125rem | 2px  | 미세 간격, 아이콘 내부           |
| `xs`   | 0.25rem  | 4px  | 배지 내부 패딩, 인라인 간격       |
| `sm`   | 0.5rem   | 8px  | 컴포넌트 내부 간격, 아이템 사이   |
| `md`   | 1rem     | 16px | 카드 패딩, 요소 사이 기본 간격    |
| `lg`   | 1.5rem   | 24px | 섹션 내부 여백, 데스크톱 페이지 패딩 |
| `xl`   | 2rem     | 32px | 섹션 사이 간격                    |
| `2xl`  | 3rem     | 48px | 큰 섹션 분리                      |
| `3xl`  | 4rem     | 64px | 페이지 최상단/하단 여백            |

### Density: Comfortable

| Context             | Mobile  | Desktop |
|---------------------|---------|---------|
| 페이지 패딩          | 16px    | 24px    |
| 카드 간격            | 12px    | 16px    |
| 카드 내부 패딩        | 16px    | 24px    |
| 리스트 아이템 간격    | 8px     | 8px     |

---

## Layout System

### Breakpoints

| Name    | Min Width | Usage                        |
|---------|-----------|------------------------------|
| mobile  | 0px       | 기본 레이아웃 (1열)            |
| tablet  | 640px     | 2열 그리드                    |
| desktop | 1024px    | 사이드바 레일 + 콘텐츠 영역    |
| wide    | 1280px    | 최대 4열 그리드               |

### Mobile Layout
- 하단 탭 바 (5개 탭): 홈, 제출, 승인, 알림, 설정
- 전체 너비 카드
- 페이지 패딩: 16px

### Desktop Layout
- 56px 아이콘 사이드바 레일 (좌측 고정)
- 콘텐츠 영역: max-width 1024px (5xl), 중앙 정렬
- 페이지 패딩: 24px

### Grid System
- 1열: 모바일 (기본)
- 2열: 태블릿 (640px+)
- 3열: 데스크톱 (1024px+)
- 4열: 와이드 (1280px+, 스탯 카드 등 한정 사용)

### Border Radius Scale

| Token  | Value    | Usage                            |
|--------|----------|----------------------------------|
| `sm`   | 8px      | 버튼, 입력 필드, 작은 카드        |
| `md`   | 12px     | 카드, 드롭다운                    |
| `lg`   | 16px     | 큰 카드, 글래스 패널              |
| `xl`   | 20px     | 모달, 시트, 대시보드 컨테이너      |
| `full` | 9999px   | 필 버튼, 배지, 아바타              |

---

## Motion System

### Approach: Intentional

모든 애니메이션은 사용자의 공간 인식을 돕거나, 상태 변화를 명확히 전달하는 목적이 있어야 함. 장식적 모션 금지.

### Easing Curves

| Token        | Value                             | Usage                    |
|--------------|-----------------------------------|--------------------------|
| `decelerate` | `cubic-bezier(0.16, 1, 0.3, 1)`  | 페이지 전환, 카드 등장     |
| `spring`     | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 버튼 바운스, 토스트 등장 |

### Duration Scale

| Token    | Range        | Usage                        |
|----------|--------------|------------------------------|
| `micro`  | 50--100ms    | hover, 색상 변화              |
| `short`  | 150--250ms   | 버튼 인터랙션, 토글           |
| `medium` | 250--400ms   | 카드 등장, 드롭다운 열기      |
| `long`   | 400--700ms   | 페이지 전환, 모달 등장        |

### Standard Animations

**페이지 진입**: fade + slide up, 400ms, `decelerate`
```css
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
```

**카드 스태거**: 카드 목록 등장 시 50ms 간격으로 순차 등장

**버튼 프레스**: `transform: scale(0.97)` on `:active`

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

반드시 `prefers-reduced-motion` 미디어 쿼리를 존중할 것.

---

## Glass Effect System

### Where to Apply

**적용 대상**:
- 모달 오버레이
- 플로팅 카드 (호버 카드, 팝오버)
- 네비게이션 바 / 헤더
- 바텀 시트

**적용 금지**:
- 버튼 (솔리드 필 사용)
- 입력 필드 (불투명 배경 사용)
- 배지 / 태그
- 작은 요소 (32px 미만)

### Glass CSS Implementation

```css
.glass {
  background: var(--glass-tint);
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
}

/* Specular highlight (상단 가장자리 반사광) */
.glass::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.4) 50%,
    transparent 100%
  );
}
```

### Ambient Orbs (배경 깊이감)

3개의 그라디언트 오브를 콘텐츠 뒤에 배치하여 글래스 효과에 깊이감 부여:
- Blue: `#007AFF`, 우상단
- Purple: `#5856D6`, 좌중단
- Teal: `#5AC8FA`, 우하단

```css
.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(120px);
  opacity: 0.3; /* Dark mode: 0.15 */
}
```

### Glass Rules

1. 글래스 패널 위의 텍스트 가독성을 위해 항상 10-30% 불투명 틴트 오버레이 적용
2. 모든 패널에서 일관된 단일 광원 방향 유지
3. 글래스 위에 글래스를 중첩하지 않음 (가독성 저하)
4. 글래스 요소 내부에 고대비 텍스트 사용

---

## Component Specifications

### Buttons

| Variant     | Background            | Text Color      | Border    | Radius    |
|-------------|-----------------------|-----------------|-----------|-----------|
| Primary     | `--color-primary`     | `#FFFFFF`       | none      | `sm` (8px)|
| Secondary   | `--neutral-100`       | `--text-primary`| none      | `sm` (8px)|
| Ghost       | `transparent`         | `--color-primary`| none     | `sm` (8px)|
| Pill        | (variant 배경)        | (variant 텍스트) | none     | `full`    |
| Disabled    | 60% 불투명도           | 60% 불투명도     | none      | (variant) |

**크기**:
- Default: padding 10px 20px, font-size 0.9375rem
- Small: padding 6px 14px, font-size 0.8125rem

### Form Inputs

- Padding: 10px 14px
- Border: 1px solid `--neutral-200` (dark: `--neutral-700`)
- Background: `--bg-content`
- Border radius: `sm` (8px)
- Focus: border-color `--color-primary` + box-shadow `0 0 0 3px rgba(0,122,255,0.15)`

### Cards

- Background: `--bg-content`
- Border: 1px solid `--neutral-100` (dark: `--neutral-800`)
- Border radius: `lg` (16px)
- Padding: `md` (16px) mobile, `lg` (24px) desktop
- Hover: translateY(-2px) + elevated shadow

### Badges

- Padding: 3px 10px
- Border radius: `full`
- Font size: 0.75rem
- Font weight: 600

### Alerts

- Padding: `md` (16px)
- Border radius: `md` (12px)
- Border: 1px solid (semantic color at 20% opacity)
- Background: semantic color at 10% opacity
- 아이콘 + 텍스트 레이아웃

---

## Accessibility

### WCAG AA Compliance

- 일반 텍스트 색상 대비: 4.5:1 이상
- 대형 텍스트 색상 대비: 3:1 이상
- 포커스 표시: `outline: 2px solid var(--color-primary); outline-offset: 2px`
- 터치 타겟: 최소 44px

### Keyboard Navigation

- 모든 인터랙티브 요소에 포커스 표시
- 논리적 탭 순서 유지
- Escape로 모달/드롭다운 닫기
- Enter/Space로 버튼 활성화

### Screen Reader

- 시맨틱 HTML 우선 사용
- 아이콘 전용 버튼에 `aria-label` 필수
- 상태 변경 시 `aria-live` 영역 업데이트
- 배지 상태 텍스트는 스크린 리더가 읽을 수 있어야 함

---

## Tailwind CSS Integration

### tailwind.config.ts 확장

```typescript
const config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Pretendard Variable', 'Pretendard', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        primary: '#007AFF',
        secondary: '#5856D6',
        success: '#34C759',
        warning: '#FF9500',
        error: '#FF3B30',
        info: '#5AC8FA',
        neutral: {
          50: '#F2F2F7',
          100: '#E5E5EA',
          200: '#D1D1D6',
          300: '#C7C7CC',
          400: '#AEAEB2',
          500: '#8E8E93',
          600: '#636366',
          700: '#48484A',
          800: '#3A3A3C',
          900: '#2C2C2E',
          950: '#1C1C1E',
        },
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
      },
      spacing: {
        '2xs': '2px',
        xs: '4px',
      },
      transitionTimingFunction: {
        decelerate: 'cubic-bezier(0.16, 1, 0.3, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
};
```

---

## Decisions Log

| Date       | Decision                                  | Rationale                                        |
|------------|-------------------------------------------|--------------------------------------------------|
| 2026-03-30 | Pretendard Variable 선택                   | 한국어 최적화, SF Pro와 유사한 기하학적 형태       |
| 2026-03-30 | Apple Liquid Glass 미학 채택               | 소비자급 UX로 엔터프라이즈 도구 차별화             |
| 2026-03-30 | 4px 기본 간격 단위                         | Apple HIG 일관성, 세밀한 간격 제어                |
| 2026-03-30 | 하단 탭 바 (모바일) + 사이드 레일 (데스크톱) | 모바일 원손 조작, 데스크톱 화면 활용 극대화        |
| 2026-03-30 | 글래스 효과 선택적 적용                     | 가독성 보장, 성능 최적화, 과도한 blur 방지         |
| 2026-03-30 | prefers-reduced-motion 존중 필수            | 접근성 및 전정 장애 사용자 배려                    |
| 2026-03-30 | 버튼에 pill 스타일 옵션 제공                | Apple HIG 스타일 준수, 터치 친화적                |
| 2026-03-30 | KRW 전용, tabular-nums 필수                | 한국 시장 전용, 금액 정렬 필수                     |

---

*Design System v1.0 -- 2026.03.30*
*Preview: `/tmp/design-consultation-preview.html`*
