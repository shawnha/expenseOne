// ---------------------------------------------------------------------------
// tx.execute() 결과를 배열로. postgres-js 는 배열 비슷한 객체를 돌려주는데 드리즐 타입은
// 이를 알려주지 않는다. HEALTH-ENDPOINT.md 의 확인된 패턴과 같다.
// ---------------------------------------------------------------------------
export function rowsOf<T>(result: unknown): T[] {
  return Array.from(result as Iterable<T> | ArrayLike<T>);
}

/** postgres 는 bigint(count·sum)를 문자열로 준다. 숫자 칸은 전부 이걸 거친다. */
export function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
