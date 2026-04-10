'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { backendConfig } from '@/lib/config';

const TYPE_CONFIGS: Record<string, { fields: { key: string; label: string; type?: string; placeholder?: string }[] }> = {
  slack: {
    fields: [
      { key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://hooks.slack.com/services/...' },
      { key: 'channel', label: 'Channel (optional)', placeholder: '#alerts' },
    ],
  },
  jira: {
    fields: [
      { key: 'baseUrl', label: 'JIRA Base URL', placeholder: 'https://mycompany.atlassian.net' },
      { key: 'email', label: 'Email' },
      { key: 'apiToken', label: 'API Token', type: 'password' },
      { key: 'projectKey', label: 'Project Key', placeholder: 'PROJ' },
      { key: 'issueType', label: 'Issue Type (optional)', placeholder: 'Task' },
    ],
  },
  webhook: {
    fields: [
      { key: 'url', label: 'Webhook URL', placeholder: 'https://example.com/webhook' },
      { key: 'secret', label: 'HMAC Secret (optional)', type: 'password' },
    ],
  },
};

export default function NewIntegrationPage() {
  const router = useRouter();
  const [type, setType] = useState<string>('');
  const [name, setName] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!type || !name) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${backendConfig.backendUrl}/api/v1/tenant/integrations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${backendConfig.secretKey}`,
        },
        body: JSON.stringify({ type, name, config }),
      });
      if (res.ok) {
        const data = await res.json() as { integration: { id: string } };
        // Add default trigger
        await fetch(`${backendConfig.backendUrl}/api/v1/tenant/integrations/${data.integration.id}/triggers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${backendConfig.secretKey}`,
          },
          body: JSON.stringify({ eventType: 'frustration_high' }),
        });
        router.push('/settings/integrations');
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? 'Failed to create');
      }
    } catch { setError('Failed to create'); }
    setSaving(false);
  }

  async function handleTest() {
    if (!type) return;
    setTesting(true);
    setTestResult(null);
    try {
      // Create temp, test, then delete
      const res = await fetch(`${backendConfig.backendUrl}/api/v1/tenant/integrations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${backendConfig.secretKey}`,
        },
        body: JSON.stringify({ type, name: `test-${Date.now()}`, config, enabled: false }),
      });
      if (res.ok) {
        const data = await res.json() as { integration: { id: string } };
        const testRes = await fetch(`${backendConfig.backendUrl}/api/v1/tenant/integrations/${data.integration.id}/test`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${backendConfig.secretKey}` },
        });
        setTestResult(await testRes.json() as { ok: boolean; error?: string });
        // Cleanup
        await fetch(`${backendConfig.backendUrl}/api/v1/tenant/integrations/${data.integration.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${backendConfig.secretKey}` },
        });
      }
    } catch { setTestResult({ ok: false, error: 'Test failed' }); }
    setTesting(false);
  }

  const fields = TYPE_CONFIGS[type]?.fields ?? [];
  const inputCls = 'w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500';

  return (
    <div className="max-w-lg space-y-6">
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <h2 className="mb-4 text-base font-medium text-gray-800 dark:text-gray-200">New Integration</h2>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
            <select value={type} onChange={e => { setType(e.target.value); setConfig({}); }} aria-label="Select type" className={inputCls}>
              <option value="">Select type...</option>
              <option value="slack">Slack</option>
              <option value="jira">JIRA</option>
              <option value="webhook">Webhook</option>
            </select>
          </div>

          {type && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder={`My ${type} integration`} aria-label="Name" className={inputCls} />
              </div>

              {fields.map(f => (
                <div key={f.key}>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{f.label}</label>
                  <input
                    type={f.type ?? 'text'}
                    value={config[f.key] ?? ''}
                    onChange={e => setConfig(c => ({ ...c, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    aria-label={f.label}
                    className={inputCls}
                  />
                </div>
              ))}
            </>
          )}

          {error && <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>}
          {testResult && (
            <div className={`rounded-md border px-3 py-2 text-sm ${testResult.ok ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400' : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400'}`}>
              {testResult.ok ? 'Connection successful!' : `Test failed: ${testResult.error}`}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving || !type || !name}
              aria-label="Create integration" className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-amber-400 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create'}
            </button>
            {type && (
              <button onClick={handleTest} disabled={testing}
                aria-label="Test connection" className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
