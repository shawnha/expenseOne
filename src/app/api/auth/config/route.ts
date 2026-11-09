import { NextResponse } from 'next/server';
import { getLoginConfig } from '@/lib/auth/login-config';

export async function GET() {
  const config = getLoginConfig(process.env);
  if (!config) return NextResponse.json({ error: { code: 'config', message: '로그인 설정을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' } }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json(config, { headers: { 'Cache-Control': 'no-store' } });
}
