'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useState, useEffect } from 'react';
import Link from 'next/link';
import { backendConfig } from '@/lib/config';
import { DataTable } from '@/components/DataTable';
import type { Column } from '@/components/DataTable';

interface Integration {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  createdAt: string;
}

const typeColors: Record<string, string> = {
  slack: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  jira: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  webhook: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
};

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);

  function load() {
    fetch(`${backendConfig.backendUrl}/api/v1/tenant/integrations`, {
      headers: { Authorization: `Bearer ${backendConfig.secretKey}` },
    })
      .then(r => r.json())
      .then((data: { integrations?: Integration[] }) => setIntegrations(data.integrations ?? []))
      .catch(() => {});
  }

  useEffect(() => { load(); }, []);

  async function toggleEnabled(id: string, enabled: boolean) {
    await fetch(`${backendConfig.backendUrl}/api/v1/tenant/integrations/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${backendConfig.secretKey}`,
      },
      body: JSON.stringify({ enabled }),
    });
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this integration?')) return;
    await fetch(`${backendConfig.backendUrl}/api/v1/tenant/integrations/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${backendConfig.secretKey}` },
    });
    load();
  }

  const columns: Column<Integration>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      filterable: true,
      render: (i) => <span className="font-medium text-gray-900 dark:text-gray-100">{i.name}</span>,
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      filterable: true,
      render: (i) => (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${typeColors[i.type] ?? 'bg-gray-100 text-gray-800'}`}>
          {i.type}
        </span>
      ),
    },
    {
      key: 'enabled',
      header: 'Enabled',
      sortable: true,
      render: (i) => (
        <button
          onClick={() => toggleEnabled(i.id, !i.enabled)}
          aria-label={`Toggle ${i.name} integration`}
          className={`rounded-full px-3 py-1 text-xs font-medium ${i.enabled ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}
        >
          {i.enabled ? 'Enabled' : 'Disabled'}
        </button>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      render: (i) => (
        <span className="text-gray-500 dark:text-gray-400">{new Date(i.createdAt).toLocaleDateString()}</span>
      ),
    },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">{integrations.length} integration(s)</p>
        <Link href="/settings/integrations/new"
          aria-label="Add integration" className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-amber-400">
          Add Integration
        </Link>
      </div>

      <DataTable
        columns={columns}
        data={integrations}
        rowKey={(i) => i.id}
        searchable
        searchPlaceholder="Search integrations..."
        emptyMessage="No integrations configured yet."
        pageSize={10}
        actions={(i) => (
          <div className="flex gap-2">
            <Link href={`/settings/integrations/${i.id}`} aria-label="Edit integration" className="text-xs text-amber-600 hover:text-amber-500">
              Edit
            </Link>
            <button onClick={() => handleDelete(i.id)} aria-label="Delete integration" className="text-xs text-red-500 hover:text-red-700">
              Delete
            </button>
          </div>
        )}
      />
    </div>
  );
}
