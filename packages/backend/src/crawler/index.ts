// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { fetchRepoFiles, parseGitHubUrl } from './github.js';
import { extractUiElements } from './parser.js';
import { extractSwiftUiElements } from './swiftParser.js';
import { toMapCandidates } from './mapper.js';
import type { MapCandidate } from './mapper.js';
import { ingestText } from '../ingestion/pipeline.js';
import { isDocRelevant } from '../ingestion/relevanceFilter.js';
import { getStore } from '../db/index.js';

export type { MapCandidate };
export { spiderDocs } from './spider.js';

export interface CrawlResult {
  candidates: MapCandidate[];
  filesProcessed: number;
  elementsFound: number;
  docsIngested?: number;
  docsChunks?: number;
  docsSkipped?: number;
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

/**
 * Runs (or resumes) a GitHub crawl. When `options.jobId` is set, this seeds
 * itself from whatever the job already accumulated on a prior run (checked
 * via `processedPaths`/`candidates`/counts already on the row) and merges
 * new results onto them, rather than starting over — so a job paused,
 * cancelled mid-fetch, or interrupted by a server restart and requeued
 * picks up from where it left off instead of re-fetching and re-counting
 * everything. Progress + checkpoint state are persisted incrementally
 * (per UI-file batch, per doc) rather than only once at the very end, so a
 * crash mid-run loses as little as possible.
 */
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

  const startingJob = jobId && store ? await store.getGithubCrawlJob(jobId) : undefined;
  const processedPaths = new Set<string>(startingJob?.processedPaths ?? []);
  let candidates: MapCandidate[] = startingJob?.candidates ? [...startingJob.candidates] : [];
  let elementsFound = startingJob?.elementsFound ?? 0;
  let docsIngested = startingJob?.docsIngested ?? 0;
  let docsChunks = startingJob?.docsChunks ?? 0;
  let docsSkipped = startingJob?.docsSkipped ?? 0;

  const { uiFiles, docFiles } = await fetchRepoFiles(
    owner, repo, branch, options.accessToken, srcPath,
    store ? {
      onTotal: async (total) => { await store.updateGithubCrawlJob(jobId!, { totalFiles: total }); },
      onFileProcessed: async (processed) => { await store.updateGithubCrawlJob(jobId!, { filesProcessed: processed }); },
      shouldCancel: isCancelled,
    } : undefined,
    processedPaths.size > 0 ? processedPaths : undefined,
  );

  // Extract candidates from the newly-fetched UI files and merge onto
  // whatever a prior run already found. Swift files are parsed separately
  // (regex/heuristic — no Swift toolchain available) and mapped to
  // iOS-flavored candidates (accessibility ID as selector, screen name in
  // place of a web URL) rather than the React/JSX path.
  if (uiFiles.length > 0) {
    const reactFiles = uiFiles.filter((f) => f.path.endsWith('.tsx') || f.path.endsWith('.jsx'));
    const swiftFiles = uiFiles.filter((f) => f.path.endsWith('.swift'));

    const newReactElements = reactFiles.flatMap((file) => extractUiElements(file.content, file.path));
    const newSwiftElements = swiftFiles.flatMap((file) => extractSwiftUiElements(file.content, file.path));

    candidates = candidates
      .concat(toMapCandidates(newReactElements, baseUrl))
      .concat(toMapCandidates(newSwiftElements, baseUrl, 'ios'));
    elementsFound += newReactElements.length + newSwiftElements.length;
    for (const file of uiFiles) processedPaths.add(file.path);

    if (store) {
      await store.updateGithubCrawlJob(jobId!, { candidates, elementsFound, processedPaths: [...processedPaths] });
    }
  }

  // Ingest markdown docs into RAG — one at a time, persisting after each so
  // a pause/crash mid-batch only loses the doc in flight, not the whole batch.
  // Every fetched doc is marked processed regardless of the ingestDocs flag
  // — it was already fetched over the network, so a resume shouldn't
  // re-fetch it just because ingestion itself is turned off.
  if (docFiles.length > 0) {
    for (const doc of docFiles) {
      if (await isCancelled()) break;
      if (ingestDocs && options.tenantId) {
        try {
          if (await isDocRelevant(options.tenantId, doc.path, doc.content)) {
            const docId = `github:${owner}/${repo}/${doc.path}`;
            const result = await ingestText(options.tenantId, docId, doc.content, 'text/markdown');
            docsIngested++;
            docsChunks += result.chunks;
          } else {
            docsSkipped++;
          }
        } catch {
          // Skip individual doc failures
        }
      }
      processedPaths.add(doc.path);
      if (store) {
        await store.updateGithubCrawlJob(jobId!, { docsIngested, docsChunks, docsSkipped, processedPaths: [...processedPaths] });
      }
    }
  }

  return {
    candidates,
    // Total files actually fetched (UI + doc) across every run of this job,
    // matching what was live-tracked during the run — not just the subset
    // that happened to be UI candidates.
    filesProcessed: processedPaths.size,
    elementsFound,
    docsIngested,
    docsChunks,
    docsSkipped,
  };
}
