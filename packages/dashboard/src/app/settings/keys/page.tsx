'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useState, useEffect } from 'react';
import { backendConfig } from '@/lib/config';

export default function KeysSettingsPage() {
  const [keys, setKeys] = useState<{ sdkKey: string; secretKey: string } | null>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${backendConfig.backendUrl}/api/v1/tenant/keys`, {
      headers: { Authorization: `Bearer ${backendConfig.secretKey}` },
    })
      .then(r => r.json())
      .then(setKeys)
      .catch(() => {});
  }, []);

  async function handleRegenerate(keyType: 'sdk' | 'secret') {
    if (!confirm(`Regenerate ${keyType} key? The old key will stop working immediately.`)) return;
    setRegenerating(keyType);
    try {
      const res = await fetch(`${backendConfig.backendUrl}/api/v1/tenant/keys/regenerate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${backendConfig.secretKey}`,
        },
        body: JSON.stringify({ keyType }),
      });
      if (res.ok) {
        const data = await res.json() as { key: string };
        setKeys(prev => prev ? {
          ...prev,
          [keyType === 'sdk' ? 'sdkKey' : 'secretKey']: data.key,
        } : null);
      }
    } catch { /* ignore */ }
    setRegenerating(null);
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <h2 className="mb-4 text-base font-medium text-gray-800 dark:text-gray-200">API Keys</h2>
        {!keys ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">SDK Key</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm font-mono text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                  {keys.sdkKey}
                </code>
                <button
                  onClick={() => handleRegenerate('sdk')}
                  disabled={regenerating !== null}
                  aria-label="Regenerate SDK key"
                  className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                >
                  {regenerating === 'sdk' ? '...' : 'Regenerate'}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Secret Key</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm font-mono text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                  {keys.secretKey}
                </code>
                <button
                  onClick={() => handleRegenerate('secret')}
                  disabled={regenerating !== null}
                  aria-label="Regenerate secret key"
                  className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                >
                  {regenerating === 'secret' ? '...' : 'Regenerate'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
