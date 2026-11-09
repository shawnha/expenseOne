export interface ExpenseNotePart {
  text: string;
  href?: string;
}

/** 설명은 일반 텍스트로 유지하고 http(s) URL만 링크로 표시한다. HTML은 해석하지 않는다. */
export function splitExpenseNotes(value: string): ExpenseNotePart[] {
  const parts: ExpenseNotePart[] = [];
  const pattern = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
  let cursor = 0;

  for (const match of value.matchAll(pattern)) {
    let text = match[0].replace(/[.,;:!?。，、]+$/u, "");
    // 문장의 닫는 괄호는 URL 밖에 두고, 주소 자체에 포함된 괄호는 보존한다.
    for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
      while (text.endsWith(close) && text.split(close).length > text.split(open).length) {
        text = text.slice(0, -1);
      }
    }
    try {
      const url = new URL(/^www\./i.test(text) ? `https://${text}` : text);
      if (!["http:", "https:"].includes(url.protocol) || !url.hostname) continue;
      const index = match.index!;
      if (index > cursor) parts.push({ text: value.slice(cursor, index) });
      parts.push({ text, href: url.href });
      cursor = index + text.length;
    } catch {
      // 잘못된 URL도 사용자가 적은 설명에서는 사라지지 않는다.
    }
  }
  if (cursor < value.length) parts.push({ text: value.slice(cursor) });
  return parts;
}
