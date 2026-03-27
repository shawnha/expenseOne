# Capacitor Native Wrapper Plan

Created: 2026-03-27
Status: Pending (proceed when ready)

---

## Why

iOS PWA는 앱이 완전 종료되면 푸시 알림을 받을 수 없음 (Apple 제한).
Capacitor로 네이티브 앱 껍데기를 씌우면 APNs를 통해 종료 상태에서도 푸시 가능.

## What Changes

| 항목 | PWA (현재) | Capacitor |
|------|----------|-----------|
| 앱 종료 시 푸시 | 안 옴 | 옴 (APNs) |
| 알림 배너/소리 | 제한적 | 네이티브와 동일 |
| 설치 방법 | 홈화면 추가 | TestFlight |
| 속도 | 동일 | 동일 |
| 웹 업데이트 | 즉시 | 즉시 (Vercel 배포만으로) |
| 비용 | 무료 | $99/년 (Apple Developer Program) |

## Prerequisites

- Apple Developer Program 가입 ($99/년)
- Xcode 설치 (Mac에서)
- Apple Developer 계정에서 Push Notification 인증서 생성

## Implementation Steps (~2-3 hours)

### 1. Capacitor 설치
```bash
npm install @capacitor/core @capacitor/cli
npx cap init ExpenseOne com.hanah1.expenseone
npm install @capacitor/ios @capacitor/android
npm install @capacitor/push-notifications
```

### 2. Capacitor 설정 (capacitor.config.ts)
```typescript
const config: CapacitorConfig = {
  appId: 'com.hanah1.expenseone',
  appName: 'ExpenseOne',
  webDir: 'out', // or '.next' with appropriate config
  server: {
    url: 'https://expenseone.vercel.app', // Live reload from Vercel
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};
```

### 3. iOS 프로젝트 생성
```bash
npx cap add ios
npx cap open ios
```

### 4. Push Notification 설정
- Xcode > Signing & Capabilities > + Push Notifications
- Apple Developer Console에서 APNs 인증서 생성
- 서버에서 APNs로 푸시 전송하도록 push.service.ts 수정

### 5. TestFlight 배포
```bash
npm run build
npx cap sync ios
# Xcode에서 Archive > Upload to App Store Connect > TestFlight
```

### 6. 팀원 초대
- App Store Connect > TestFlight > 테스터 추가 (이메일)
- 팀원이 TestFlight 앱 설치 후 링크로 앱 설치

## Update Flow

- **웹 코드 변경**: `vercel --prod` 만 하면 앱에 즉시 반영 (재배포 불필요)
- **네이티브 변경** (아이콘, 푸시 설정 등): Xcode에서 Archive > TestFlight 새 빌드
- 대부분의 업데이트는 Vercel 배포만으로 충분

## Android도 가능

```bash
npx cap add android
npx cap open android
# Android Studio에서 빌드 > APK 또는 Play Console
```

Android는 PWA에서도 종료 상태 푸시가 되지만,
Capacitor로 래핑하면 Play Store 배포 + 더 나은 네이티브 경험 가능.

## Notes

- 현재 Web Push (VAPID) 구현은 그대로 유지 — Android PWA 사용자용
- Capacitor 버전은 APNs를 추가로 사용
- 서버에서 push 전송 시 Web Push + APNs 병렬 전송
