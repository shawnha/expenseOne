/** 로그인 후 같은 앱 안의 경로로만 돌아간다. 외부 주소는 받지 않는다. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) return '/';
  try {
    const url = new URL(value, 'https://app.invalid');
    return url.origin === 'https://app.invalid' ? `${url.pathname}${url.search}${url.hash}` : '/';
  } catch { return '/'; }
}
