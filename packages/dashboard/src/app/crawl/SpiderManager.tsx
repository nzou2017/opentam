'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useState, useEffect, useRef, useCallback } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

async function getAuthToken(): Promise<string> {
  const res = await fetch('/api/auth/token');
  if (!res.ok) return process.env.NEXT_PUBLIC_SECRET_KEY ?? '';
  const { token } = await res.json() as { token: string };
  return token;
}

type JobStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

interface CrawlJob {
  id: string;
  rootUrl: string;
  maxPages: number;
  maxDepth: number;
  status: JobStatus;
  pagesIngested: number;
  pagesQueued: number;
  pagesFailed: number;
  totalChunks: number;
  docsSkipped: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_STYLES: Record<JobStatus, string> = {
  queued: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  running: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  paused: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

const ACTIVE_STATUSES = new Set<JobStatus>(['queued', 'running', 'paused']);

export function SpiderManager() {
  const [rootUrl, setRootUrl] = useState('');
  const [maxPages, setMaxPages] = useState(50);
  const [maxDepth, setMaxDepth] = useState(3);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<CrawlJob[]>([]);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [busyJobIds, setBusyJobIds] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/spider`, {
        headers: { Authorization: `Bearer ${await getAuthToken()}` },
      });
      if (res.ok) {
        const data = await res.json() as { jobs: CrawlJob[] };
        setJobs(data.jobs);
      }
    } catch { /* transient network error — keep showing the last known state */ } finally {
      setJobsLoaded(true);
    }
  }, []);

  // Load job history on mount. All job state lives on the backend now, so
  // this works the same after a refresh, in a new tab, or on another device
  // — nothing to resume from localStorage.
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Poll while anything is active (queued/running/paused jobs can still
  // change status from the worker or another tab).
  useEffect(() => {
    const hasRunning = jobs.some(j => ACTIVE_STATUSES.has(j.status));
    if (hasRunning && !pollRef.current) {
      pollRef.current = setInterval(fetchJobs, 2000);
    } else if (!hasRunning && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [jobs, fetchJobs]);

  function setBusy(jobId: string, busy: boolean) {
    setBusyJobIds(prev => {
      const next = new Set(prev);
      if (busy) next.add(jobId); else next.delete(jobId);
      return next;
    });
  }

  async function startJob(target: { rootUrl: string; maxPages: number; maxDepth: number }) {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/spider`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify(target),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await fetchJobs();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!rootUrl.trim()) return;
    await startJob({ rootUrl: rootUrl.trim(), maxPages, maxDepth });
    setRootUrl('');
  }

  async function handleRetry(job: CrawlJob) {
    await startJob({ rootUrl: job.rootUrl, maxPages: job.maxPages, maxDepth: job.maxDepth });
  }

