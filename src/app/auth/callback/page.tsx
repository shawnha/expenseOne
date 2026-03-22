'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Suspense } from 'react';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handled = useRef(false);
  const [status, setStatus] = useState('로그인 처리 중...');
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  useEffect(() => {
    // Dismiss the PWA brand splash (root layout inline HTML)
    if (typeof window !== "undefined" && (window as unknown as Record<string, () => void>).__splashDismiss) {
      (window as unknown as Record<string, () => void>).__splashDismiss();
    }
  }, []);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const handleCallback = async () => {
      const supabase = createClient();
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      const errorDesc = searchParams.get('error_description');

      addLog(`code=${code ? 'yes' : 'no'}, state=${state || 'none'}, error=${error || 'none'}`);

      if (error) {
        addLog(`Error: ${error} - ${errorDesc}`);
        setStatus(`오류: ${errorDesc || error}`);
        setTimeout(() => router.replace(`/login?error=auth_failed&debug=${encodeURIComponent(errorDesc || error)}`), 3000);
        return;
      }

      // Flow A: Direct Google OAuth (mobile)
      const savedState = sessionStorage.getItem('oauth_state');
      sessionStorage.removeItem('oauth_state');
      if (state?.startsWith('google_direct_') && state === savedState && code) {
        addLog('Direct Google flow');
        setStatus('인증 코드 교환 중...');
        try {
          const redirectUri = `${window.location.origin}/auth/callback`;
          const exchangeRes = await fetch('/api/auth/google-exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, redirect_uri: redirectUri }),
          });
          addLog(`Exchange: ${exchangeRes.status}`);
          const exchangeResult = await exchangeRes.json();

          if (!exchangeRes.ok || !exchangeResult.id_token) {
            addLog(`Exchange fail: ${JSON.stringify(exchangeResult)}`);
            setStatus(`코드 교환 실패 (${exchangeRes.status})`);
            return;
          }

          setStatus('세션 설정 중...');
          addLog('Calling signInWithIdToken');
          const { error: signInError } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: exchangeResult.id_token,
          });

          if (signInError) {
            addLog(`signInWithIdToken fail: ${signInError.message}`);
            setStatus(`세션 실패: ${signInError.message}`);
            return;
          }
          addLog('signInWithIdToken success');
        } catch (err) {
          addLog(`Exception: ${err}`);
          setStatus('코드 교환 중 오류');
          return;
        }
      }

      // Flow B: Supabase PKCE (Safari / PC)
      if (code && !state?.startsWith('google_direct_')) {
        addLog('Supabase PKCE flow');
        setStatus('인증 코드 교환 중...');
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          addLog(`PKCE fail: ${exchangeError.message}`);
          router.replace(`/login?error=auth_failed&debug=${encodeURIComponent(exchangeError.message)}`);
          return;
        }
        addLog('PKCE success');
      }

      // Verify session
      setStatus('세션 확인 중...');
      const { data: { session } } = await supabase.auth.getSession();
      addLog(`Session: ${session ? 'yes' : 'no'}`);

      if (!session) {
        setStatus('세션을 찾을 수 없습니다');
        return;
      }

      // Validate user
      setStatus('사용자 확인 중...');
      try {
        const res = await fetch('/api/auth/validate', { method: 'POST' });
        const result = await res.json();
        addLog(`Validate: ${res.status}`);

        if (!res.ok) {
          await supabase.auth.signOut();
          router.replace(`/login?error=${result.error?.code || 'auth_failed'}`);
          return;
        }

        router.replace(result.redirect || '/');
      } catch (err) {
        addLog(`Validate error: ${err}`);
        await supabase.auth.signOut();
        router.replace('/login?error=auth_failed');
      }
    };

    handleCallback();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="text-center w-full max-w-md">
        <div className="size-6 border-2 border-[var(--apple-blue)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[var(--apple-secondary-label)] mb-4">{status}</p>
        {logs.length > 0 && (
          <div className="text-left bg-black/5 rounded-lg p-3 text-[11px] text-[#8e8e93] space-y-1 max-h-[300px] overflow-y-auto">
            {logs.map((log, i) => (
              <p key={i} className="break-all">{log}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <div className="size-6 border-2 border-[var(--apple-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
