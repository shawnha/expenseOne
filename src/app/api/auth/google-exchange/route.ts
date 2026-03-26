import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // CSRF protection: reject requests without valid origin
  const origin = request.headers.get('origin');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin || !appUrl) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Missing origin' } }, { status: 403 });
  }
  const allowedOrigin = new URL(appUrl).origin;
  if (origin !== allowedOrigin) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Invalid origin' } }, { status: 403 });
  }

  const { code, redirect_uri } = await request.json();
  if (!code) {
    return NextResponse.json({ error: { code: 'missing_code', message: 'No code provided' } }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: { code: 'config', message: 'Server config error' } }, { status: 500 });
  }

  // Validate redirect_uri against allowlist
  const allowedRedirectUris = appUrl
    ? [`${appUrl}/auth/callback`, `${appUrl}/auth/google-callback`]
    : [];
  if (redirect_uri && allowedRedirectUris.length > 0 && !allowedRedirectUris.includes(redirect_uri)) {
    return NextResponse.json({ error: { code: 'invalid_redirect', message: 'Invalid redirect_uri' } }, { status: 400 });
  }

  // Exchange authorization code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirect_uri || 'postmessage',
      grant_type: 'authorization_code',
    }),
  });

  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || !tokenData.id_token) {
    return NextResponse.json(
      { error: { code: 'token_exchange_failed', message: tokenData.error_description || 'Token exchange failed' } },
      { status: 400 }
    );
  }

  // Verify id_token audience matches our client ID
  try {
    const [, payloadB64] = tokenData.id_token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (payload.aud !== clientId) {
      return NextResponse.json(
        { error: { code: 'token_audience_mismatch', message: 'Token audience mismatch' } },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: { code: 'token_decode_failed', message: 'Failed to decode id_token' } },
      { status: 400 }
    );
  }

  return NextResponse.json({ id_token: tokenData.id_token });
}
