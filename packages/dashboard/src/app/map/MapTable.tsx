'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FunctionalMapEntry, Platform } from '@opentam/shared';
import { DataTable } from '@/components/DataTable';
import type { Column } from '@/components/DataTable';

// ── Icon helpers ─────────────────────────────────────────────────────────────

function PencilIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type EntryForm = {
  feature: string;
  url: string;
  selector: string;
  description: string;
  preconditions: string;
  source: 'manual' | 'crawler';
  platform: Platform;
};

const emptyForm: EntryForm = {
  feature: '',
  url: '',
  selector: '',
  description: '',
  preconditions: '',
  source: 'manual',
  platform: 'web',
};

function entryToForm(e: FunctionalMapEntry): EntryForm {
  return {
    feature: e.feature,
    url: e.url,
    selector: e.selector,
    description: e.description,
    preconditions: e.preconditions?.join(', ') ?? '',
    source: e.source,
    platform: e.platform ?? 'web',
  };
}

function formToBody(f: EntryForm) {
  return {
    feature: f.feature.trim(),
    url: f.url.trim(),
    selector: f.selector.trim(),
    description: f.description.trim(),
    preconditions: f.preconditions
      ? f.preconditions.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined,
    source: f.source,
    platform: f.platform,
  };
}

const PLATFORM_LABELS: Record<Platform, string> = {
  web: 'Web',
  ios: 'iOS',
  android: 'Android',
};

const PLATFORM_BADGE_CLS: Record<Platform, string> = {
  web: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  ios: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  android: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
};

// ── Inline form row ───────────────────────────────────────────────────────────

