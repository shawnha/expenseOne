// ---------------------------------------------------------------------------
// 비용 생성(POST /api/expenses) 응답에서 비용 id를 꺼내는 규칙.
//
// 왜 따로 두나 — `response.ok`만 보면 "만들어졌다"고 믿을 수 없다.
//   - 세션이 끊기면 middleware.ts:123-127이 POST /api/expenses를 /login으로
//     307 리다이렉트한다. fetch는 기본(redirect: "follow")이라 따라가서
//     /login의 200 HTML을 받는다 → `response.ok === true`. 비용은 안 만들어졌다.
//     이때 `response.redirected === true`라 이것으로 구분한다.
//   - 본문에 `data.id`가 없으면(HTML이라 JSON 파싱 실패 등) 뒤이어 붙일 첨부를
//     어디에 붙일지도 모른다. 등록 여부 자체를 확신할 수 없으므로 성공 창을
//     띄우지 않는다.
//
// 예전 동작(2026-09-18 이전): id가 없으면 "첨부 업로드에 실패했습니다"라고만
// 알리고 초록 체크 「제출 완료」 창을 그대로 띄웠다. 비용이 하나도 안 만들어진
// 상황에서 "건은 등록됐고 영수증만 다시 붙이면 된다"고 잘못 안내한 셈이다.
//
// 재제출로 인한 중복을 막으려고 문구는 "다시 제출하라"가 아니라
// "목록에서 등록 여부를 확인하라"로 둔다.
// ---------------------------------------------------------------------------

/** 세션이 끊겨 로그인 화면으로 리다이렉트됐을 때. */
export const SESSION_EXPIRED_MESSAGE =
  "로그인이 만료되어 제출되지 않았습니다. 다시 로그인한 뒤 제출해주세요.";

/** 200을 받았지만 비용 id를 확인할 수 없을 때. */
export const UNKNOWN_RESULT_MESSAGE =
  "제출 결과를 확인할 수 없습니다. 비용관리 목록에서 등록 여부를 확인해주세요.";

/** fetch Response 중 판정에 쓰는 부분만. */
export type CreateResponseLike = Pick<Response, "redirected">;

/**
 * 생성 응답에서 비용 id를 꺼낸다. 확신할 수 없으면 던진다(호출부의 catch가
 * toast.error로 보여주고 성공 창에는 도달하지 않는다).
 *
 * @param response `!response.ok` 검사는 호출부에서 서버 에러 문구와 함께 먼저 한다.
 * @param body `await response.json().catch(() => null)` 결과.
 */
export function resolveCreatedExpenseId(
  response: CreateResponseLike,
  body: unknown,
): string {
  if (response.redirected) {
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }
  const id = (body as { data?: { id?: unknown } } | null | undefined)?.data?.id;
  if (typeof id !== "string" || id.trim() === "") {
    throw new Error(UNKNOWN_RESULT_MESSAGE);
  }
  return id;
}
