// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { getStore } from '../db/index.js';
import type { CrawlJob, GithubCrawlJob } from '../db/store.js';
import { spiderDocs } from '../crawler/spider.js';
import { runGithubCrawlJob } from '../routes/crawl.js';

const POLL_INTERVAL_MS = 3000;
const MAX_CONCURRENT_JOBS = Number(process.env.MAX_CRAWL_CONCURRENCY) || 2;

type QueuedItem = { kind: 'spider'; job: CrawlJob } | { kind: 'github'; job: GithubCrawlJob };

// Jobs currently being run by this process, so a slower tick doesn't
// re-pick up a job that's still in flight from an earlier tick.
const inFlight = new Set<string>();

/** Starts the in-process poller that picks up queued spider/GitHub crawl jobs, respecting MAX_CONCURRENT_JOBS. */
export function startCrawlJobWorker(): void {
  setInterval(() => {
    tick().catch((err) => console.error('[crawl-worker] tick error:', err));
  }, POLL_INTERVAL_MS);
}

async function tick(): Promise<void> {
  const slots = MAX_CONCURRENT_JOBS - inFlight.size;
  if (slots <= 0) return;

  const store = getStore();
  const [spiderJobs, githubJobs] = await Promise.all([
    store.getQueuedCrawlJobs(slots),
    store.getQueuedGithubCrawlJobs(slots),
  ]);

  const items: QueuedItem[] = [
    ...spiderJobs.map((job): QueuedItem => ({ kind: 'spider', job })),
    ...githubJobs.map((job): QueuedItem => ({ kind: 'github', job })),
  ]
    .sort((a, b) => a.job.createdAt.localeCompare(b.job.createdAt))
    .slice(0, slots);

  for (const item of items) {
    if (inFlight.has(item.job.id)) continue;
    inFlight.add(item.job.id);
    runJob(item)
      .catch((err) => console.error(`[crawl-worker] job ${item.job.id} failed:`, err))
      .finally(() => inFlight.delete(item.job.id));
  }
}

async function runJob(item: QueuedItem): Promise<void> {
  const store = getStore();
  if (item.kind === 'spider') {
    const job = await store.updateCrawlJob(item.job.id, { status: 'running' });
    if (!job) return;
    await spiderDocs(job.tenantId, { rootUrl: job.rootUrl, maxPages: job.maxPages, maxDepth: job.maxDepth }, job.id);
  } else {
    const job = await store.updateGithubCrawlJob(item.job.id, { status: 'running' });
    if (!job) return;
    await runGithubCrawlJob(job.id);
  }
}
