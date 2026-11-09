export type LoginConfig = { flow: 'direct'; clientId: string } | { flow: 'supabase' };

/** 로그인에 필요한 공개 설정만 반환한다. 비밀 키는 응답에 넣지 않는다. */
export function getLoginConfig(env: Record<string, string | undefined>): LoginConfig | null {
  if (!env.NEXT_PUBLIC_SUPABASE_URL?.trim() || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) return null;
  if (env.AUTH_FLOW?.trim() === 'supabase') return { flow: 'supabase' };
  const clientId = (env.GOOGLE_CLIENT_ID || env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '').trim();
  if (!clientId || !env.GOOGLE_CLIENT_SECRET?.trim()) return null;
  return { flow: 'direct', clientId };
}
