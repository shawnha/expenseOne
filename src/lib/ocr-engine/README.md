# OCR 엔진 (증빙 자동 인식)

한국어 증빙(카드 영수증, 견적서, 청구서, 거래명세서, 통장사본, 사업자등록증, 세금계산서 등)을 Claude 로 읽어 필드(상호·합계·공급가액·부가세·날짜·계좌·카드 끝 4자리 등)를 뽑는 **서버 전용** 모듈입니다. 폴더 하나를 복사해 다른 Next.js/TypeScript 앱에 붙일 수 있게 만들었습니다.

- `@/...` 별칭, `next/*` 임포트가 없습니다. 상대 경로 + npm 패키지만 씁니다. 표준 Web `Request`/`Response` 를 쓰므로 Next 버전과 무관하고 순수 Node 에서도 돕니다.
- 결과는 저장하지 않습니다. 문서 내용은 로그에 남기지 않습니다(토큰 수·시간·모델명만).

## 설치

1. 이 폴더(`ocr-engine/`)를 앱의 `src/lib/` 아래로 복사합니다.
2. 패키지 설치:
   ```bash
   npm i @anthropic-ai/sdk zod sharp heic-convert @types/heic-convert
   ```
3. 환경변수: `ANTHROPIC_API_KEY`(필수, **앱마다 조직 API 키를 따로 발급**), `OCR_MODEL`(선택, 기본 `claude-sonnet-5-5`).
4. 라우트 파일에 `export const maxDuration = 60;` (엔진 내부 마감은 30초, 다시 읽기 포함).
5. Vercel 함수 요청 본문 한도는 4.5MB 입니다. 엔진 상한은 4MB(`OCR_MAX_UPLOAD_BYTES`)이고, 큰 사진은 브라우저에서 먼저 줄여 올리세요.

## 라우트 예시 (Next.js app router)

```ts
// app/api/ocr/route.ts
import { createOcrEngine, createOcrRouteHandler } from "@/lib/ocr-engine";
import { getSessionUser } from "@/lib/auth"; // 앱의 인증

export const maxDuration = 60;
let engine: ReturnType<typeof createOcrEngine> | null = null;
const handler = createOcrRouteHandler({
  engine: () => (process.env.ANTHROPIC_API_KEY ? (engine ??= createOcrEngine({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.OCR_MODEL || undefined })) : null),
  identify: async () => { const u = await getSessionUser(); return u ? { key: u.id } : new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다." } }), { status: 401 }); },
});
export const POST = (req: Request) => handler(req);
```

`createOcrEngine` 옵션: `apiKey`, `model`, `effort`("low" 기본), `context`(프롬프트 앞머리 한 구절, 예: "○○ 회사 직원이 정산용으로 올린 증빙"), `deadlineMs`(기본 30000), `onLog`(기본 console).
핸들러 옵션: `engine`(null 이면 503), `identify`(Response 를 돌려주면 그대로 응답), `rateLimiter`(기본 30회/10분, `createRateLimiter({ max, windowMs })`), `maxUploadBytes`, `onLog`.

## 요청/응답 계약

- 요청: `POST multipart/form-data`, 필드 `file` 하나. 형식 JPG·PNG·WebP·HEIC/HEIF·PDF, 4MB 이하. `Content-Length` 필수.
- 성공: `200 { data: OcrResult }` — `fields`(OcrFields), `rotation`(0/90/180/270), `imageJpegBase64`(서버가 회전했거나 HEIC 를 바꿨을 때만, 아니면 null; 화면은 이 이미지로 첨부를 바꿔 끼운다).
- 실패: `{ error: { code, message } }`

| 상태 | code | 의미 |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | 파일 없음/형식·내용 불일치/빈 파일/읽을 수 없는 이미지/너무 긴 PDF |
| 411 | LENGTH_REQUIRED | Content-Length 없음 |
| 413 | PAYLOAD_TOO_LARGE | 4MB 초과 |
| 429 | RATE_LIMITED | 사용자별 한도 초과 |
| 502 | OCR_UPSTREAM_ERROR | 모델 호출 실패·거부·해석 실패 |
| 503 | OCR_DISABLED | 키 없음 — 화면은 조용히 건너뛴다 |
| 500 | INTERNAL_ERROR | 그 외 |

타입은 `types.ts`(`OcrFields`, `OcrResult`, `OcrResponse`, `OCR_ACCEPTED_TYPES` …)를 화면 코드에서 그대로 임포트합니다(서버 전용 `sharp` 를 끌고 오지 않도록 `types.ts` 만 임포트).

## 우리가 배운 규칙

- **회전은 `text_top` 으로 묻는다.** "몇 도 돌릴까"는 90/270 방향을 자주 거꾸로 답했다(실측). 글자 머리가 어느 쪽인지(up/right/down/left)를 묻고 코드가 각도로 바꾼다. 돌아간 사진은 세워서 다시 읽는다(최대 2번 재독) — 돌아간 채 읽은 값은 믿을 수 없다.
- **enum 은 SDK 의 zod 헬퍼가 강제하지 않는다.** 모델이 스키마 밖 값을 낼 수 있으므로 모든 enum 에 `.catch(기본값)` 을 둔다. `messages.parse` 대신 `create` + 직접 `safeParse`.
- **금액을 화면에서 자동으로 채우지 않는다.** 「적용」 버튼이 있는 제안으로만 보여준다. 값은 항상 사람이 확인한다. 금액은 절대값으로 정규화, 카드번호는 끝 4자리만.
- **HEIC 는 `heic-convert` 가 필요하다.** `sharp` 는 HEIC 를 디코드하지 못한다. 한 번만 JPEG 로 바꿔 이후 단계에 넘긴다. 매직 바이트로 AVIF 와 구분한다.
- **직원 문서를 개인 구독(`claude -p` 등)에 태우지 않는다.** 앱마다 조직 API 키를 쓴다. 프롬프트 인젝션 방어: 시스템 프롬프트가 문서 안 지시문을 데이터로만 취급하게 한다.
- **긴 캡처는 타일로 읽는다.** EXIF 회전 후 긴 변/짧은 변 비율이 2.5를 넘으면 긴 방향으로 약 12% 겹치게 나눈다(타일 비율 약 1.6 이하, 최대 6장). 6장으로 부족하면 더 긴 타일로 전체 범위를 보존한다. 각 타일은 긴 변 2000px 이내 JPEG 85로 줄여 순서대로 한 요청에 보내고, 겹친 금액을 중복 집계하지 않도록 안내한다. 디지털 캡처로 보고 회전 재독은 생략한다(rotation 0, HEIC 이외에는 출력 이미지 없음). 보통 사진은 기존 단일 이미지 경로를 쓴다.
- PDF 는 `countTokens`(무료)로 30,000 토큰 초과를 먼저 거른다.

## 실측 수치

- 기본 설정: Sonnet 5.5, effort low.
- 응답 시간 중앙값: Haiku 2.4초 / Sonnet 3.1초 / Opus 3.6초.
- 43개 파일 테스트: 깨끗한 문서에서는 모델 간 결과가 같았고, 모델 선택보다 **회전 처리**가 정확도에 더 크게 영향했다.

## 테스트

`engine.test.ts` — 네트워크 호출 없음(가짜 엔진). 앱의 단위 테스트 명령에 이 파일을 넣으세요: `npx tsx --test src/lib/ocr-engine/engine.test.ts`
