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

type JobStatus = 'running' | 'completed' | 'failed' | 'cancelled';

interface MapCandidate {
  feature: string;
  url: string;
  selector: string;
  description: string;
  source: 'crawler';
}

interface CrawlJob {
  id: string;
  repoUrl: string;
  branch?: string;
  srcPath?: string;
  baseUrl?: string;
  ingestDocs: boolean;
  autoApply: boolean;
  status: JobStatus;
  totalFiles: number;
  filesProcessed: number;
  elementsFound: number;
  docsIngested: number;
  docsChunks: number;
  applied: number;
  appliedAt?: string;
  candidates?: MapCandidate[];
  error?: string;
  createdAt: string;
}

const STATUS_STYLES: Record<JobStatus, string> = {
  running: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

export function CrawlManager() {
  const [repoUrl, setRepoUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [branch, setBranch] = useState('');
  const [autoApply, setAutoApply] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<CrawlJob[]>([]);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [busyJobIds, setBusyJobIds] = useState<Set<string>>(new Set());
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/crawl/jobs`, {
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

  // All job state lives on the backend, so this works the same after a
  // refresh, in a new tab, or on another device.
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Poll only while something is actually running.
  useEffect(() => {
    const hasRunning = jobs.some(j => j.status === 'running');
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

  async function startJob(target: { repoUrl: string; accessToken?: string; branch?: string; autoApply: boolean }) {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/crawl/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify({
          repoUrl: target.repoUrl,
          accessToken: target.accessToken || undefined,
          branch: target.branch || undefined,
          autoApply: target.autoApply,
        }),
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
    if (!repoUrl.trim()) return;
    await startJob({ repoUrl: repoUrl.trim(), accessToken, branch, autoApply });
  }

  async function handleRetry(job: CrawlJob) {
    // Access tokens are never persisted, so a retry of a private repo needs
    // it re-entered in the form above before clicking Retry.
    await startJob({ repoUrl: job.repoUrl, accessToken, branch: job.branch, autoApply: job.autoApply });
  }

  async function handleCancel(jobId: string) {
    setBusy(jobId, true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/crawl/jobs/${jobId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await getAuthToken()}` },
      });
      if (res.ok) await fetchJobs();
    } finally {
      setBusy(jobId, false);
    }
  }

  async function handleApply(jobId: string) {
    setBusy(jobId, true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/crawl/jobs/${jobId}/apply`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await getAuthToken()}` },
      });
      if (res.ok) await fetchJobs();
      else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? 'Failed to apply candidates');
      }
    } finally {
      setBusy(jobId, false);
    }
  }

  async function handleRemove(jobId: string) {
    if (!confirm('Remove this job from history? This does not undo any map entries it already applied.')) return;
    setBusy(jobId, true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/crawl/jobs/${jobId}`, {
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
      {/* Form */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <h2 className="mb-4 text-base font-medium text-gray-800 dark:text-gray-200">Configure Crawl</h2>
        <form onSubmit={handleStart}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                GitHub Repository URL <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                placeholder="https://github.com/owner/repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                aria-label="GitHub repository URL"
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Branch <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="main"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                aria-label="Branch"
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Access Token <span className="text-gray-400">(optional, for private repos)</span>
              </label>
              <input
                type="password"
                placeholder="ghp_..."
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                aria-label="Access token"
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <p className="mt-1 text-xs text-gray-400">Not saved — re-enter it to retry a private repo.</p>
            </div>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={autoApply}
              onChange={(e) => setAutoApply(e.target.checked)}
              aria-label="Auto-apply candidates on completion"
              className="rounded border-gray-300 dark:border-gray-600 text-amber-500 focus:ring-amber-500"
            />
            Auto-apply candidates to the functional map when the crawl finishes
          </label>

          <div className="mt-4">
            <button
              type="submit"
              disabled={starting || !repoUrl.trim()}
              aria-label="Start crawl"
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {starting ? 'Starting...' : 'Start Crawl'}
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Job list */}
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
              const pct = job.totalFiles > 0 ? Math.min((job.filesProcessed / job.totalFiles) * 100, 100) : 0;
              const canApply = job.status === 'completed' && !job.appliedAt && (job.candidates?.length ?? 0) > 0;
              const expanded = expandedJobId === job.id;

              return (
                <div key={job.id} className="rounded-md border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm text-gray-800 dark:text-gray-200" title={job.repoUrl}>
                        {job.repoUrl}
                        {job.branch && <span className="text-gray-400"> @ {job.branch}</span>}
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
                      <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  )}

                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    {job.status === 'running'
                      ? `${job.filesProcessed} of ${job.totalFiles || '?'} files processed`
                      : `${job.filesProcessed} files processed, ${job.elementsFound} elements found`}
                    {job.docsIngested > 0 && `, ${job.docsIngested} docs ingested (${job.docsChunks} chunks)`}
                  </p>

                  {job.status === 'completed' && (
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      {job.candidates?.length ?? 0} candidate{(job.candidates?.length ?? 0) === 1 ? '' : 's'} found
                      {job.appliedAt
                        ? ` — ${job.applied} applied to the functional map`
                        : ' — not yet applied'}
                    </p>
                  )}

                  {job.status === 'completed' && job.elementsFound === 0 && job.filesProcessed > 0 && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                      No UI candidates found because this crawler only extracts them from React (.tsx/.jsx)
                      source files under the configured source path — it doesn't parse Swift, Kotlin, or other
                      non-React UI code. Docs were still ingested for search above, if any were found.
                    </p>
                  )}

                  {job.error && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">Error: {job.error}</p>
                  )}

                  {(job.candidates?.length ?? 0) > 0 && (
                    <button
                      onClick={() => setExpandedJobId(expanded ? null : job.id)}
                      aria-label="Toggle candidates"
                      className="mt-2 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-500"
                    >
                      {expanded ? 'Hide' : 'View'} candidates ({job.candidates?.length})
                    </button>
                  )}

                  {expanded && job.candidates && (
                    <div className="mt-2 overflow-x-auto rounded-md border border-gray-100 dark:border-gray-800">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                          <tr>
                            <th className="px-3 py-2 text-left">Feature</th>
                            <th className="px-3 py-2 text-left">URL</th>
                            <th className="px-3 py-2 text-left">Selector</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {job.candidates.map((c, i) => (
                            <tr key={i}>
                              <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{c.feature}</td>
                              <td className="px-3 py-2 font-mono text-gray-600 dark:text-gray-400">{c.url}</td>
                              <td className="px-3 py-2 font-mono text-amber-700 dark:text-amber-400">{c.selector}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="mt-3 flex gap-4">
                    {job.status === 'running' ? (
                      <button
                        onClick={() => handleCancel(job.id)}
                        disabled={busy}
                        aria-label="Cancel job"
                        className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        {busy ? 'Cancelling...' : 'Cancel'}
                      </button>
                    ) : (
                      <>
                        {canApply && (
                          <button
                            onClick={() => handleApply(job.id)}
                            disabled={busy}
                            aria-label="Apply candidates"
                            className="text-xs font-medium text-gray-800 dark:text-gray-200 hover:underline disabled:opacity-50"
                          >
                            {busy ? 'Applying...' : `Apply (${job.candidates?.length})`}
                          </button>
                        )}
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
