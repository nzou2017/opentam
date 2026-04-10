'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useState } from 'react';
import Link from 'next/link';
import { apiForgotPassword } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await apiForgotPassword(email);
      setSuccess(true);
      if (result.resetToken) {
        setResetToken(result.resetToken);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request password reset');
    } finally {
      setLoading(false);
    }
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

        <h1 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">Forgot Password</h1>
        <p className="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Enter your email address and we will send you a password reset link.
        </p>

        {success ? (
          <div className="space-y-4">
            <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-3 py-3 text-sm text-green-700 dark:text-green-400">
              If an account exists with that email, a password reset has been initiated.
            </div>

            {resetToken && (
              <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-3 text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-300 mb-1">Dev Mode: Reset Token</p>
                <p className="text-amber-700 dark:text-amber-400 break-all font-mono text-xs">{resetToken}</p>
                <Link
                  href={`/reset-password?token=${resetToken}`}
                  className="mt-2 inline-block text-amber-600 hover:text-amber-500 font-medium"
                >
                  Reset password now
                </Link>
              </div>
            )}
          </div>
        ) : (
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

            {error && (
              <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              aria-label="Send reset link"
              className="w-full rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-amber-400 disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
          <Link href="/login" className="font-medium text-amber-600 hover:text-amber-500">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
