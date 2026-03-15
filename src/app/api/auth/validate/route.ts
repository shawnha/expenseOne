import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  // CSRF protection: reject cross-origin requests
  const origin = request.headers.get('origin');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (origin && appUrl) {
    const allowedOrigin = new URL(appUrl).origin;
    if (origin !== allowedOrigin) {
      return NextResponse.json({ error: { code: 'forbidden' } }, { status: 403 });
    }
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.json({ error: { code: 'no_email' } }, { status: 401 });
  }

  const email = user.email;

  // Validate email domain
  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN;
  if (!allowedDomain) {
    console.error('ALLOWED_EMAIL_DOMAIN environment variable is not set.');
    return NextResponse.json({ error: { code: 'config' } }, { status: 500 });
  }

  const emailDomain = email.split('@')[1];
  if (emailDomain !== allowedDomain) {
    return NextResponse.json({ error: { code: 'domain' } }, { status: 403 });
  }

  // Check if user exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id, is_active, onboarding_completed')
    .eq('id', user.id)
    .single();

  if (existingUser) {
    if (!existingUser.is_active) {
      return NextResponse.json({ error: { code: 'inactive' } }, { status: 403 });
    }
    if (!existingUser.onboarding_completed) {
      return NextResponse.json({ redirect: '/onboarding' });
    }
    return NextResponse.json({ ok: true });
  }

  // First login: create user record
  const name =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    email.split('@')[0];

  const profileImageUrl =
    user.user_metadata?.avatar_url ||
    user.user_metadata?.picture ||
    null;

  // shawn@hanah1.com is the initial admin
  const role = email === 'shawn@hanah1.com' ? 'ADMIN' : 'MEMBER';

  const { error: insertError } = await supabase.from('users').insert({
    id: user.id,
    email,
    name,
    role,
    profile_image_url: profileImageUrl,
    is_active: true,
  });

  if (insertError) {
    console.error('User registration error:', insertError.message);
  }

  return NextResponse.json({ redirect: '/onboarding' });
}
