// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FunctionalMapEntry } from '@opentam/shared';
import { mcpConfig } from './config.js';

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${mcpConfig.secretKey}`,
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function getMapEntries(): Promise<FunctionalMapEntry[]> {
  const res = await fetch(`${mcpConfig.backendUrl}/api/v1/map`, {
    headers: authHeaders(),
  });
  const data = await handleResponse<{ entries: FunctionalMapEntry[] }>(res);
  return data.entries;
}

export async function addMapEntry(
  entry: Omit<FunctionalMapEntry, 'id' | 'tenantId'>,
): Promise<FunctionalMapEntry> {
  const res = await fetch(`${mcpConfig.backendUrl}/api/v1/map`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(entry),
  });
  const data = await handleResponse<{ entry: FunctionalMapEntry }>(res);
  return data.entry;
}

export interface CrawlRepoParams {
  repoUrl: string;
  accessToken?: string;
  branch?: string;
  srcPath?: string;
  baseUrl?: string;
  autoApply?: boolean;
}

export interface CrawlRepoResult {
  candidates: unknown[];
  filesProcessed: number;
  elementsFound: number;
  applied: number;
}

export async function crawlRepo(params: CrawlRepoParams): Promise<CrawlRepoResult> {
  const res = await fetch(`${mcpConfig.backendUrl}/api/v1/crawl`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(params),
  });
  return handleResponse<CrawlRepoResult>(res);
}

export async function ingestUrl(url: string): Promise<{ docId: string; chunks: number }> {
  const res = await fetch(`${mcpConfig.backendUrl}/api/v1/ingest/url`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ url }),
  });
  return handleResponse<{ docId: string; chunks: number }>(res);
}

export async function ingestText(
  docId: string,
  text: string,
  mimeType: string,
): Promise<{ chunks: number }> {
  const res = await fetch(`${mcpConfig.backendUrl}/api/v1/ingest/text`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ docId, text, mimeType }),
  });
  return handleResponse<{ chunks: number }>(res);
}

export async function searchDocs(query: string): Promise<string> {
  const params = new URLSearchParams({ q: query });
  const res = await fetch(`${mcpConfig.backendUrl}/api/v1/search?${params.toString()}`, {
    headers: authHeaders(),
  });
  const data = await handleResponse<{ results: string }>(res);
  return data.results;
}
