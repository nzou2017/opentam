'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { backendConfig } from '@/lib/config';

export default function EditIntegrationPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [integration, setIntegration] = useState<any>(null);
  const [triggers, setTriggers] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [newEventType, setNewEventType] = useState('frustration_high');

  function load() {
    fetch(`${backendConfig.backendUrl}/api/v1/tenant/integrations/${id}`, {
      headers: { Authorization: `Bearer ${backendConfig.secretKey}` },
    })
      .then(r => r.json())
      .then(data => {
        setIntegration(data.integration);
        setTriggers(data.triggers ?? []);
        setName(data.integration?.name ?? '');
      })
      .catch(() => {});
  }

  useEffect(() => { load(); }, [id]);

  async function handleSave() {
    setSaving(true);
    await fetch(`${backendConfig.backendUrl}/api/v1/tenant/integrations/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${backendConfig.secretKey}`,
      },
      body: JSON.stringify({ name }),
    });
    setSaving(false);
    load();
  }

  async function handleTest() {
    const res = await fetch(`${backendConfig.backendUrl}/api/v1/tenant/integrations/${id}/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${backendConfig.secretKey}` },
    });
    const result = await res.json() as { ok: boolean; error?: string };
    alert(result.ok ? 'Test notification sent!' : `Failed: ${result.error}`);
  }

  async function addTrigger() {
    await fetch(`${backendConfig.backendUrl}/api/v1/tenant/integrations/${id}/triggers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${backendConfig.secretKey}`,
      },
      body: JSON.stringify({ eventType: newEventType }),
    });
    load();
  }

  async function deleteTrigger(triggerId: string) {
    await fetch(`${backendConfig.backendUrl}/api/v1/tenant/integrations/${id}/triggers/${triggerId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${backendConfig.secretKey}` },
    });
    load();
  }

  if (!integration) return <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>;

  const inputCls = 'w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500';

  return (
    <div className="max-w-lg space-y-6">
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <h2 className="mb-4 text-base font-medium text-gray-800 dark:text-gray-200">Edit: {integration.name}</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} aria-label="Name" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
            <span className="text-sm text-gray-600 dark:text-gray-400 capitalize">{integration.type}</span>
          </div>
          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving}
              aria-label="Save integration" className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-amber-400 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={handleTest}
              aria-label="Send test notification" className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
              Send Test
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <h2 className="mb-4 text-base font-medium text-gray-800 dark:text-gray-200">Triggers</h2>
        <div className="space-y-3">
          {triggers.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between rounded border border-gray-100 dark:border-gray-700 px-3 py-2">
              <code className="text-sm text-gray-700 dark:text-gray-300">{t.eventType}</code>
              <button onClick={() => deleteTrigger(t.id)} aria-label="Remove trigger" className="text-xs text-red-500 hover:text-red-700">Remove</button>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <select value={newEventType} onChange={e => setNewEventType(e.target.value)} aria-label="Select event type" className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm">
              <option value="frustration_high">frustration_high</option>
              <option value="chat_started">chat_started</option>
              <option value="intervention_resolved">intervention_resolved</option>
            </select>
            <button onClick={addTrigger}
              aria-label="Add trigger" className="rounded-md border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Add Trigger
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
