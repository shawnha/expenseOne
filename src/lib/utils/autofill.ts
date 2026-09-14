// 자동 채우기에서 서버·클라이언트가 **같은 규칙**으로 비교해야 하는 것들.
// 서비스 파일(db를 import)에 두면 클라이언트 번들로 끌려가서 따로 둔다.

/** 가맹점 비교 키. 앞뒤 공백·대소문자 차이는 같은 가맹점으로 본다. */
export function merchantKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

/** 예금주 비교 키. */
export function holderKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

/** 계좌번호 비교 키 — 숫자만. 하이픈 유무로 다른 계좌가 되면 안 된다. */
export function accountKey(num: string | null | undefined): string {
  return (num ?? "").replace(/\D/g, "");
}
