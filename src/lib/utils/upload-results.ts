// ---------------------------------------------------------------------------
// 첨부 업로드 결과 판정 — 비용을 만든 뒤 첨부를 따로 올리는 폼(입금요청·법카·
// 반품·수정)이 같은 규칙으로 실패를 세고 같은 문구로 안내하게 한다.
//
// 실패로 치는 것:
//   - fetch 자체가 거절됨(네트워크 끊김 등)
//   - HTTP 4xx/5xx (`!res.ok`) — allSettled에선 fulfilled로 오므로 따로 봐야 한다
//   - 리다이렉트된 응답 — 세션이 끊겨 미들웨어가 /login으로 보내면 fetch가
//     따라가서 200 HTML을 받는다. 업로드는 되지 않았다.
//
// 비용 자체는 이미 만들어졌으므로 지우지 않는다. 상세 화면에서 다시 첨부하게 안내한다.
// ---------------------------------------------------------------------------

/** fetch Response 중 판정에 쓰는 부분만. */
export type UploadResponseLike = Pick<Response, "ok" | "redirected">;

/** 업로드 한 건이 실패인지. */
export function isUploadFailure(result: PromiseSettledResult<UploadResponseLike>): boolean {
  if (result.status === "rejected") return true;
  return !result.value.ok || result.value.redirected;
}

/** 실패한 업로드 수. */
export function countUploadFailures(results: PromiseSettledResult<UploadResponseLike>[]): number {
  return results.filter(isUploadFailure).length;
}

/**
 * 업로드 실패 안내 문구. 실패가 없으면 null.
 * - `required`(입금요청처럼 첨부가 필수)면 필수라고 덧붙인다.
 * - `editable: false`(반품 건은 수정 화면이 없다)면 다시 첨부하라고 하지 않는다.
 */
export function uploadFailureMessage(
  failed: number,
  total: number,
  options: { required?: boolean; editable?: boolean } = {},
): string | null {
  if (failed <= 0 || total <= 0) return null;
  const head =
    failed >= total
      ? "첨부 파일 업로드에 실패했습니다."
      : `첨부 파일 ${total}개 중 ${failed}개 업로드에 실패했습니다.`;
  if (options.editable === false) {
    return head + " 이 건은 수정할 수 없어 다시 첨부할 수 없습니다. 상세 화면에서 저장된 첨부를 확인해주세요.";
  }
  const tail = options.required
    ? " 첨부가 필수이니 상세 화면에서 다시 첨부해주세요."
    : " 상세 화면에서 다시 첨부해주세요.";
  return head + tail;
}
