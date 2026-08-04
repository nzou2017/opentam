// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { fetchRepoFiles, parseGitHubUrl } from './github.js';
import { extractUiElements } from './parser.js';
import { toMapCandidates } from './mapper.js';
import type { MapCandidate } from './mapper.js';
import { ingestText } from '../ingestion/pipeline.js';
import { getStore } from '../db/index.js';

export type { MapCandidate };
export { spiderDocs } from './spider.js';

export interface CrawlResult {
  candidates: MapCandidate[];
  filesProcessed: number;
  elementsFound: number;
  docsIngested?: number;
  docsChunks?: number;
}

export interface CrawlOptions {
  accessToken?: string;
  branch?: string;
  srcPath?: string;
  baseUrl?: string;
  ingestDocs?: boolean;
  tenantId?: string;
  /**
   * When set, progress and cancellation are persisted via the store
   * against this github_crawl_jobs row (see routes/crawl.ts's job
   * endpoints). Omitted entirely for the synchronous /api/v1/crawl and
   * /api/v1/crawl/preview routes used by the MCP server, which expect an
   * immediate result and know nothing about jobs.
   */
  jobId?: string;
}

export async function crawlGitHubRepo(
  repoUrl: string,
  options: CrawlOptions = {},
): Promise<CrawlResult> {
  const parsed = parseGitHubUrl(repoUrl);

  const owner = parsed.owner;
  const repo = parsed.repo;
  const branch = options.branch ?? parsed.branch;
  const srcPath = options.srcPath ?? parsed.srcPath;
  const baseUrl = options.baseUrl ?? '';
  const ingestDocs = options.ingestDocs ?? true;
  const { jobId } = options;
  const store = jobId ? getStore() : null;

  const isCancelled = async () => {
    if (!jobId || !store) return false;
    const job = await store.getGithubCrawlJob(jobId);
    return !job || job.status !== 'running';
  };

  const { uiFiles, docFiles } = await fetchRepoFiles(owner, repo, branch, options.accessToken, srcPath, store ? {
    onTotal: async (total) => { await store.updateGithubCrawlJob(jobId!, { totalFiles: total }); },
    onFileProcessed: async (processed) => { await store.updateGithubCrawlJob(jobId!, { filesProcessed: processed }); },
    shouldCancel: isCancelled,
  } : undefined);

  if (await isCancelled()) {
    return { candidates: [], filesProcessed: uiFiles.length + docFiles.length, elementsFound: 0, docsIngested: 0, docsChunks: 0 };
  }

  const allElements = uiFiles.flatMap((file) => extractUiElements(file.content, file.path));
  const candidates = toMapCandidates(allElements, baseUrl);

  let docsIngested = 0;
  let docsChunks = 0;

  // Ingest markdown docs into RAG
  if (ingestDocs && options.tenantId && docFiles.length > 0) {
    for (const doc of docFiles) {
      if (await isCancelled()) break;
      try {
        const docId = `github:${owner}/${repo}/${doc.path}`;
        const result = await ingestText(options.tenantId, docId, doc.content, 'text/markdown');
        docsIngested++;
        docsChunks += result.chunks;
      } catch {
        // Skip individual doc failures
      }
    }
  }

  return {
    candidates,
    // Total files actually fetched (UI + doc), matching what was live-tracked
    // during the run — not just the subset that happened to be UI candidates.
    filesProcessed: uiFiles.length + docFiles.length,
    elementsFound: allElements.length,
    docsIngested,
    docsChunks,
  };
}