function FormRow({
  form,
  onChange,
  onSave,
  onCancel,
  saving,
  colCount,
}: {
  form: EntryForm;
  onChange: (f: EntryForm) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  colCount: number;
}) {
  const inputCls =
    'w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400';

  return (
    <tr className="bg-amber-50 dark:bg-amber-950/30">
      <td className="px-3 py-2">
        <input
          className={inputCls}
          placeholder="Feature name"
          value={form.feature}
          onChange={(e) => onChange({ ...form, feature: e.target.value })}
          aria-label="Feature name"
        />
      </td>
      <td className="px-3 py-2">
        <input
          className={inputCls}
          placeholder="/path"
          value={form.url}
          onChange={(e) => onChange({ ...form, url: e.target.value })}
          aria-label="URL"
        />
      </td>
      <td className="px-3 py-2">
        <input
          className={inputCls}
          placeholder="#selector"
          value={form.selector}
          onChange={(e) => onChange({ ...form, selector: e.target.value })}
          aria-label="Selector"
        />
      </td>
      <td className="px-3 py-2">
        <textarea
          className={inputCls}
          rows={2}
          placeholder="Description"
          value={form.description}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          aria-label="Description"
        />
      </td>
      <td className="px-3 py-2">
        <select
          className={inputCls}
          value={form.platform}
          onChange={(e) =>
            onChange({ ...form, platform: e.target.value as Platform })
          }
          aria-label="Select platform"
        >
          <option value="web">Web</option>
          <option value="ios">iOS</option>
          <option value="android">Android</option>
        </select>
      </td>
      <td className="px-3 py-2">
        <select
          className={inputCls}
          value={form.source}
          onChange={(e) =>
            onChange({ ...form, source: e.target.value as 'manual' | 'crawler' })
          }
          aria-label="Select source"
        >
          <option value="manual">manual</option>
          <option value="crawler">crawler</option>
        </select>
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-2">
          <button
            onClick={onSave}
            disabled={saving}
            aria-label="Save map entry"
            className="rounded bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {saving ? 'Saving\u2026' : 'Save'}
          </button>
          <button
            onClick={onCancel}
            aria-label="Cancel"
            className="rounded bg-gray-200 dark:bg-gray-700 px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MapTable({
  entries,
  referenceEntries,
  backendUrl,
  secretKey,
}: {
  entries: FunctionalMapEntry[];
  referenceEntries?: FunctionalMapEntry[];
  backendUrl: string;
  secretKey: string;
}) {
  const router = useRouter();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EntryForm>(emptyForm);
  const [addingNew, setAddingNew] = useState(false);
  const [newForm, setNewForm] = useState<EntryForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReference, setShowReference] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all');

  const filteredEntries = platformFilter === 'all'
    ? entries
    : entries.filter(e => (e.platform ?? 'web') === platformFilter);

  async function handleDelete(id: string) {
    if (!confirm('Delete this entry?')) return;
    try {
      const res = await fetch(`${backendUrl}/api/v1/map/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function startEdit(entry: FunctionalMapEntry) {
    setEditingId(entry.id);
    setEditForm(entryToForm(entry));
  }

  async function handleUpdate() {
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${backendUrl}/api/v1/map/${editingId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secretKey}`,
        },
        body: JSON.stringify(formToBody(editForm)),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      setEditingId(null);
      router.refresh();
    } catch (err) {
      setError(`Update failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${backendUrl}/api/v1/map`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secretKey}`,
        },
        body: JSON.stringify(formToBody(newForm)),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      setAddingNew(false);
      setNewForm(emptyForm);
      router.refresh();
    } catch (err) {
      setError(`Create failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<FunctionalMapEntry>[] = [
    {
      key: 'feature',
      header: 'Feature',
      sortable: true,
      filterable: true,
      render: (row) => <span className="font-medium text-gray-900 dark:text-gray-100">{row.feature}</span>,
    },
    {
      key: 'url',
      header: 'URL',
      sortable: true,
      filterable: true,
      render: (row) => <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{row.url}</span>,
    },
    {
      key: 'selector',
      header: 'Selector',
      sortable: true,
      filterable: true,
      render: (row) => <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{row.selector}</span>,
    },
    {
      key: 'description',
      header: 'Description',
      sortable: true,
      className: 'max-w-xs truncate',
      render: (row) => <span className="text-gray-700 dark:text-gray-300">{row.description}</span>,
    },
    {
      key: 'platform' as keyof FunctionalMapEntry,
      header: 'Platform',
      sortable: true,
      filterable: true,
      render: (row) => {
        const p = (row.platform ?? 'web') as Platform;
        return (
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${PLATFORM_BADGE_CLS[p]}`}>
            {PLATFORM_LABELS[p]}
          </span>
        );
      },
    },
    {
      key: 'source',
      header: 'Source',
      sortable: true,
      filterable: true,
      render: (row) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            row.source === 'manual'
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
              : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
          }`}
        >
          {row.source}
        </span>
      ),
    },
  ];

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-md bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
          {error}
          <button onClick={() => setError(null)} aria-label="Dismiss" className="ml-3 font-medium underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {(['all', 'web', 'ios', 'android'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPlatformFilter(p)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                platformFilter === p
                  ? 'bg-amber-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
            >
              {p === 'all' ? 'All' : p === 'ios' ? 'iOS' : p === 'android' ? 'Android' : 'Web'}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            setAddingNew(true);
            setNewForm(emptyForm);
          }}
          aria-label="Add map entry"
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 shadow-sm"
        >
          + Add Entry
        </button>
      </div>

      <DataTable
        columns={columns}
        data={filteredEntries}
        rowKey={(row) => row.id}
        searchable
        searchPlaceholder="Search map entries..."
        emptyMessage='No map entries. Click "Add Entry" to create one.'
        pageSize={20}
        actions={(entry) => (
          <div className="flex gap-2">
            <button
              onClick={() => startEdit(entry)}
              className="text-gray-400 hover:text-amber-500 transition-colors"
              aria-label="Edit map entry"
              title="Edit"
            >
              <PencilIcon />
            </button>
            <button
              onClick={() => handleDelete(entry.id)}
              className="text-gray-400 hover:text-red-500 transition-colors"
              aria-label="Delete map entry"
              title="Delete"
            >
              <TrashIcon />
            </button>
          </div>
        )}
        renderRow={(entry) => {
          if (editingId === entry.id) {
            return (
              <FormRow
                key={entry.id}
                form={editForm}
                onChange={setEditForm}
                onSave={handleUpdate}
                onCancel={() => setEditingId(null)}
                saving={saving}
                colCount={7}
              />
            );
          }
          return null; // use default rendering
        }}
        extraRows={
          addingNew ? (
            <FormRow
              form={newForm}
              onChange={setNewForm}
              onSave={handleCreate}
              onCancel={() => setAddingNew(false)}
              saving={saving}
              colCount={7}
            />
          ) : undefined
        }
      />

      {/* Reference entries from Q admin */}
      {referenceEntries && referenceEntries.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowReference(!showReference)}
            aria-label="Toggle reference entries"
            className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
          >
            <span className="text-xs">{showReference ? '\u25BC' : '\u25B6'}</span>
            Show Q reference entries ({referenceEntries.length})
          </button>

          {showReference && (
            <div className="mt-3">
              <div className="overflow-hidden rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-blue-200 dark:divide-blue-800 text-sm">
                    <thead className="bg-blue-100/60 dark:bg-blue-900/40">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Feature</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">URL</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Selector</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Description</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-100 dark:divide-blue-800/50">
                      {referenceEntries.map((entry) => (
                        <tr key={entry.id} className="bg-blue-50/50 dark:bg-blue-900/10">
                          <td className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">{entry.feature}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">{entry.url}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">{entry.selector}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-xs truncate">{entry.description}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                              {entry.source}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 text-xs text-blue-600 dark:text-blue-400 border-t border-blue-200 dark:border-blue-800">
                  Read-only reference entries from Q admin tenant
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
