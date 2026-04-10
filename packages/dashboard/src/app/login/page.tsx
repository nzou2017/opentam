'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiLogin, apiGetSsoConfig, apiSsoGoogle, apiValidate2FA } from '@/lib/api';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (el: HTMLElement, config: any) => void;
        };
      };
    };
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 2FA state
  const [needs2FA, setNeeds2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [totpCode, setTotpCode] = useState('');

  // SSO state
  const [ssoConfig, setSsoConfig] = useState<{ google: { enabled: boolean; clientId?: string } } | null>(null);

  useEffect(() => {
    apiGetSsoConfig().then(setSsoConfig).catch(() => {});
  }, []);

  // Load Google Identity Services if enabled
  useEffect(() => {
    if (!ssoConfig?.google?.enabled || !ssoConfig.google.clientId) return;

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: ssoConfig.google.clientId,
          callback: handleGoogleCallback,
        });
        const btnEl = document.getElementById('google-signin-btn');
        if (btnEl) {
          window.google.accounts.id.renderButton(btnEl, {
            theme: 'outline',
            size: 'large',
            width: '100%',
          });
        }
      }
    };
    document.head.appendChild(script);
    return () => { script.remove(); };
  }, [ssoConfig]);

  const handleGoogleCallback = useCallback(async (response: any) => {
    setError('');
    setLoading(true);
    try {
      const { token } = await apiSsoGoogle(response.credential);
      await fetch('/api/auth/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google SSO failed');
    } finally {
      setLoading(false);
    }
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await apiLogin(email, password);

      // Handle 2FA
      if (result.requires2FA && result.tempToken) {
        setTempToken(result.tempToken);
        setNeeds2FA(true);
        setLoading(false);
        return;
      }

      if (!result.token) {
        throw new Error('Login failed: no token received');
      }

      await fetch('/api/auth/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: result.token }),
      });

      // Check mustChangePassword
      if (result.mustChangePassword) {
        router.push('/change-password');
      } else {
        router.push('/');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handle2FASubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await apiValidate2FA(tempToken, totpCode);
      await fetch('/api/auth/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: result.token }),
      });

      if (result.mustChangePassword) {
        router.push('/change-password');
      } else {
        router.push('/');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid 2FA code');
    } finally {
      setLoading(false);
    }
  }

  // 2FA input view
  if (needs2FA) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-950">
        <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-900 p-8 shadow-lg">
          <div className="mb-6 flex items-center justify-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 font-bold text-gray-900 text-xl shadow-[0_0_12px_3px_rgba(245,158,11,0.6)]">
              Q
            </div>
            <span className="text-xl font-semibold text-gray-900 dark:text-gray-100">OpenTAM</span>
          </div>

          <h1 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">Two-Factor Authentication</h1>
          <p className="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Enter the 6-digit code from your authenticator app, or a backup code.
          </p>

          <form onSubmit={handle2FASubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Code</label>
              <input
                type="text"
                required
                autoFocus
                maxLength={8}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="000000"
                aria-label="Two-factor authentication code"
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm text-center tracking-widest shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            {error && (
              <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              aria-label="Verify"
              className="w-full rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-amber-400 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </form>

          <button
            onClick={() => { setNeeds2FA(false); setTempToken(''); setTotpCode(''); setError(''); }}
            aria-label="Back to login"
            className="mt-4 w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-950">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-900 p-8 shadow-lg">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 font-bold text-gray-900 text-xl shadow-[0_0_12px_3px_rgba(245,158,11,0.6)]">
            Q
          </div>
          <span className="text-xl font-semibold text-gray-900 dark:text-gray-100">OpenTAM</span>
        </div>

        <h1 className="mb-6 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">Sign in</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-label="Password"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {error && (
            <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            aria-label="Sign in"
            className="w-full rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-amber-400 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="mt-3 text-right">
          <Link href="/forgot-password" className="text-sm text-amber-600 hover:text-amber-500">
            Forgot password?
          </Link>
        </div>

        {/* Google SSO */}
        {ssoConfig?.google?.enabled && (
          <>
            <div className="my-4 flex items-center gap-3">
              <hr className="flex-1 border-gray-200 dark:border-gray-700" />
              <span className="text-xs text-gray-400 dark:text-gray-500">or</span>
              <hr className="flex-1 border-gray-200 dark:border-gray-700" />
            </div>
            <div id="google-signin-btn" className="flex justify-center" />
          </>
        )}

      </div>
    </div>
  );
}
