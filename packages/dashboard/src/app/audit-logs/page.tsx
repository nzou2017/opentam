'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useState, useEffect, useCallback } from 'react';
import { getAuditLogs } from '@/lib/api';
import { DataTable } from '@/components/DataTable';
import type { Column } from '@/components/DataTable';

interface AuditLog {
  id: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  'user.login': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'user.register': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'user.logout': 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  'user.invite': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  'user.delete': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  'user.role_update': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  'user.change_password': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'user.password_reset': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'user.profile_update': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  'settings.update': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  'workflow.create': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'workflow.update': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  'workflow.publish': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  'workflow.delete': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const ACTION_OPTIONS = [
  '',
  'user.login',
  'user.register',
  'user.logout',
  'user.invite',
  'user.delete',
  'user.role_update',
  'user.change_password',
  'user.password_reset',
  'user.profile_update',
  'settings.update',
  'tenant.key_regenerate',
  'workflow.create',
  'workflow.update',
  'workflow.publish',
  'workflow.delete',
  'map_entry.create',
  'map_entry.update',
  'map_entry.delete',
  'integration.create',
  'integration.update',
  'integration.delete',
  'feature_request.create',
  'feature_request.update',
  'feature_request.delete',
  'feature_request.vote',
];

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const limit = 20;

  const fetchLogs = useCallback(async () => {
    const token = localStorage.getItem('q_token');
    if (!token) return;
    setLoading(true);
    try {
      const params: Record<string, any> = { page, limit };
      if (actionFilter) params.action = actionFilter;
      if (userSearch.trim()) params.userId = userSearch.trim();
      const data = await getAuditLogs(token, params);
      setLogs(data.logs);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      // silently fail
    }
    setLoading(false);
  }, [page, actionFilter, userSearch]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const columns: Column<AuditLog>[] = [
    {
      key: 'createdAt',
      header: 'Time',
      sortable: false,
      render: (log) => (
        <span className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
          {formatTime(log.createdAt)}
        </span>
      ),
    },
    {
      key: 'userEmail',
      header: 'User',
      sortable: false,
      render: (log) => (
        <span className="text-sm text-gray-800 dark:text-gray-200">{log.userEmail}</span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      sortable: false,
      render: (log) => {
        const colorClass = ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
        return (
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
            {log.action}
          </span>
        );
      },
    },
    {
      key: 'resource',
      header: 'Resource',
      sortable: false,
      render: (log) => (
        <span className="text-sm text-gray-700 dark:text-gray-300">{log.resource}</span>
      ),
    },
    {
      key: 'resourceId',
      header: 'Resource ID',
      sortable: false,
      render: (log) => (
        <span className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate max-w-[120px] inline-block">
          {log.resourceId ?? '-'}
        </span>
      ),
    },
    {
      key: 'ipAddress',
      header: 'IP Address',
      sortable: false,
      render: (log) => (
        <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
          {log.ipAddress ?? '-'}
        </span>
      ),
    },
  ];

  return (
    <div className="p-6 lg:p-10">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">Audit Logs</h1>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <label className="mr-2 text-xs font-medium text-gray-600 dark:text-gray-400">Action:</label>
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            aria-label="Filter by action"
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="">All actions</option>
            {ACTION_OPTIONS.filter(Boolean).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mr-2 text-xs font-medium text-gray-600 dark:text-gray-400">User ID:</label>
          <input
            type="text"
            value={userSearch}
            onChange={(e) => { setUserSearch(e.target.value); setPage(1); }}
            placeholder="Filter by user ID..."
            aria-label="Filter by user ID"
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 w-52"
          />
        </div>

        <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
          {total} total entries
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={logs}
            pageSize={limit}
            rowKey={(log) => log.id}
            emptyMessage="No audit log entries found."
          />

          {/* Server-side pagination */}
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="Previous page"
                className="rounded px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label="Next page"
                className="rounded px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
