# iOS 26 Liquid Glass Enhancement — Design Spec

## Summary

ExpenseOne의 기존 Liquid Glass 구현을 iOS 26 수준으로 강화. Material Quality(노이즈 텍스처, specular, 글로우) + Depth & Motion(패럴렉스, 3D 틸트, 페이지 전환) 전부 적용. 60fps 성능 보장 필수.

**변경하지 않는 것:**
- 스플래시 애니메이션 (plug connect)
- 로그인 페이지 레이아웃
- 기존 페이지 진입 애니메이션 (fadeInUp, card-enter, stagger)
- 비즈니스 로직, API, 데이터 흐름

---

## 1. Material Quality 강화

### 1.1 SVG 노이즈 텍스처

**전역 노이즈**: `body::after`에 SVG feTurbulence 노이즈 오버레이.
- `opacity: 0.03` (light) / `0.025` (dark)
- `mix-blend-mode: overlay`
- `pointer-events: none`, `z-index: 1`
- 256x256 타일 반복

**패널별 노이즈**: 모든 `.glass*` 클래스의 `::after`에 동일 노이즈.
- `opacity: 0.04`
- 기존 `::before` (specular)는 유지, `::after`를 노이즈로 사용

### 1.2 Specular Highlight 강화

기존 `linear-gradient(180deg, ...)` → `linear-gradient(168deg, ...)` (약간 비스듬한 광원).
- 첫 번째 stop 밝기: `0.7` → `0.55` (더 넓고 자연스러운 분포)
- 두 번째 stop: `0.15 at 35%` → `0.18 at 25%`
- 결과: 더 선명하고 현실적인 유리 반사

### 1.3 엣지 글로우

`.glass-card:hover`, `.glass-dialog` 등에 추가:
```css
box-shadow: ... , 0 0 24px rgba(0,122,255,0.08);
```
- 호버 시에만 나타나는 미묘한 파란 글로우
- Dark mode: `rgba(10,132,255,0.12)`

### 1.4 외부 링 (Outer Ring)

`.glass`, `.glass-card` 등에 추가:
```css
box-shadow: ... , 0 0 0 0.5px rgba(255,255,255,0.3);
```
- 유리 경계를 더 선명하게 구분
- Dark mode: `rgba(255,255,255,0.08)`

---

## 2. Depth & Motion 강화

### 2.1 4번째 Ambient Orb

기존 3개(blue, purple, teal) + **pink orb** 추가:
- `rgba(255,45,85,0.12)` / dark: `rgba(255,55,95,0.10)`
- 위치: `top: 60%; left: 20%`
- 크기: 모바일 200px, 데스크톱 320px
- 드리프트: 25s 주기

### 2.2 스크롤 반응 패럴렉스

새 컴포넌트: `ParallaxOrbs` (클라이언트 컴포넌트)
- `requestAnimationFrame` 기반 스크롤 리스너
- 각 오브에 다른 속도 계수: `[0.15, -0.1, 0.08, -0.12]`
- `passive: true` 스크롤 이벤트
- 모바일: 계수 50% 감소 (성능)
- `prefers-reduced-motion`: 패럴렉스 비활성

### 2.3 카드 3D Tilt

새 hook: `useTiltEffect(ref, options)`
- `mousemove`에서 카드 중심 기준 X/Y 오프셋 계산
- `perspective(800px) rotateX(Ydeg) rotateY(Xdeg)` 적용
- 최대 각도: ±6deg
- `requestAnimationFrame` throttle
- `mouseleave` 시 `transition: transform 0.4s` 으로 원위치
- 적용 대상: 대시보드 스탯 카드, 비용 제출 유형 선택 카드
- **모바일 비활성**: `(hover: hover)` 미디어 쿼리로 터치 디바이스 제외

### 2.4 페이지 전환 레이어 분리

Next.js View Transition API 활용:
- `layout.tsx`의 `<main>` 에 `view-transition-name: main-content`
- Header: `view-transition-name: header`
- Sidebar: `view-transition-name: sidebar`
- CSS `@view-transition` 규칙으로 각 레이어 다른 타이밍:
  - header: 200ms (거의 즉시)
  - main-content: 350ms (fade + slight translateY)
  - sidebar: 변화 없음 (고정)

---

## 3. Performance Optimization

### 3.1 GPU 가속
- 모든 애니메이션은 `transform`/`opacity`만 사용 (layout/paint 트리거 없음)
- `will-change: transform` 은 오브에만 적용 (남용 방지)

### 3.2 RAF Throttle
- 틸트: `requestAnimationFrame` 1프레임 당 최대 1회 계산
- 패럴렉스: 동일

### 3.3 Visibility 기반 정지
- `IntersectionObserver`로 뷰포트 밖 카드 틸트 비활성
- 오브는 항상 활성 (고정 위치, 항상 보임)

### 3.4 모바일 경량화
- 틸트: `@media (hover: hover)` — 터치 디바이스 완전 비활성
- 패럴렉스: 계수 50% 감소
- 노이즈: 동일 (GPU 부담 미미)

### 3.5 Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  .ambient-orb { animation: none !important; }
  .glass-card, .glass-panel { transition: none !important; }
  /* 틸트, 패럴렉스 JS에서도 비활성 */
}
```

---

## 4. 파일 변경 목록

| 파일 | 변경 내용 |
|------|----------|
| `globals.css` | 노이즈 텍스처, specular 강화, 엣지 글로우, 외부 링, 4번째 오브, view-transition |
| `src/hooks/use-tilt-effect.ts` | 새 파일: 카드 3D 틸트 hook |
| `src/components/layout/parallax-orbs.tsx` | 새 파일: 패럴렉스 오브 컴포넌트 (기존 정적 div 대체) |
| `src/app/(dashboard)/layout.tsx` | 정적 오브 div → `<ParallaxOrbs />` 교체 |
| `src/app/(dashboard)/page.tsx` | 스탯 카드에 틸트 적용 |
| `src/app/(dashboard)/expenses/new/page.tsx` | 유형 선택 카드에 틸트 적용 |

---

## 5. 성공 기준

- [ ] 노이즈 텍스처가 모든 글래스 패널에 보임
- [ ] Specular highlight가 이전보다 선명함
- [ ] 카드 호버 시 엣지 글로우 + 3D 틸트 동작
- [ ] 스크롤 시 오브가 패럴렉스로 움직임
- [ ] 4번째 오브(핑크)가 보임
- [ ] 모바일에서 틸트 비활성, 패럴렉스 경량
- [ ] `prefers-reduced-motion`에서 모든 모션 비활성
- [ ] Chrome DevTools Performance 탭에서 60fps 유지
- [ ] TypeScript 에러 없음
- [ ] 기존 스플래시/로그인/페이지 진입 애니메이션 변경 없음
