# iOS 26 Liquid Glass UI Unification — Design Spec

## Summary

탭 바(glass-tab-bar + glass-lens)가 iOS 26 Liquid Glass 기준점. 나머지 컴포넌트(사이드바, 헤더, 카드, 다이얼로그, 시트, 드롭다운)를 동일 수준으로 통일.

**변경하지 않는 것:**
- 비즈니스 로직, API, 데이터 흐름
- glass CSS 변수 값 (이미 iOS 26 수준)
- 탭 바 구현 (기준점, 변경 불필요)
- 스플래시/로그인 페이지
- 애니메이션 키프레임

---

## 1. 사이드바 — Glass Lens Active State

### 현재
- `RailNavLink` active: `bg-[rgba(0,122,255,0.1)]` 단순 배경 tint
- 탭 바와 시각적 불일치

### 변경
- Active 상태에 `glass-lens` 효과 추가 (탭 바와 동일한 magnifier pill)
- 기존 `bg-blue/10` 배경 제거 → glass-lens가 대체
- 아이콘 활성 색상은 유지 (`--apple-blue`)

### 파일
- `src/components/layout/sidebar.tsx` — `RailNavLink` 컴포넌트

---

## 2. 헤더 — Specular + Border 강화

### 현재
- `glass-header`: 기본 blur + 약한 shadow
- border-bottom만 있고 specular 약함

### 변경
- `glass-header`에 `border-top-color: var(--glass-border-top)` 추가
- shadow 강화: `0 1px 8px` → `0 2px 12px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.03)`
- dark mode shadow 별도 정의

### 파일
- `src/app/globals.css` — `.glass-header` 클래스

---

## 3. Card 컴포넌트 — 인라인 → 클래스 통일

### 현재
- `src/components/ui/card.tsx`: 인라인으로 `bg-[var(--glass-bg)] backdrop-blur-[40px]...` 중복 작성
- `globals.css`의 `.glass-card`와 동일 스타일이 2곳에 존재

### 변경
- `Card` 컴포넌트에서 인라인 glass 스타일 제거
- `glass-card` 클래스 사용으로 통일
- `CardFooter` border도 `--glass-border` 변수 이미 사용 중 — 유지

### 파일
- `src/components/ui/card.tsx`

---

## 4. Sheet — 인라인 → Glass 클래스

### 현재
- `SheetContent`에 인라인 glass 스타일 하드코딩
- `bg-[var(--glass-bg-strong)] backdrop-blur-[40px]...`

### 변경
- 인라인 스타일 → `glass-dialog` 클래스 사용 (Sheet는 dialog급 강한 glass)
- bottom sheet에 `rounded-t-2xl` 유지
- border-radius override만 인라인으로 남김

### 파일
- `src/components/ui/sheet.tsx`

---

## 5. Dialog Overlay — iOS 26 수준 Blur

### 현재
- `bg-black/20 backdrop-blur-sm` (4px blur)

### 변경
- `backdrop-blur-sm` → `backdrop-blur-md` (12px)로 강화
- dark mode: `bg-black/30`으로 약간 더 어둡게

### 파일
- `src/components/ui/dialog.tsx`

---

## 6. Border Radius 통일

### 규칙
| 컴포넌트 | border-radius | 이유 |
|----------|---------------|------|
| 탭 바 | 26px | 독립 floating pill |
| 카드 | 20px | 콘텐츠 컨테이너 |
| 다이얼로그 | 24px | 오버레이 위 모달 |
| 시트(bottom) | 20px (top만) | 화면 하단 연결 |
| 사이드바 active lens | 12px | 아이콘 크기에 맞춤 |
| 배지 | 9999px | pill 형태 |

현재 대부분 맞으나, glass 기본 클래스가 16px — glass-card는 20px로 이미 오버라이드. 변경 불필요.

---

## 7. 파일 변경 목록

| 파일 | 변경 내용 |
|------|----------|
| `src/components/layout/sidebar.tsx` | active state에 glass-lens 추가 |
| `src/app/globals.css` | glass-header shadow 강화, dark glass-header 추가 |
| `src/components/ui/card.tsx` | 인라인 glass → glass-card 클래스 |
| `src/components/ui/sheet.tsx` | 인라인 glass → glass-dialog 클래스 |
| `src/components/ui/dialog.tsx` | overlay blur 강화 |

---

## 8. 성공 기준

- [ ] 사이드바 active 아이템이 탭 바와 동일한 glass-lens 효과
- [ ] Card 컴포넌트에 인라인 glass 스타일 없음
- [ ] Sheet에 인라인 glass 스타일 없음
- [ ] Dialog overlay blur이 iOS 26 수준
- [ ] 라이트/다크 모드 모두 정상
- [ ] 모바일/데스크톱 반응형 유지
- [ ] TypeScript 에러 없음
- [ ] Vercel 배포 성공
