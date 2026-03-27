import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { users, notifications } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { sendPushToAdmins } from '@/services/push.service';

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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.json({ error: { code: 'no_email', message: '이메일 정보를 찾을 수 없습니다.' } }, { status: 401 });
  }

  const email = user.email;

  // Validate email domain
  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN;
  if (!allowedDomain) {
    console.error('ALLOWED_EMAIL_DOMAIN environment variable is not set.');
    return NextResponse.json({ error: { code: 'config', message: '서버 설정 오류입니다.' } }, { status: 500 });
  }

  const emailDomain = email.split('@')[1];
  if (emailDomain !== allowedDomain) {
    return NextResponse.json({ error: { code: 'domain', message: '허용되지 않은 이메일 도메인입니다.' } }, { status: 403 });
  }

  // Check if user exists (using Drizzle for direct DB access, bypassing RLS)
  const [existingUser] = await db
    .select({ id: users.id, isActive: users.isActive, onboardingCompleted: users.onboardingCompleted })
    .from(users)
    .where(eq(users.id, user.id));

  if (existingUser) {
    if (!existingUser.isActive) {
      return NextResponse.json({ error: { code: 'inactive', message: '비활성화된 계정입니다.' } }, { status: 403 });
    }
    if (!existingUser.onboardingCompleted) {
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

  // Initial admin is configured via environment variable (no hardcoded fallback)
  const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL;
  const role = (initialAdminEmail && email === initialAdminEmail) ? 'ADMIN' : 'MEMBER';

  try {
    await db.insert(users).values({
      id: user.id,
      email,
      name,
      role,
      profileImageUrl,
      isActive: true,
    });

    // Notify all ADMIN users about the new team member (fire-and-forget)
    (async () => {
      try {
        const admins = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.role, 'ADMIN'), eq(users.isActive, true)));

        if (admins.length > 0) {
          const notificationValues = admins.map((admin) => ({
            recipientId: admin.id,
            type: 'NEW_USER_JOINED' as const,
            title: '새 팀원이 합류했습니다',
            message: `${name}님(${email})이 ExpenseOne에 가입했습니다.`,
            relatedExpenseId: null,
          }));

          await Promise.all(
            notificationValues.map((v) =>
              db.insert(notifications).values(v)
            )
          );
        }
        // Fire-and-forget Web Push to admins
        sendPushToAdmins(
          '새 팀원 합류',
          `${name}님이 가입했습니다`,
          '/',
        ).catch((pushErr) => console.error('[Push] 새 팀원 알림 실패:', pushErr));
      } catch (notifyError) {
        console.error('Admin notification error:', notifyError);
      }
    })();
  } catch (insertError: any) {
    console.error('User registration error:', insertError.message);
    return NextResponse.json({ error: { code: 'registration_failed', message: '계정 생성에 실패했습니다.' } }, { status: 500 });
  }

  return NextResponse.json({ redirect: '/onboarding' });
}
