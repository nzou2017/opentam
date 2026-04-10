'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { DataTable } from '@/components/DataTable';
import type { Column } from '@/components/DataTable';

interface InterventionLog {
  id: string;
  createdAt: string;
  sessionId: string;
  elementId?: string | null;
  action: string;
  resolved: boolean;
}

const columns: Column<InterventionLog>[] = [
  {
    key: 'createdAt',
    header: 'Time',
    sortable: true,
    render: (row) => (
      <span className="whitespace-nowrap text-gray-600 dark:text-gray-400">
        {new Date(row.createdAt).toLocaleString()}
      </span>
    ),
  },
  {
    key: 'sessionId',
    header: 'Session',
    sortable: true,
    filterable: true,
    render: (row) => (
      <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{row.sessionId}</span>
    ),
  },
  {
    key: 'elementId',
    header: 'URL / Element',
    sortable: true,
    filterable: true,
    render: (row) => (
      <span className="text-gray-700 dark:text-gray-300">{row.elementId ?? '\u2014'}</span>
    ),
  },
  {
    key: 'action',
    header: 'Action',
    sortable: true,
    filterable: true,
    render: (row) => (
      <span className="inline-flex rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
        {row.action}
      </span>
    ),
  },
  {
    key: 'resolved',
    header: 'Resolved',
    sortable: true,
    render: (row) =>
      row.resolved ? (
        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
          Yes
        </span>
      ) : (
        <span className="text-gray-400">No</span>
      ),
  },
];

export function InterventionLogsTable({ logs }: { logs: InterventionLog[] }) {
  return (
    <DataTable
      columns={columns}
      data={logs}
      rowKey={(row) => row.id}
      searchable
      searchPlaceholder="Search interventions..."
      emptyMessage="No interventions yet."
      pageSize={10}
    />
  );
}
