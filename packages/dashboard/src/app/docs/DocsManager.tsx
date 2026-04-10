'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useEffect, useCallback } from 'react';

interface DocsManagerProps {
  backendUrl: string;
  secretKey: string;
}

interface IngestResult {
  docId?: string;
  chunks?: number;
  error?: string;
  configured?: boolean;
}

interface DocEntry {
  docId: string;
  chunks: number;
}

export default function DocsManager({ backendUrl, secretKey }: DocsManagerProps) {
  // URL ingestion state
  const [url, setUrl] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);

  // Text ingestion state
  const [docId, setDocId] = useState('');
  const [text, setText] = useState('');
  const [mimeType, setMimeType] = useState<'text/markdown' | 'text/html' | 'text/plain'>('text/plain');
  const [textLoading, setTextLoading] = useState(false);

  // Doc list
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Status
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${secretKey}`,
  };

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/v1/ingest`, {
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      if (res.ok) {
        const data = await res.json() as { docs: DocEntry[]; configured: boolean };
        setDocs(data.docs ?? []);
      }
    } catch {
      // silent
    } finally {
      setDocsLoading(false);
    }
  }, [backendUrl, secretKey]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  function showStatus(type: 'success' | 'error' | 'info', message: string) {
    setStatus({ type, message });
  }

  function formatResult(result: IngestResult, label: string): string {
    if (result.configured === false) {
      return 'RAG is not configured. Configure embedding settings in Settings > Model.';
    }
    if (result.error) return `Error: ${result.error}`;
    return `${label} ingested successfully — ${result.chunks} chunk${result.chunks === 1 ? '' : 's'} indexed (doc ID: ${result.docId ?? docId})`;
  }

  async function handleIngestUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setUrlLoading(true);
    setStatus(null);
    try {
      const res = await fetch(`${backendUrl}/api/v1/ingest/url`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json() as IngestResult;
      if (!res.ok && !('configured' in data)) {
        showStatus('error', data.error ?? `Request failed: ${res.status}`);
      } else {
        showStatus(
          data.configured === false || data.error ? 'error' : 'success',
          formatResult(data, url.trim()),
        );
        if (!data.error) { setUrl(''); fetchDocs(); }
      }
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'Network error');
    } finally {
      setUrlLoading(false);
    }
  }

  async function handleIngestText(e: React.FormEvent) {
    e.preventDefault();
    if (!docId.trim() || !text.trim()) return;
    setTextLoading(true);
    setStatus(null);
    try {
      const res = await fetch(`${backendUrl}/api/v1/ingest/text`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ docId: docId.trim(), text: text.trim(), mimeType }),
      });
      const data = await res.json() as IngestResult;
      if (!res.ok && !('configured' in data)) {
        showStatus('error', data.error ?? `Request failed: ${res.status}`);
      } else {
        showStatus(
          data.configured === false || data.error ? 'error' : 'success',
          formatResult(data, docId.trim()),
        );
        if (!data.error) { setText(''); setDocId(''); fetchDocs(); }
      }
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'Network error');
    } finally {
      setTextLoading(false);
    }
  }

  async function handleDelete(targetDocId: string) {
    setDeletingId(targetDocId);
    setStatus(null);
    try {
      const res = await fetch(`${backendUrl}/api/v1/ingest/${encodeURIComponent(targetDocId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      const data = await res.json() as { deleted?: boolean; error?: string; configured?: boolean };
      if (data.configured === false) {
        showStatus('error', 'RAG is not configured. Configure embedding settings in Settings > Model.');
      } else if (data.error) {
        showStatus('error', `Error: ${data.error}`);
      } else {
        showStatus('success', `Document "${targetDocId}" deleted.`);
        fetchDocs();
      }
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'Network error');
    } finally {
      setDeletingId(null);
    }
  }

  const inputCls =
    'w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400';
  const btnCls =
    'rounded bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors';
  const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  return (
    <div className="flex flex-col gap-6">
      {/* Status area */}
      {status && (
        <div
          className={`rounded-md px-4 py-3 text-sm ${
            status.type === 'success'
              ? 'bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-400 border border-green-200 dark:border-green-800'
              : status.type === 'error'
              ? 'bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-400 border border-red-200 dark:border-red-800'
              : 'bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
          }`}
        >
          {status.message}
        </div>
      )}

      {/* Document list */}
      <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Indexed Documents</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Documents currently in the knowledge base. Delete to remove all chunks for a document.
        </p>

        {docsLoading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-gray-400">No documents indexed yet. Ingest a URL or text below.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <th className="pb-2 pr-4">Document ID</th>
                  <th className="pb-2 pr-4 w-24">Chunks</th>
                  <th className="pb-2 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {docs.map((doc) => (
                  <tr key={doc.docId}>
                    <td className="py-2 pr-4 font-mono text-xs text-gray-700 dark:text-gray-300 truncate max-w-md" title={doc.docId}>
                      {doc.docId}
                    </td>
                    <td className="py-2 pr-4 text-gray-500 dark:text-gray-400">
                      {doc.chunks}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => handleDelete(doc.docId)}
                        disabled={deletingId === doc.docId}
                        className="text-xs text-red-500 hover:text-red-400 disabled:opacity-50"
                      >
                        {deletingId === doc.docId ? 'Deleting...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-gray-400">{docs.length} document{docs.length !== 1 ? 's' : ''} &middot; {docs.reduce((s, d) => s + d.chunks, 0)} total chunks</p>
          </div>
        )}
      </section>

      {/* URL ingestion */}
      <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Ingest from URL</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Fetch and index a public URL. Supports HTML pages, Markdown files, and PDFs.
        </p>
        <form onSubmit={handleIngestUrl} className="flex gap-3">
          <div className="flex-1">
            <label className={labelCls} htmlFor="ingest-url">
              URL
            </label>
            <input
              id="ingest-url"
              type="url"
              className={inputCls}
              placeholder="https://docs.example.com/getting-started"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={urlLoading || !url.trim()} aria-label="Ingest URL" className={btnCls}>
              {urlLoading ? 'Ingesting...' : 'Ingest URL'}
            </button>
          </div>
        </form>
      </section>

      {/* Text ingestion */}
      <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Ingest Text</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Paste content directly. Choose the format so the Q assistant can parse it correctly.
        </p>
        <form onSubmit={handleIngestText} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} htmlFor="ingest-doc-id">
                Document ID
              </label>
              <input
                id="ingest-doc-id"
                type="text"
                className={inputCls}
                placeholder="getting-started"
                value={docId}
                onChange={(e) => setDocId(e.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="ingest-mime">
                Format
              </label>
              <select
                id="ingest-mime"
                className={inputCls}
                value={mimeType}
                onChange={(e) =>
                  setMimeType(e.target.value as 'text/markdown' | 'text/html' | 'text/plain')
                }
              >
                <option value="text/plain">Plain text</option>
                <option value="text/markdown">Markdown</option>
                <option value="text/html">HTML</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="ingest-text">
              Content
            </label>
            <textarea
              id="ingest-text"
              className={inputCls}
              rows={8}
              placeholder="Paste your documentation here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={textLoading || !docId.trim() || !text.trim()}
              aria-label="Ingest text"
              className={btnCls}
            >
              {textLoading ? 'Ingesting...' : 'Ingest Text'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
