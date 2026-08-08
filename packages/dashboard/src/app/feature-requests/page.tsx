'use client';
import { getClientToken } from '@/lib/clientAuth';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useEffect, useState, useCallback } from 'react';
import type { FeatureRequest, FeedbackType, FeatureRequestStatus } from '@opentam/shared';
import { DataTable } from '@/components/DataTable';
import type { Column } from '@/components/DataTable';
import {
  getFeatureRequests,
  createFeatureRequest,
  updateFeatureRequest as apiUpdateFeatureRequest,
  deleteFeatureRequest as apiDeleteFeatureRequest,
  voteFeatureRequest as apiVoteFeatureRequest,
  getLicenseInfo,
} from '@/lib/api';
import { UpgradePrompt } from '@/components/UpgradePrompt';

// ── Status badge colors ──────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  under_review: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  planned: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  in_progress: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  declined: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

const allStatuses: FeatureRequestStatus[] = ['new', 'under_review', 'planned', 'in_progress', 'completed', 'declined'];

const tabs: { label: string; type: FeedbackType }[] = [
  { label: 'Feature Requests', type: 'feature_request' },
  { label: 'Positive Feedback', type: 'positive_feedback' },
  { label: 'Bug Reports', type: 'bug_report' },
];

// ── Thumbs up icon ───────────────────────────────────────────────────────────

function ThumbsUpIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className ?? 'h-4 w-4'}
      aria-hidden="true"
    >
      <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
    </svg>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function FeatureRequestsPage() {
  const [activeTab, setActiveTab] = useState<FeedbackType>('feature_request');
  const [items, setItems] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [licensed, setLicensed] = useState<boolean | null>(null);
  const [detailItem, setDetailItem] = useState<FeatureRequest | null>(null);

  // New form state
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState<FeedbackType>('feature_request');
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<FeatureRequest[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Token from httpOnly session cookie. tokenChecked distinguishes "haven't
  // asked yet" from "asked, and there isn't one" — without it, the fetch
  // below fires once immediately on mount with token still null (before
  // getClientToken() resolves), sending an unauthenticated request that
  // 401s before a second, authenticated attempt quietly succeeds.
  const [token, setToken] = useState<string | null>(null);
  const [tokenChecked, setTokenChecked] = useState(false);
  useEffect(() => {
    getClientToken().then(t => { setToken(t || null); setTokenChecked(true); });
  }, []);

  // License check
  useEffect(() => {
    if (!token) return;
    getLicenseInfo(token).then((info) => {
      setLicensed(info.features.includes('feature_requests'));
    }).catch(() => setLicensed(false));
  }, [token]);

  const loadItems = useCallback(async () => {
    if (!tokenChecked) return;
    setLoading(true);
    try {
      const data = await getFeatureRequests(token, activeTab);
      setItems(data.featureRequests);
    } catch (err) {
      console.error('Failed to load feature requests:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, token, tokenChecked]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  async function handleCreate() {
    if (!formTitle.trim() || !formDescription.trim()) return;
    setSubmitting(true);
    setFormError(null);
    setDuplicates(null);
    try {
      const result = await createFeatureRequest(token, {
        type: formType,
        title: formTitle.trim(),
        description: formDescription.trim(),
      });
      if (result.created) {
        setShowForm(false);
        setFormTitle('');
        setFormDescription('');
        loadItems();
      } else if (result.possibleDuplicates) {
        setDuplicates(result.possibleDuplicates);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(id: string, status: string) {
    if (!token) return;
    try {
      const result = await apiUpdateFeatureRequest(token, id, { status });
      setItems(items.map((i) => (i.id === id ? result.featureRequest : i)));
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  }

  async function handleDelete(id: string) {
    if (!token || !confirm('Delete this item?')) return;
    try {
      await apiDeleteFeatureRequest(token, id);
      setItems(items.filter((i) => i.id !== id));
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  }

  async function handleVote(id: string) {
    try {
      const result = await apiVoteFeatureRequest(token, id);
      if (!result.alreadyVoted) {
        setItems(items.map((i) => (i.id === id ? { ...i, votes: result.votes } : i)));
      }
    } catch (err) {
      console.error('Failed to vote:', err);
    }
  }

  const columns: Column<FeatureRequest>[] = [
    {
      key: 'title',
      header: 'Title',
      sortable: true,
      filterable: true,
      render: (r) => (
        <div>
          <span className="font-medium text-gray-900 dark:text-gray-100">{r.title}</span>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-md truncate">{r.description}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (r) => (
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[r.status]}`}>
          {r.status.replace('_', ' ')}
        </span>
      ),
    },
    {
      key: 'votes',
      header: 'Votes',
      sortable: true,
      render: (r) => (
        <button
          onClick={(e) => { e.stopPropagation(); handleVote(r.id); }}
          className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
          aria-label="Vote"
          title="Vote"
        >
          <ThumbsUpIcon className="h-4 w-4" />
          <span className="text-sm font-medium">{r.votes}</span>
        </button>
      ),
    },
    {
      key: 'submittedBy',
      header: 'Submitted By',
      sortable: true,
      render: (r) => (
        <span className="text-gray-600 dark:text-gray-400 text-sm">
          {r.submittedByEmail ?? r.submittedBy}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Date',
      sortable: true,
      render: (r) => (
        <span className="text-gray-500 dark:text-gray-400 text-sm">
          {new Date(r.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  if (licensed === false) {
    return <UpgradePrompt feature="Feedback" description="Collect and manage feature requests and user feedback with the Enterprise plan." />;
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Feedback</h1>
        <button
          onClick={() => { setShowForm(true); setFormType(activeTab); setDuplicates(null); setFormError(null); }}
          aria-label="Create new feedback"
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 shadow-sm"
        >
          + New
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {tabs.map(({ label, type }) => (
          <button
            key={type}
            onClick={() => setActiveTab(type)}
            aria-label={`${label} tab`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === type
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* New form modal */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Submit Feedback</h2>

          {formError && (
            <div className="mb-4 rounded-md bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
              {formError}
            </div>
          )}

          {duplicates && (
            <div className="mb-4 rounded-md bg-yellow-50 dark:bg-yellow-950/30 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800">
              <p className="font-medium mb-2">Possible duplicates found. Consider voting on an existing one instead:</p>
              <ul className="list-disc list-inside space-y-1">
                {duplicates.map((d) => (
                  <li key={d.id}>
                    {d.title} ({d.votes} votes)
                    <button
                      onClick={() => { handleVote(d.id); setDuplicates(null); setShowForm(false); loadItems(); }}
                      className="ml-2 text-amber-600 dark:text-amber-400 underline text-xs"
                    >
                      Vote
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as FeedbackType)}
                aria-label="Select feedback type"
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="feature_request">Feature Request</option>
                <option value="positive_feedback">Positive Feedback</option>
                <option value="bug_report">Bug Report</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Brief summary..."
                aria-label="Title"
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={3}
                placeholder="Describe in detail..."
                aria-label="Description"
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCreate}
                disabled={submitting || !formTitle.trim() || !formDescription.trim()}
                aria-label="Submit feedback"
                className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
              <button
                onClick={() => { setShowForm(false); setDuplicates(null); setFormError(null); }}
                aria-label="Cancel"
                className="rounded-md bg-gray-200 dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      ) : (
        <DataTable
          columns={columns}
          data={items}
          rowKey={(r) => r.id}
          searchable
          searchPlaceholder="Search feedback..."
          emptyMessage="No feedback items found."
          pageSize={20}
          onRowClick={(r) => setDetailItem(r)}
          actions={(r) => (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {token && (
                <>
                  <select
                    value={r.status}
                    onChange={(e) => handleStatusChange(r.id, e.target.value)}
                    className="rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-700 dark:text-gray-300 focus:border-amber-400 focus:outline-none"
                    aria-label="Select status"
                    title="Change status"
                  >
                    {allStatuses.map((s) => (
                      <option key={s} value={s}>
                        {s.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleDelete(r.id)}
                    aria-label="Delete feedback"
                    className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs font-medium"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
        />
      )}

      {/* Detail view — the table row truncates description to one line, so
          this is the only place the full text (including any structured
          "What happened / Steps to reproduce / ..." sections Q's chat agent
          writes) is actually visible. */}
      {detailItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDetailItem(null)}
        >
          <div
            className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{detailItem.title}</h2>
              <button
                onClick={() => setDetailItem(null)}
                aria-label="Close"
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[detailItem.status]}`}>
                {detailItem.status.replace('_', ' ')}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {tabs.find(t => t.type === detailItem.type)?.label ?? detailItem.type}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {new Date(detailItem.createdAt).toLocaleString()}
              </span>
            </div>

            <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{detailItem.description}</p>

            <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
              Submitted by {detailItem.submittedByEmail ?? detailItem.submittedBy} · {detailItem.votes} vote{detailItem.votes === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
