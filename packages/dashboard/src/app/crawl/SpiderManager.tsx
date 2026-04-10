'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useState, useEffect, useRef } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';
const SECRET_KEY = process.env.NEXT_PUBLIC_SECRET_KEY ?? 'sk_test_acme';

interface SpiderJob {
  id: string;
  status: 'running' | 'completed' | 'failed';
  progress: { pagesIngested: number; pagesQueued: number };
  result?: { pagesIngested: number; pagesFailed: number; totalChunks: number; urls: string[] };
  error?: string;
}

const SPIDER_JOB_KEY = 'q_spider_job';

function saveJobId(jobId: string) {
  try { sessionStorage.setItem(SPIDER_JOB_KEY, jobId); } catch {}
}
function loadJobId(): string | null {
  try { return sessionStorage.getItem(SPIDER_JOB_KEY); } catch { return null; }
}
function clearJobId() {
  try { sessionStorage.removeItem(SPIDER_JOB_KEY); } catch {}
}

export function SpiderManager() {
  const [rootUrl, setRootUrl] = useState('');
  const [maxPages, setMaxPages] = useState(50);
  const [maxDepth, setMaxDepth] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<SpiderJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Resume polling if there's an active job from a previous navigation
  useEffect(() => {
    const savedId = loadJobId();
    if (savedId) {
      setLoading(true);
      startPolling(savedId);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function startPolling(jobId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const pollRes = await fetch(`${BACKEND_URL}/api/v1/spider/${jobId}`, {
          headers: { Authorization: `Bearer ${SECRET_KEY}` },
        });
        if (pollRes.ok) {
          const data = await pollRes.json() as SpiderJob;
          setJob(data);
          if (data.status !== 'running') {
            if (pollRef.current) clearInterval(pollRef.current);
            clearJobId();
            setLoading(false);
          }
        } else if (pollRes.status === 404) {
          // Job no longer exists
          if (pollRef.current) clearInterval(pollRef.current);
          clearJobId();
          setLoading(false);
        }
      } catch {
        // Network error — keep polling
      }
    }, 2000);
  }

  async function handleStart() {
    if (!rootUrl.trim()) return;
    setLoading(true);
    setError(null);
    setJob(null);

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/spider`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SECRET_KEY}`,
        },
        body: JSON.stringify({ rootUrl: rootUrl.trim(), maxPages, maxDepth }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const { jobId } = await res.json() as { jobId: string };
      saveJobId(jobId);
      startPolling(jobId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <h3 className="mb-4 text-base font-medium text-gray-800 dark:text-gray-200">Configure Spider</h3>
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
            onClick={handleStart}
            disabled={loading || !rootUrl.trim()}
            aria-label="Start spider"
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Crawling...' : 'Start Spider'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {job && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
              job.status === 'running' ? 'bg-blue-100 text-blue-800' :
              job.status === 'completed' ? 'bg-green-100 text-green-800' :
              'bg-red-100 text-red-800'
            }`}>
              {job.status}
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {job.progress.pagesIngested} pages ingested
            </span>
          </div>

          {job.status === 'running' && (
            <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden mb-3">
              <div
                className="h-full rounded-full bg-amber-500 transition-all"
                style={{ width: `${Math.min((job.progress.pagesIngested / (maxPages || 50)) * 100, 100)}%` }}
              />
            </div>
          )}

          {job.result && (
            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <p>Pages ingested: <strong>{job.result.pagesIngested}</strong></p>
              <p>Pages failed: <strong>{job.result.pagesFailed}</strong></p>
              <p>Total chunks: <strong>{job.result.totalChunks}</strong></p>
              {job.result.urls.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-amber-600 dark:text-amber-400 hover:text-amber-500">
                    View ingested URLs ({job.result.urls.length})
                  </summary>
                  <ul className="mt-2 max-h-60 overflow-y-auto space-y-1">
                    {job.result.urls.map((url, i) => (
                      <li key={i} className="font-mono text-xs text-gray-500 truncate">{url}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {job.error && (
            <p className="text-sm text-red-600">Error: {job.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
