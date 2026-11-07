import test from 'node:test';
import assert from 'node:assert/strict';
import { getLoginConfig } from './login-config';
import { safeReturnTo } from './return-to';
const base = { NEXT_PUBLIC_SUPABASE_URL: 'https://auth.example', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public' };
test('로그인 설정이 없으면 잘못된 Google 요청을 만들지 않는다', () => {
  assert.equal(getLoginConfig({}), null);
  assert.equal(getLoginConfig(base), null);
  assert.equal(getLoginConfig({ ...base, GOOGLE_CLIENT_ID: ' ', GOOGLE_CLIENT_SECRET: 'secret' }), null);
});
test('미리보기는 Supabase OAuth만 노출하고 비밀 키를 반환하지 않는다', () => {
  assert.deepEqual(getLoginConfig({ ...base, AUTH_FLOW: 'supabase', GOOGLE_CLIENT_SECRET: 'secret' }), { flow: 'supabase' });
});
test('운영 직접 로그인은 서버 client ID를 우선하고 공백을 제거한다', () => {
  assert.deepEqual(getLoginConfig({ ...base, GOOGLE_CLIENT_ID: ' server ', NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'old', GOOGLE_CLIENT_SECRET: 'secret' }), { flow: 'direct', clientId: 'server' });
});
test('로그인 후 원래 화면으로 돌아가되 외부 리다이렉트를 거부한다', () => {
  assert.equal(safeReturnTo('/expenses/new/deposit-batch?from=test'), '/expenses/new/deposit-batch?from=test');
  for (const path of ['https://evil.example', '//evil.example', '/\\evil.example', '/\nevil', '', null]) assert.equal(safeReturnTo(path), '/');
});