  async function handleCancel(jobId: string) {
    setBusy(jobId, true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/spider/${jobId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await getAuthToken()}` },
      });
      if (res.ok) await fetchJobs();
    } finally {
      setBusy(jobId, false);
    }
  }

  async function handlePause(jobId: string) {
    setBusy(jobId, true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/spider/${jobId}/pause`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await getAuthToken()}` },
      });
      if (res.ok) await fetchJobs();
    } finally {
      setBusy(jobId, false);
    }
  }

  async function handleResume(jobId: string) {
    setBusy(jobId, true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/spider/${jobId}/resume`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await getAuthToken()}` },
      });
      if (res.ok) await fetchJobs();
    } finally {
      setBusy(jobId, false);
    }
  }

  async function handleRemove(jobId: string) {
    if (!confirm('Remove this job from history? This does not delete any pages it already ingested.')) return;
    setBusy(jobId, true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/spider/${jobId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${await getAuthToken()}` },
      });
      if (res.ok) setJobs(prev => prev.filter(j => j.id !== jobId));
    } finally {
      setBusy(jobId, false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <h3 className="mb-4 text-base font-medium text-gray-800 dark:text-gray-200">Configure Spider</h3>
        <form onSubmit={handleStart}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Root URL <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                placeholder="https://docs.example.com"
                value={rootUrl}
                onChange={(e) => setRootUrl(e.target.value)}
                aria-label="Root URL"
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Max Pages</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value))}
                aria-label="Max pages"
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Max Depth</label>
              <input
                type="number"
                min={1}
                max={10}
                value={maxDepth}
                onChange={(e) => setMaxDepth(Number(e.target.value))}
                aria-label="Max depth"
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>
          <div className="mt-4">
            <button
              type="submit"
              disabled={starting || !rootUrl.trim()}
              aria-label="Start spider"
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {starting ? 'Starting...' : 'Start Spider'}
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-medium text-gray-800 dark:text-gray-200">Crawl Jobs</h3>
          <button
            onClick={fetchJobs}
            aria-label="Refresh crawl jobs"
            className="text-sm text-amber-600 dark:text-amber-400 hover:text-amber-500"
          >
            Refresh
          </button>
        </div>

        {!jobsLoaded ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No crawl jobs yet. Start one above.</p>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => {
              const busy = busyJobIds.has(job.id);
              const pct = job.maxPages > 0 ? Math.min((job.pagesIngested / job.maxPages) * 100, 100) : 0;
              return (
                <div key={job.id} className="rounded-md border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm text-gray-800 dark:text-gray-200" title={job.rootUrl}>
                        {job.rootUrl}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Started {new Date(job.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[job.status]}`}>
                      {job.status}
                    </span>
                  </div>

                  {job.status === 'running' && (
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                      <div
                        className="h-full rounded-full bg-amber-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}

                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    {job.status === 'queued' ? 'Waiting for a worker slot' : (
                      <>
                        {job.pagesIngested} page{job.pagesIngested === 1 ? '' : 's'} ingested
                        {job.status === 'running' && `, ${job.pagesQueued} queued`}
                        {job.pagesFailed > 0 && `, ${job.pagesFailed} failed`}
                        {job.docsSkipped > 0 && `, ${job.docsSkipped} skipped as irrelevant`}
                        {!ACTIVE_STATUSES.has(job.status) && `, ${job.totalChunks} chunks indexed`}
                      </>
                    )}
                  </p>

                  {job.error && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">Error: {job.error}</p>
                  )}

                  <div className="mt-3 flex gap-4">
                    {job.status === 'running' && (
                      <>
                        <button
                          onClick={() => handlePause(job.id)}
                          disabled={busy}
                          aria-label="Pause job"
                          className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 disabled:opacity-50"
                        >
                          {busy ? 'Pausing...' : 'Pause'}
                        </button>
                        <button
                          onClick={() => handleCancel(job.id)}
                          disabled={busy}
                          aria-label="Cancel job"
                          className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                          {busy ? 'Cancelling...' : 'Cancel'}
                        </button>
                      </>
                    )}
                    {job.status === 'paused' && (
                      <>
                        <button
                          onClick={() => handleResume(job.id)}
                          disabled={busy}
                          aria-label="Resume job"
                          className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 disabled:opacity-50"
                        >
                          {busy ? 'Resuming...' : 'Resume'}
                        </button>
                        <button
                          onClick={() => handleCancel(job.id)}
                          disabled={busy}
                          aria-label="Cancel job"
                          className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                          {busy ? 'Cancelling...' : 'Cancel'}
                        </button>
                      </>
                    )}
                    {job.status === 'queued' && (
                      <button
                        onClick={() => handleCancel(job.id)}
                        disabled={busy}
                        aria-label="Cancel job"
                        className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        {busy ? 'Cancelling...' : 'Cancel'}
                      </button>
                    )}
                    {!ACTIVE_STATUSES.has(job.status) && (
                      <>
                        <button
                          onClick={() => handleRetry(job)}
                          disabled={starting}
                          aria-label="Retry job"
                          className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 disabled:opacity-50"
                        >
                          Retry
                        </button>
                        <button
                          onClick={() => handleRemove(job.id)}
                          disabled={busy}
                          aria-label="Remove job"
                          className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                          {busy ? 'Removing...' : 'Remove'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
