'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useState, useEffect } from 'react';
import { getLicenseInfo } from '@/lib/api';
import { UpgradePrompt } from '@/components/UpgradePrompt';

export default function SSOSettingsPage() {
  const [licensed, setLicensed] = useState<boolean | null>(null);
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('q_token');
    if (token) {
      getLicenseInfo(token).then((info) => {
        setLicensed(info.licensed && info.features.includes('sso'));
      }).catch(() => setLicensed(false));
    }
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      // In the current implementation, SSO is configured via environment variables.
      // Future: save to tenant settings via API
      setMessage('SSO configuration is managed via environment variables. Set GOOGLE_CLIENT_ID on the backend to enable Google SSO.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (licensed === false) {
    return <UpgradePrompt feature="Single Sign-On (SSO)" description="Enable Google SSO and other identity providers with the Enterprise plan." />;
  }

  return (
    <div>
      <div className="max-w-2xl">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Single Sign-On (SSO)</h2>

        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 space-y-6">
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Google SSO</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Allow users to sign in with their Google account. SSO is additive &mdash; email/password login always remains available.
            </p>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex items-center gap-3">
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={googleEnabled}
                    onChange={(e) => setGoogleEnabled(e.target.checked)}
                    aria-label="Toggle Google SSO"
                    className="peer sr-only"
                  />
                  <div className="h-6 w-11 rounded-full bg-gray-200 dark:bg-gray-700 peer-checked:bg-amber-500 peer-focus:ring-2 peer-focus:ring-amber-500/50 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full" />
                </label>
                <span className="text-sm text-gray-700 dark:text-gray-300">Enable Google SSO</span>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Google Client ID</label>
                <input
                  type="text"
                  value={googleClientId}
                  onChange={(e) => setGoogleClientId(e.target.value)}
                  placeholder="123456789-abc.apps.googleusercontent.com"
                  aria-label="Google Client ID"
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  Get this from the Google Cloud Console. Currently configured via the GOOGLE_CLIENT_ID environment variable on the backend.
                </p>
              </div>

              {message && (
                <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                aria-label="Save SSO settings"
                className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-amber-400 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
