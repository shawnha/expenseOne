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
    if (handled.current) return;
    handled.current = true;

    const handleCallback = async () => {
      const supabase = createClient();
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      const errorDesc = searchParams.get('error_description');

      addLog(`params: code=${code ? 'yes' : 'no'}, state=${state}, error=${error || 'none'}`);

      // Google returned an error
      if (error) {
        addLog(`Google error: ${error} - ${errorDesc}`);
        setStatus(`Google 오류: ${error}`);
        setTimeout(() => {
          router.replace(`/login?error=auth_failed&debug=${encodeURIComponent(errorDesc || error)}`);
        }, 3000);
        return;
      }

      // Direct Google OAuth flow (no Supabase redirect chain)
      if (state === 'google_direct' && code) {
        addLog('Starting google_direct flow');
        setStatus('인증 코드 교환 중...');

        try {
          const redirectUri = `${window.location.origin}/auth/callback`;
          addLog(`Exchange request: redirect_uri=${redirectUri}`);

          const exchangeRes = await fetch('/api/auth/google-exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, redirect_uri: redirectUri }),
          });

          addLog(`Exchange response: status=${exchangeRes.status}`);
          const exchangeResult = await exchangeRes.json();
          addLog(`Exchange result: ${JSON.stringify(exchangeResult).substring(0, 200)}`);

          if (!exchangeRes.ok || !exchangeResult.id_token) {
            setStatus(`코드 교환 실패 (${exchangeRes.status})`);
            addLog(`Exchange failed: ${exchangeResult.error?.message || JSON.stringify(exchangeResult)}`);
            return;
          }

          addLog('id_token received, calling signInWithIdToken');
          setStatus('세션 설정 중...');

          const { error: signInError } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: exchangeResult.id_token,
          });

          if (signInError) {
            addLog(`signInWithIdToken error: ${signInError.message}`);
            setStatus(`세션 설정 실패: ${signInError.message}`);
            return;
          }

          addLog('signInWithIdToken success');
        } catch (err) {
          addLog(`Exchange exception: ${err}`);
          setStatus(`코드 교환 오류: ${String(err)}`);
          return;
        }
      }

      // Handle hash fragment (implicit flow - legacy)
      const hash = window.location.hash;
      if (hash && hash.length > 1) {
        addLog('Processing hash fragment');
        const hashParams = new URLSearchParams(hash.substring(1));
        const access_token = hashParams.get('access_token');
        const refresh_token = hashParams.get('refresh_token');

        if (access_token) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          setStatus('세션 설정 중...');
          await supabase.auth.setSession({
            access_token,
            refresh_token: refresh_token || '',
          });
          addLog('Hash session set');
        }
      }

      // Handle Supabase PKCE code (legacy/Safari flow)
      if (code && state !== 'google_direct') {
        addLog('Processing Supabase PKCE code');
        setStatus('인증 코드 교환 중...');
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          addLog(`PKCE exchange error: ${exchangeError.message}`);
          setStatus(`인증 실패: ${exchangeError.message}`);
          return;
        }
        addLog('PKCE exchange success');
      }

      // Check session
      setStatus('세션 확인 중...');
      const { data: { session } } = await supabase.auth.getSession();
      addLog(`Session: ${session ? 'exists' : 'none'}`);

      if (!session) {
        setStatus('세션을 찾을 수 없습니다');
        addLog('No session found — stopping');
        return;
      }

      // Validate user
      setStatus('사용자 확인 중...');
      try {
        const res = await fetch('/api/auth/validate', { method: 'POST' });
        const result = await res.json();
        addLog(`Validate response: ${res.status} ${JSON.stringify(result).substring(0, 200)}`);

        if (!res.ok) {
          await supabase.auth.signOut();
          setStatus(`검증 실패: ${result.error?.code || 'unknown'}`);
          return;
        }

        const destination = result.redirect || '/';
        addLog(`Redirecting to: ${destination}`);
        router.replace(destination);
      } catch (err) {
        addLog(`Validate exception: ${err}`);
        await supabase.auth.signOut();
        setStatus('검증 중 오류 발생');
      }
    };

    handleCallback();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="text-center w-full max-w-md">
        <div className="size-6 border-2 border-[#007AFF] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
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
          <div className="size-6 border-2 border-[#007AFF] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
