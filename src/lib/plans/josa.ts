// ---------------------------------------------------------------------------
// 한국어 조사 붙이기 — "메모을(를) 찾을 수 없습니다" 같은 병기를 없앤다(QA D-13).
//
// 받침 판정은 마지막 글자가 완성형 한글일 때만 확실하다. 마지막 글자가 한글이 아니면(영문·숫자·기호)
// 정답을 알 수 없으므로 병기 형태("을(를)")로 물러선다 — 고정 라벨(계획·메모·거래처)은 전부 한글이라
// 실제로는 병기가 나오지 않는다. 사용자 입력이 들어가는 문장은 조사를 고정 명사에 붙여 이 문제를 피한다.
// ---------------------------------------------------------------------------

export type JosaPair = "을/를" | "은/는" | "이/가" | "과/와" | "으로/로";

const PAIRS: Record<JosaPair, [withBatchim: string, withoutBatchim: string, ambiguous: string]> = {
  "을/를": ["을", "를", "을(를)"],
  "은/는": ["은", "는", "은(는)"],
  "이/가": ["이", "가", "이(가)"],
  "과/와": ["과", "와", "과(와)"],
  "으로/로": ["으로", "로", "(으)로"],
};

/** 마지막 글자의 받침 여부. 한글이 아니면 null. */
export function hasBatchim(word: string): boolean | null {
  const trimmed = word.trimEnd();
  if (trimmed.length === 0) return null;
  const code = trimmed.charCodeAt(trimmed.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return null;
  const jong = (code - 0xac00) % 28;
  return jong !== 0;
}

/** "메모" + "을/를" → "메모를", "계획" → "계획을", "ODD" → "ODD을(를)". "으로/로" 는 ㄹ 받침이면 "로". */
export function withJosa(word: string, pair: JosaPair): string {
  const batchim = hasBatchim(word);
  const [a, b, ambiguous] = PAIRS[pair];
  if (batchim === null) return `${word}${ambiguous}`;
  if (pair === "으로/로" && batchim) {
    const code = word.trimEnd().charCodeAt(word.trimEnd().length - 1);
    if ((code - 0xac00) % 28 === 8) return `${word}${b}`; // ㄹ 받침
  }
  return `${word}${batchim ? a : b}`;
}
