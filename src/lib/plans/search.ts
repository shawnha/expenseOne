// ---------------------------------------------------------------------------
// 연결 후보 제목 검색에 쓰는 순수 헬퍼.
//
// ILIKE 패턴에 사용자 입력을 그대로 끼우면 `%` 와 `_` 가 **와일드카드로 동작한다**.
// 값 자체는 파라미터로 바인딩되므로 주입은 아니지만, `_` 한 글자를 넣으면 그 법인의
// 입금요청이 전부 걸리고 `100%` 로 찾으면 '100' 으로 시작하는 건이 모두 걸린다.
// standard_conforming_strings 가 켜져 있고 LIKE 기본 이스케이프 문자가 `\` 라 ESCAPE 절은 필요 없다.
// ---------------------------------------------------------------------------

/** 사용자가 친 글자를 LIKE/ILIKE 에서 **글자 그대로** 찾도록 이스케이프한다. */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}

/** `%검색어%` 부분 일치 패턴. 빈 문자열이면 null(=검색 조건 없음). */
export function containsPattern(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  return `%${escapeLikePattern(trimmed)}%`;
}
