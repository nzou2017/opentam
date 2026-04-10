'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getWorkflows, deleteWorkflow, publishWorkflow } from '@/lib/api';
import { DataTable } from '@/components/DataTable';
import type { Column } from '@/components/DataTable';

interface Workflow {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'published' | 'archived';
  source: 'manual' | 'learned' | 'imported';
  tags?: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

const statusColors: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  published: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  archived: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [referenceWorkflows, setReferenceWorkflows] = useState<Workflow[]>([]);
  const [showReference, setShowReference] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkflows();
  }, []);

  async function loadWorkflows() {
    setLoading(true);
    try {
      const data = await getWorkflows(undefined, null, true);
      setWorkflows(data.workflows);
      setReferenceWorkflows(data.referenceWorkflows ?? []);
    } catch (err) {
      console.error('Failed to load workflows:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this workflow?')) return;
    try {
      await deleteWorkflow(id);
      setWorkflows(workflows.filter((w) => w.id !== id));
    } catch (err) {
      console.error('Failed to delete workflow:', err);
    }
  }

  async function handlePublish(id: string) {
    try {
      const data = await publishWorkflow(id);
      setWorkflows(workflows.map((w) => (w.id === id ? data.workflow : w)));
    } catch (err) {
      console.error('Failed to publish workflow:', err);
    }
  }

  const columns: Column<Workflow>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      filterable: true,
      render: (w) => (
        <div>
          <Link href={`/workflows/${w.id}`} className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
            {w.name}
          </Link>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{w.description}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      filterable: true,
      render: (w) => (
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[w.status]}`}>
          {w.status}
        </span>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      sortable: true,
      filterable: true,
      render: (w) => <span className="text-gray-600 dark:text-gray-400">{w.source}</span>,
    },
    {
      key: 'version',
      header: 'Steps',
      sortable: true,
      render: (w) => <span className="text-gray-600 dark:text-gray-400">{w.version}</span>,
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      sortable: true,
      render: (w) => (
        <span className="text-gray-500 dark:text-gray-400">{new Date(w.updatedAt).toLocaleDateString()}</span>
      ),
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Workflows</h1>
        <Link
          href="/workflows/new"
          aria-label="Create new workflow"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          New Workflow
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      ) : (
        <DataTable
          columns={columns}
          data={workflows}
          rowKey={(w) => w.id}
          searchable
          searchPlaceholder="Search workflows..."
          emptyMessage="No workflows found."
          pageSize={20}
          actions={(w) => (
            <div className="flex gap-2">
              {w.status === 'draft' && (
                <button
                  onClick={() => handlePublish(w.id)}
                  aria-label="Publish workflow"
                  className="text-green-600 hover:text-green-800 text-xs font-medium"
                >
                  Publish
                </button>
              )}
              <Link href={`/workflows/${w.id}`} aria-label="Edit workflow" className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">
                Edit
              </Link>
              <button
                onClick={() => handleDelete(w.id)}
                aria-label="Delete workflow"
                className="text-red-600 hover:text-red-800 text-xs font-medium"
              >
                Delete
              </button>
            </div>
          )}
        />
      )}

      {/* Reference workflows from Q admin */}
      {referenceWorkflows.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowReference(!showReference)}
            aria-label="Toggle reference workflows"
            className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
          >
            <span className="text-xs">{showReference ? '\u25BC' : '\u25B6'}</span>
            Show Q reference workflows ({referenceWorkflows.length})
          </button>

          {showReference && (
            <div className="mt-3">
              <div className="overflow-hidden rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-blue-200 dark:divide-blue-800 text-sm">
                    <thead className="bg-blue-100/60 dark:bg-blue-900/40">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Source</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-100 dark:divide-blue-800/50">
                      {referenceWorkflows.map((w) => (
                        <tr key={w.id} className="bg-blue-50/50 dark:bg-blue-900/10">
                          <td className="px-4 py-3">
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">{w.name}</span>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{w.description}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[w.status]}`}>
                              {w.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{w.source}</td>
                          <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{new Date(w.updatedAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 text-xs text-blue-600 dark:text-blue-400 border-t border-blue-200 dark:border-blue-800">
                  Read-only reference workflows from Q admin tenant
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
