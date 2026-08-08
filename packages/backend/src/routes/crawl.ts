// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getStore } from '../db/index.js';
import { crawlGitHubRepo } from '../crawler/index.js';
import type { CrawlResult } from '../crawler/index.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import type { GithubCrawlCandidate } from '../db/store.js';

async function getSecretKeyTenant(authHeader: string | undefined) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const secretKey = authHeader.slice('Bearer '.length).trim();
  return (await getStore().getTenantBySecretKey(secretKey)) ?? null;
}

async function applyCandidates(tenantId: string, candidates: GithubCrawlCandidate[]): Promise<number> {
  const store = getStore();
  let applied = 0;
  for (const candidate of candidates) {
    const id = `entry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await store.addMapEntry({
      id,
      tenantId,
      feature: candidate.feature,
      url: candidate.url,
      selector: candidate.selector,
      description: candidate.description,
      source: 'crawler',
      platform: candidate.platform,
    });
    applied++;
  }
  return applied;
}

// Access tokens are never persisted to the DB (job rows are polled by the
// dashboard and readable by any admin). A token supplied at job-creation
// time is held here only until the worker picks the job up — same
// lifetime the token used to have when creation invoked the crawl
// synchronously, just relocated now that creation and execution are
// decoupled by the job queue. If the server restarts before the job is
// picked up (or the job is later resumed after a pause), the token is
// gone and the crawl proceeds unauthenticated, same as any other
// checkpoint state the worker didn't have a chance to persist.
const pendingAccessTokens = new Map<string, string>();

/**
 * Runs (or resumes) a queued/requeued github_crawl_jobs row — called by the
 * job worker (jobs/worker.ts) after it flips the row to 'running'. Loads
 * its own params from the job row rather than taking them as arguments, so
 * a resume after a pause or a restart-triggered requeue works the same way
 * as the first run.
 */
export async function runGithubCrawlJob(jobId: string): Promise<void> {
  const store = getStore();
  const job = await store.getGithubCrawlJob(jobId);
  if (!job || job.status !== 'running') return;

  const accessToken = pendingAccessTokens.get(jobId);
  pendingAccessTokens.delete(jobId);

  try {
    const result = await crawlGitHubRepo(job.repoUrl, {
      accessToken,
      branch: job.branch ?? undefined,
      srcPath: job.srcPath ?? undefined,
      baseUrl: job.baseUrl ?? undefined,
      ingestDocs: job.ingestDocs,
      tenantId: job.tenantId,
      jobId,
    });

    const current = await store.getGithubCrawlJob(jobId);
    if (current?.status !== 'running') return; // paused/cancelled while crawling

    let applied = 0;
    let appliedAt: string | undefined;
    if (job.autoApply && result.candidates.length > 0) {
      applied = await applyCandidates(job.tenantId, result.candidates);
      appliedAt = new Date().toISOString();
    }

    await store.updateGithubCrawlJob(jobId, {
      status: 'completed',
      filesProcessed: result.filesProcessed,
      elementsFound: result.elementsFound,
      docsIngested: result.docsIngested ?? 0,
      docsChunks: result.docsChunks ?? 0,
      docsSkipped: result.docsSkipped ?? 0,
      candidates: result.candidates,
      processedPaths: [],
      applied,
      appliedAt,
    });
  } catch (err) {
    await store.updateGithubCrawlJob(jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

const CrawlBody = z.object({
  repoUrl: z.string().url(),
  accessToken: z.string().optional(),
  branch: z.string().optional(),
  srcPath: z.string().optional(),
  baseUrl: z.string().optional(),
  autoApply: z.boolean().optional().default(false),
  ingestDocs: z.boolean().optional().default(true),
});

const CrawlPreviewQuery = z.object({
  repoUrl: z.string().url(),
  accessToken: z.string().optional(),
  branch: z.string().optional(),
  srcPath: z.string().optional(),
});

const crawlSessions = new Map<string, CrawlResult>();

const ACTIVE_STATUSES = new Set(['queued', 'running', 'paused']);

export async function crawlRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/crawl', async (request, reply) => {
    const store = getStore();
    const tenant = await getSecretKeyTenant(request.headers.authorization);
    if (!tenant) {
      return reply.code(401).send({ error: 'Missing or invalid secret key' });
    }

    const parsed = CrawlBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.format() });
    }

    const { repoUrl, accessToken, branch, srcPath, baseUrl, autoApply, ingestDocs } = parsed.data;

    let result: CrawlResult;
    try {
      result = await crawlGitHubRepo(repoUrl, { accessToken, branch, srcPath, baseUrl, ingestDocs, tenantId: tenant.id });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.error({ err, repoUrl }, 'Crawl failed');

      if (message.includes('403')) {
        return reply.code(403).send({ error: message });
      }
      if (message.includes('404')) {
        return reply.code(404).send({ error: message });
      }
      return reply.code(500).send({ error: `Crawl failed: ${message}` });
    }

    crawlSessions.set(tenant.id, result);

    let applied = 0;
    if (autoApply) {
      for (const candidate of result.candidates) {
        const id = `entry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        await store.addMapEntry({
          id,
          tenantId: tenant.id,
          feature: candidate.feature,
          url: candidate.url,
          selector: candidate.selector,
          description: candidate.description,
          source: 'crawler',
          platform: candidate.platform,
        });
        applied++;
      }
    }

    return reply.send({
      candidates: result.candidates,
      filesProcessed: result.filesProcessed,
      elementsFound: result.elementsFound,
      applied,
      docsIngested: result.docsIngested ?? 0,
      docsChunks: result.docsChunks ?? 0,
      docsSkipped: result.docsSkipped ?? 0,
    });
  });

  app.get('/api/v1/crawl/preview', async (request, reply) => {
    const tenant = await getSecretKeyTenant(request.headers.authorization);
    if (!tenant) {
      return reply.code(401).send({ error: 'Missing or invalid secret key' });
    }

    const parsedQuery = CrawlPreviewQuery.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: 'Invalid query params', details: parsedQuery.error.format() });
    }

    const { repoUrl, accessToken, branch, srcPath } = parsedQuery.data;

    let result: CrawlResult;
    try {
      result = await crawlGitHubRepo(repoUrl, { accessToken, branch, srcPath });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.error({ err, repoUrl }, 'Crawl preview failed');

      if (message.includes('403')) {
        return reply.code(403).send({ error: message });
      }
      if (message.includes('404')) {
        return reply.code(404).send({ error: message });
      }
      return reply.code(500).send({ error: `Crawl failed: ${message}` });
    }

    crawlSessions.set(tenant.id, result);

    return reply.send({
      candidates: result.candidates,
      filesProcessed: result.filesProcessed,
      elementsFound: result.elementsFound,
      applied: 0,
    });
  });

  // ── Dashboard job-based crawl ────────────────────────────────────────
  // Separate from POST /api/v1/crawl above (kept synchronous for the MCP
  // server, which expects an immediate result). These back the dashboard's
  // Crawl page with a persisted, cancellable, resumable-on-refresh job —
  // same model as the docs spider (routes/spider.ts).

  const CrawlJobBody = z.object({
    repoUrl: z.string().url(),
    accessToken: z.string().optional(),
    branch: z.string().optional(),
    srcPath: z.string().optional(),
    baseUrl: z.string().optional(),
    ingestDocs: z.boolean().optional().default(true),
    autoApply: z.boolean().optional().default(false),
  });

  app.post('/api/v1/crawl/jobs', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const parsed = CrawlJobBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.format() });
    }

    const store = getStore();
    const jobId = randomUUID();
    const { repoUrl, accessToken, branch, srcPath, baseUrl, ingestDocs, autoApply } = parsed.data;

    // Create the job row before responding, so a client polling immediately
    // after the 202 always finds it. The job worker (jobs/worker.ts) picks
    // it up and runs it, respecting the configured concurrency limit.
    if (accessToken) pendingAccessTokens.set(jobId, accessToken);

    await store.createGithubCrawlJob({
      id: jobId,
      tenantId,
      repoUrl,
      branch: branch ?? null,
      srcPath: srcPath ?? null,
      baseUrl: baseUrl ?? null,
      ingestDocs,
      autoApply,
      status: 'queued',
      totalFiles: 0,
      filesProcessed: 0,
      elementsFound: 0,
      docsIngested: 0,
      docsChunks: 0,
      docsSkipped: 0,
      applied: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return reply.code(202).send({ jobId });
  });

  // List crawl jobs for this tenant (most recent first)
  app.get('/api/v1/crawl/jobs', { preHandler: [requireRole('viewer')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const jobs = await getStore().getGithubCrawlJobsByTenantId(tenantId);
    return reply.send({ jobs });
  });

  // Poll a single crawl job's status
  app.get('/api/v1/crawl/jobs/:jobId', { preHandler: [requireRole('viewer')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const { jobId } = request.params as { jobId: string };
    const job = await getStore().getGithubCrawlJob(jobId);
    if (!job || job.tenantId !== tenantId) {
      return reply.code(404).send({ error: 'Job not found' });
    }
    return reply.send(job);
  });

  // Pause a running job — the crawl loop checks job status before each
  // file/doc and stops at the next checkpoint, leaving processedPaths and
  // the already-found candidates in place to resume from.
  app.post('/api/v1/crawl/jobs/:jobId/pause', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const { jobId } = request.params as { jobId: string };
    const store = getStore();
    const job = await store.getGithubCrawlJob(jobId);
    if (!job || job.tenantId !== tenantId) {
      return reply.code(404).send({ error: 'Job not found' });
    }
    if (job.status !== 'running') {
      return reply.code(400).send({ error: `Job is ${job.status}, not running` });
    }

    const updated = await store.updateGithubCrawlJob(jobId, { status: 'paused' });
    return reply.send(updated);
  });

  // Resume a paused job — puts it back in the queue for the worker to pick
  // up; it continues from processedPaths rather than re-fetching everything.
  app.post('/api/v1/crawl/jobs/:jobId/resume', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const { jobId } = request.params as { jobId: string };
    const store = getStore();
    const job = await store.getGithubCrawlJob(jobId);
    if (!job || job.tenantId !== tenantId) {
      return reply.code(404).send({ error: 'Job not found' });
    }
    if (job.status !== 'paused') {
      return reply.code(400).send({ error: `Job is ${job.status}, not paused` });
    }

    const updated = await store.updateGithubCrawlJob(jobId, { status: 'queued' });
    return reply.send(updated);
  });

  // Cancel a queued/running/paused job — terminal, cannot be resumed.
  app.post('/api/v1/crawl/jobs/:jobId/cancel', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const { jobId } = request.params as { jobId: string };
    const store = getStore();
    const job = await store.getGithubCrawlJob(jobId);
    if (!job || job.tenantId !== tenantId) {
      return reply.code(404).send({ error: 'Job not found' });
    }
    if (!ACTIVE_STATUSES.has(job.status)) {
      return reply.code(400).send({ error: `Job is already ${job.status}` });
    }

    pendingAccessTokens.delete(jobId);
    const updated = await store.updateGithubCrawlJob(jobId, { status: 'cancelled' });
    return reply.send(updated);
  });

  // Apply a completed job's already-fetched candidates to the functional
  // map, without re-crawling the repo (unlike the old flow, which had to
  // run the whole crawl a second time just to flip autoApply on).
  app.post('/api/v1/crawl/jobs/:jobId/apply', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const { jobId } = request.params as { jobId: string };
    const store = getStore();
    const job = await store.getGithubCrawlJob(jobId);
    if (!job || job.tenantId !== tenantId) {
      return reply.code(404).send({ error: 'Job not found' });
    }
    if (job.status !== 'completed') {
      return reply.code(400).send({ error: `Job is ${job.status}, not completed` });
    }
    if (job.appliedAt) {
      return reply.code(400).send({ error: 'Already applied' });
    }

    const applied = await applyCandidates(tenantId, job.candidates ?? []);
    const updated = await store.updateGithubCrawlJob(jobId, { applied, appliedAt: new Date().toISOString() });
    return reply.send(updated);
  });

  // Remove a finished job from history. Running jobs must be cancelled first.
  app.delete('/api/v1/crawl/jobs/:jobId', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const { jobId } = request.params as { jobId: string };
    const store = getStore();
    const job = await store.getGithubCrawlJob(jobId);
    if (!job || job.tenantId !== tenantId) {
      return reply.code(404).send({ error: 'Job not found' });
    }
    if (ACTIVE_STATUSES.has(job.status)) {
      return reply.code(400).send({ error: 'Cancel the job before removing it' });
    }

    await store.deleteGithubCrawlJob(jobId);
    return reply.code(204).send();
  });
}
