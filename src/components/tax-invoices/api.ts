// 세금계산서 화면 공용 fetch. 서버 오류 형식 { error: { code, message } } 을 문장 하나로 푼다.

export type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string };

export async function taxFetch<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(init?.headers ?? {}) },
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, message: json?.error?.message ?? "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요." };
    }
    return { ok: true, data: json?.data as T };
  } catch {
    return { ok: false, message: "네트워크 오류입니다. 연결을 확인해주세요." };
  }
}

export function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

/** 오늘(KST) "YYYY-MM-DD". */
export function todayKST(): string {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
}
