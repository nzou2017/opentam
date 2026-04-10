'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useEffect } from 'react';

export default function SecuritySettingsPage() {
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  // Setup flow
  const [setupSecret, setSetupSecret] = useState('');
  const [setupUrl, setSetupUrl] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [setupError, setSetupError] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  // Disable flow
  const [disablePassword, setDisablePassword] = useState('');
  const [disableError, setDisableError] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(() => setLoading(false))
      .catch(() => setLoading(false));
  }, []);

  async function handleSetup() {
    setSetupError('');
    setSetupLoading(true);
    try {
      const res = await fetch('/api/auth/2fa/setup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to setup 2FA');
      setSetupSecret(data.secret);
      setSetupUrl(data.otpauthUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to setup 2FA';
      if (msg.includes('already enabled')) {
        setTotpEnabled(true);
      }
      setSetupError(msg);
    } finally {
      setSetupLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setSetupError('');
    setSetupLoading(true);
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: setupCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Invalid verification code');
      setBackupCodes(data.backupCodes);
      setTotpEnabled(true);
      setSetupSecret('');
      setSetupUrl('');
      setSetupCode('');
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'Invalid verification code');
    } finally {
      setSetupLoading(false);
    }
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    setDisableError('');
    setDisableLoading(true);
    try {
      const res = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: disablePassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to disable 2FA');
      setTotpEnabled(false);
      setDisablePassword('');
      setBackupCodes([]);
    } catch (err) {
      setDisableError(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setDisableLoading(false);
    }
  }

  if (loading) {
    return (
      <div>
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="max-w-2xl">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Security</h2>

        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 space-y-6">
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Two-Factor Authentication (TOTP)</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Add an extra layer of security to your account by requiring a code from an authenticator app when you sign in.
            </p>

            {/* Backup codes display */}
            {backupCodes.length > 0 && (
              <div className="mb-6 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
                <h4 className="font-medium text-amber-800 dark:text-amber-300 mb-2">Backup Codes</h4>
                <p className="text-sm text-amber-700 dark:text-amber-400 mb-3">
                  Save these codes in a safe place. Each code can only be used once.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {backupCodes.map((code, i) => (
                    <code key={i} className="rounded bg-amber-100 dark:bg-amber-900/50 px-2 py-1 text-sm font-mono text-amber-800 dark:text-amber-300">
                      {code}
                    </code>
                  ))}
                </div>
              </div>
            )}

            {totpEnabled ? (
              /* Disable 2FA */
              <div>
                <div className="mb-4 flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-400">2FA is enabled</span>
                </div>

                <form onSubmit={handleDisable} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
                    <input
                      type="password"
                      required
                      value={disablePassword}
                      onChange={(e) => setDisablePassword(e.target.value)}
                      placeholder="Enter your password to disable 2FA"
                      aria-label="Password"
                      className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>

                  {disableError && (
                    <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                      {disableError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={disableLoading}
                    aria-label="Disable 2FA"
                    className="rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-400 shadow-sm transition hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50"
                  >
                    {disableLoading ? 'Disabling...' : 'Disable 2FA'}
                  </button>
                </form>
              </div>
            ) : setupSecret ? (
              /* Verify setup */
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Secret Key</label>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    Enter this key in your authenticator app (Google Authenticator, Authy, etc.):
                  </p>
                  <code className="block rounded bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 break-all">
                    {setupSecret}
                  </code>
                </div>

                <form onSubmit={handleVerify} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Verification Code</label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={setupCode}
                      onChange={(e) => setSetupCode(e.target.value)}
                      placeholder="000000"
                      aria-label="Verification code"
                      className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm text-center tracking-widest shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>

                  {setupError && (
                    <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                      {setupError}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={setupLoading}
                      aria-label="Verify and enable 2FA"
                      className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-amber-400 disabled:opacity-50"
                    >
                      {setupLoading ? 'Verifying...' : 'Verify & Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSetupSecret(''); setSetupUrl(''); setSetupCode(''); setSetupError(''); }}
                      aria-label="Cancel"
                      className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm transition hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              /* Enable 2FA button */
              <div>
                {setupError && (
                  <div className="mb-3 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                    {setupError}
                  </div>
                )}
                <button
                  onClick={handleSetup}
                  disabled={setupLoading}
                  aria-label="Enable 2FA"
                  className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-amber-400 disabled:opacity-50"
                >
                  {setupLoading ? 'Setting up...' : 'Enable 2FA'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
