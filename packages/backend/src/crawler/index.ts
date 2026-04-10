// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { fetchRepoFiles, parseGitHubUrl } from './github.js';
import { extractUiElements } from './parser.js';
import { toMapCandidates } from './mapper.js';
import type { MapCandidate } from './mapper.js';
import { ingestText } from '../ingestion/pipeline.js';

export type { MapCandidate };
export { spiderDocs, getSpiderJob } from './spider.js';

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

  const { uiFiles, docFiles } = await fetchRepoFiles(owner, repo, branch, options.accessToken, srcPath);

  const allElements = uiFiles.flatMap((file) => extractUiElements(file.content, file.path));
  const candidates = toMapCandidates(allElements, baseUrl);

  let docsIngested = 0;
  let docsChunks = 0;

  // Ingest markdown docs into RAG
  if (ingestDocs && options.tenantId && docFiles.length > 0) {
    for (const doc of docFiles) {
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
    filesProcessed: uiFiles.length,
    elementsFound: allElements.length,
    docsIngested,
    docsChunks,
  };
}
