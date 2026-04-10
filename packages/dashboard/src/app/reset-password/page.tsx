'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiResetPassword } from '@/lib/api';
import { PasswordInput } from '@/components/PasswordInput';
import { isPasswordValid } from '@opentam/shared';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!isPasswordValid(newPassword)) {
      setError('Password does not meet the requirements');
      return;
    }

    if (!token) {
      setError('Missing reset token. Please use the link from your email.');
      return;
    }

    setLoading(true);
    try {
      await apiResetPassword(token, newPassword);
      router.push('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
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

        <h1 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">Reset Password</h1>
        <p className="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Enter your new password below.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordInput label="New Password" value={newPassword} onChange={setNewPassword} ariaLabel="New password" showPolicy />
          <PasswordInput label="Confirm Password" value={confirmPassword} onChange={setConfirmPassword} ariaLabel="Confirm password" />

          {error && (
            <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            aria-label="Reset password"
            className="w-full rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-amber-400 disabled:opacity-50"
          >
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
          <Link href="/login" className="font-medium text-amber-600 hover:text-amber-500">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-950"><p className="text-gray-500">Loading...</p></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
