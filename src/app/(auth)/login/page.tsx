'use client';

import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { ExpenseOneLogo } from '@/components/layout/expense-one-logo';

const GOOGLE_CLIENT_ID = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '').trim();

const ERROR_MESSAGES: Record<string, string> = {
  domain: '허용되지 않은 이메일 도메인입니다. 회사 이메일로 로그인해 주세요.',
  auth_failed: '인증에 실패했습니다. 다시 시도해 주세요.',
  no_code: '인증 코드가 없습니다. 다시 시도해 주세요.',
  no_email: '이메일 정보를 가져올 수 없습니다.',
  inactive: '비활성화된 계정입니다. 관리자에게 문의해 주세요.',
  forbidden: '접근 권한이 없습니다.',
  exchange_failed: 'Google 인증에 실패했습니다. 다시 시도해 주세요.',
};

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const errorCode = searchParams.get('error');
  const debugMsg = searchParams.get('debug');
  const redirectTo = searchParams.get('redirectTo');
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : null;

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    sessionStorage.removeItem("expense-one-splash-shown");
    // Dismiss PWA brand splash
    if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).__splashDismiss) {
      (window as unknown as Record<string, () => void>).__splashDismiss();
    }
    // If already authenticated, redirect to home (prevents back-button to login)
    if (!errorCode) {
      import('@/lib/supabase/client').then(({ createClient }) => {
        const supabase = createClient();
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) router.replace('/');
        });
      });
    }
  }, []);

  const handleLogin = () => {
    if (loading) return;
    setLoading(true);

    // Direct Google OAuth for all devices (avoids PKCE cookie issues with SSR)
    const callbackUrl = `${window.location.origin}/auth/callback`;
    const stateValue = `google_direct_${crypto.randomUUID()}`;
    sessionStorage.setItem('oauth_state', stateValue);
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      prompt: 'select_account',
      state: stateValue,
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  };

  return (
    <div className="flex h-dvh items-center justify-center px-4 relative overflow-y-auto">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <div className="flex items-center text-[var(--apple-secondary-label)] opacity-60">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 2v4" />
            <path d="M11 2v4" />
            <path d="M5 6h8a2 2 0 0 1 2 2v2a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8a2 2 0 0 1 2-2z" />
            <path d="M9 14v4a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2v-1" />
          </svg>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-0.5 animate-plug-out">
            <path d="M4 12h6" />
            <path d="M14 12h6" />
          </svg>
        </div>
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="glass-strong p-6 sm:p-8 lg:p-10 text-center rounded-2xl">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center size-16 sm:size-20 rounded-2xl bg-gradient-to-br from-[#EF3B2D] to-[#D42B1F] shadow-[0_4px_16px_rgba(239,59,45,0.3)] mb-4 sm:mb-5">
              <svg viewBox="0 0 100 100" className="size-8 sm:size-10" fill="none">
                <path d="M38 8 A45 45 0 1 0 62 92" stroke="white" strokeWidth="14" strokeLinecap="round" fill="none" />
                <path d="M62 92 A45 45 0 0 0 38 8" stroke="white" strokeWidth="14" strokeLinecap="round" fill="none" />
              </svg>
            </div>
            <h1><ExpenseOneLogo size="lg" /></h1>
            <p className="text-sm sm:text-[15px] text-[var(--apple-secondary-label)] mt-1.5">
              팀 비용을 효율적으로 관리하세요
            </p>
          </div>

          <div className="space-y-4">
            {errorMessage && (
              <div className="px-4 py-3 text-sm text-[var(--apple-red)] rounded-2xl bg-[rgba(255,59,48,0.08)] backdrop-blur-sm border border-[rgba(255,59,48,0.12)]">
                {errorMessage}
                {debugMsg && (
                  <p className="mt-1 text-xs text-[#8e8e93] break-all">{debugMsg}</p>
                )}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2.5 h-[52px] rounded-full text-[15px] font-medium bg-[rgba(255,255,255,0.7)] backdrop-blur-xl border border-[rgba(0,0,0,0.06)] hover:bg-[rgba(255,255,255,0.85)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 text-[var(--apple-label)] disabled:opacity-50"
            >
              {loading ? (
                <div className="size-5 border-2 border-[var(--apple-blue)] border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              )}
              Google 계정으로 로그인
            </button>

            <p className="text-[13px] text-[var(--apple-secondary-label)]">
              HanahOne 계정으로 로그인해주세요
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <p className="text-[#8e8e93]">로딩 중...</p>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
