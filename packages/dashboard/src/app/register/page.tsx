'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiRegister, apiGetInvitePreview, apiCheckTenantName } from '@/lib/api';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite') ?? '';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Duplicate-workspace check — warn before silently creating a second,
  // disconnected tenant for a company that's already signed up.
  const [checkingTenant, setCheckingTenant] = useState(false);
  const [tenantExists, setTenantExists] = useState(false);
  const [confirmedDuplicate, setConfirmedDuplicate] = useState(false);

  function handleTenantNameChange(value: string) {
    setTenantName(value);
    setTenantExists(false);
    setConfirmedDuplicate(false);
  }

  // Invite preview — if ?invite= is present, this is a "join my company's
  // workspace" signup rather than a "create a new workspace" one.
  const [invite, setInvite] = useState<{ email: string; role: string; tenantName: string } | null>(null);
  const [inviteError, setInviteError] = useState('');

  useEffect(() => {
    if (!inviteToken) return;
    apiGetInvitePreview(inviteToken)
      .then((preview) => {
        setInvite(preview);
        setEmail(preview.email);
      })
      .catch((err) => setInviteError(err instanceof Error ? err.message : 'This invite link is invalid or has expired.'));
  }, [inviteToken]);

  async function doRegister() {
    setError('');
    setLoading(true);
    try {
      const { token } = await apiRegister({
        email,
        password,
        name,
        tenantName: invite ? undefined : (tenantName || undefined),
        inviteToken: invite ? inviteToken : undefined,
      });
      await fetch('/api/auth/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!invite && tenantName.trim() && !confirmedDuplicate) {
      setCheckingTenant(true);
      const { exists } = await apiCheckTenantName(tenantName.trim()).catch(() => ({ exists: false }));
      setCheckingTenant(false);
      if (exists) {
        setTenantExists(true);
        return;
      }
    }

    await doRegister();
  }

  function handleContinueAnyway() {
    setConfirmedDuplicate(true);
    setTenantExists(false);
    doRegister();
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

        <h1 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">
          {invite ? `Join ${invite.tenantName}` : 'Create account'}
        </h1>
        {invite && (
          <p className="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
            You're joining as a {invite.role}.
          </p>
        )}
        {!invite && <div className="mb-6" />}

        {inviteError && (
          <div className="mb-4 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            {inviteError} You can still create your own workspace below.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Name"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
            <input
              type="email"
              required
              disabled={!!invite}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-60"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-label="Password"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
          {!invite && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Company / workspace name <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={tenantName}
                onChange={(e) => handleTenantNameChange(e.target.value)}
                placeholder="My Company"
                aria-label="Workspace name"
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          )}

          {tenantExists && (
            <div className="space-y-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-3 text-sm text-amber-800 dark:text-amber-300">
              <p>
                A workspace named <strong>&ldquo;{tenantName}&rdquo;</strong> already exists. If you're joining
                an existing team, ask your workspace admin to send you an invite link instead — that adds
                you to their exact workspace with the right role.
              </p>
              <button
                type="button"
                onClick={handleContinueAnyway}
                disabled={loading}
                aria-label="Continue and create a separate workspace"
                className="font-medium text-amber-900 dark:text-amber-200 underline hover:no-underline disabled:opacity-50"
              >
                Continue anyway and create a separate workspace
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {!tenantExists && (
            <button
              type="submit"
              disabled={loading || checkingTenant}
              aria-label={invite ? 'Join workspace' : 'Create account'}
              className="w-full rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-amber-400 disabled:opacity-50"
            >
              {checkingTenant ? 'Checking...' : loading ? 'Creating account...' : invite ? 'Join workspace' : 'Create account'}
            </button>
          )}
        </form>

        <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-amber-600 hover:text-amber-500">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-950"><p className="text-gray-500">Loading...</p></div>}>
      <RegisterForm />
    </Suspense>
  );
}
