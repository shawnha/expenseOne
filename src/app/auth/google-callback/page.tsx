'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Suspense } from 'react';

function GoogleCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handled = useRef(false);
  const [status, setStatus] = useState('로그인 처리 중...');

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const handleCallback = async () => {
      const code = searchParams.get('code');
      const error = searchParams.get('error');

      if (error) {
        router.replace(`/login?error=auth_failed&debug=${encodeURIComponent(error)}`);
        return;
      }

      if (!code) {
        router.replace('/login?error=no_code');
        return;
      }

      // Exchange code for id_token on our server
      setStatus('인증 코드 교환 중...');
      try {
        const exchangeRes = await fetch('/api/auth/google-exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, redirect_uri: `${window.location.origin}/auth/google-callback` }),
        });
        const exchangeResult = await exchangeRes.json();

        if (!exchangeRes.ok || !exchangeResult.id_token) {
          router.replace(`/login?error=google_exchange_failed&debug=${encodeURIComponent(exchangeResult.error?.message || 'Unknown')}`);
          return;
        }

        // Use id_token to create Supabase session (no redirect chain)
        setStatus('세션 설정 중...');
        const supabase = createClient();
        const { error: signInError } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: exchangeResult.id_token,
        });

        if (signInError) {
          router.replace(`/login?error=auth_failed&debug=${encodeURIComponent(signInError.message)}`);
          return;
        }

        // Validate user
        setStatus('사용자 확인 중...');
        const res = await fetch('/api/auth/validate', { method: 'POST' });
        const result = await res.json();

        if (!res.ok) {
          await supabase.auth.signOut();
          router.replace(`/login?error=${result.error?.code || 'auth_failed'}`);
          return;
        }

        router.replace(result.redirect || '/');
      } catch (err) {
        router.replace(`/login?error=auth_failed&debug=${encodeURIComponent(String(err))}`);
      }
    };

    handleCallback();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="text-center">
        <div className="size-6 border-2 border-[#007AFF] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[var(--apple-secondary-label)]">{status}</p>
      </div>
    </div>
  );
}

export default function GoogleCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <div className="size-6 border-2 border-[#007AFF] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <GoogleCallbackContent />
    </Suspense>
  );
}
