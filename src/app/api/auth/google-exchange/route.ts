import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // CSRF protection
  const origin = request.headers.get('origin');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (origin && appUrl) {
    const allowedOrigin = new URL(appUrl).origin;
    if (origin !== allowedOrigin) {
      return NextResponse.json({ error: { code: 'forbidden' } }, { status: 403 });
    }
  }

  const { code, redirect_uri } = await request.json();
  if (!code) {
    return NextResponse.json({ error: { message: 'No code provided' } }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: { message: 'Server config error' } }, { status: 500 });
  }

  // Exchange authorization code for tokens
  // redirect_uri must match what was used in the authorization request
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
      { error: { message: tokenData.error_description || 'Token exchange failed' } },
      { status: 400 }
    );
  }

  return NextResponse.json({ id_token: tokenData.id_token });
}
