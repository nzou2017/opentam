'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useState } from 'react';

interface MapCandidate {
  feature: string;
  url: string;
  selector: string;
  description: string;
  source: 'crawler';
}

interface CrawlResponse {
  candidates: MapCandidate[];
  filesProcessed: number;
  elementsFound: number;
  applied: number;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';
const SECRET_KEY = process.env.NEXT_PUBLIC_SECRET_KEY ?? 'sk_test_acme';

async function postCrawl(
  repoUrl: string,
  accessToken: string,
  branch: string,
  autoApply: boolean,
): Promise<CrawlResponse> {
  const res = await fetch(`${BACKEND_URL}/api/v1/crawl`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SECRET_KEY}`,
    },
    body: JSON.stringify({
      repoUrl,
      accessToken: accessToken || undefined,
      branch: branch || undefined,
      autoApply,
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<CrawlResponse>;
}

export function CrawlManager() {
  const [repoUrl, setRepoUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [branch, setBranch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CrawlResponse | null>(null);
  const [applySuccess, setApplySuccess] = useState<number | null>(null);

  async function handlePreview() {
    if (!repoUrl.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setApplySuccess(null);
    try {
      const data = await postCrawl(repoUrl.trim(), accessToken, branch, false);
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleApplyAll() {
    if (!repoUrl.trim()) return;
    setLoading(true);
    setError(null);
    setApplySuccess(null);
    try {
      const data = await postCrawl(repoUrl.trim(), accessToken, branch, true);
      setResult(data);
      setApplySuccess(data.applied);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Form */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <h2 className="mb-4 text-base font-medium text-gray-800 dark:text-gray-200">Configure Crawl</h2>
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
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handlePreview}
            disabled={loading || !repoUrl.trim()}
            aria-label="Preview crawl"
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Crawling...' : 'Preview'}
          </button>

          {result && result.candidates.length > 0 && (
            <button
              onClick={handleApplyAll}
              disabled={loading}
              aria-label="Apply all crawl results"
              className="rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Applying...' : `Apply All (${result.candidates.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Apply success */}
      {applySuccess !== null && (
        <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          {applySuccess} entries added to the functional map.
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
          <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4">
            <h2 className="text-base font-medium text-gray-800 dark:text-gray-200">
              Candidates ({result.candidates.length})
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {result.filesProcessed} files processed &middot; {result.elementsFound} elements found
            </p>
          </div>

          {result.candidates.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No UI candidates found. Try a different branch or source path.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3 text-left">Feature</th>
                    <th className="px-4 py-3 text-left">URL</th>
                    <th className="px-4 py-3 text-left">Selector</th>
                    <th className="px-4 py-3 text-left">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {result.candidates.map((c, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{c.feature}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">{c.url}</td>
                      <td className="px-4 py-3 font-mono text-xs text-amber-700 dark:text-amber-400">{c.selector}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{c.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
