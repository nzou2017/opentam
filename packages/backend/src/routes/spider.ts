// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getStore } from '../db/index.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { spiderDocs } from '../crawler/spider.js';

const SpiderBody = z.object({
  rootUrl: z.string().url(),
  maxPages: z.number().min(1).max(1000).optional(),
  maxDepth: z.number().min(1).max(10).optional(),
  delayMs: z.number().min(0).optional(),
  allowPatterns: z.array(z.string()).optional(),
  denyPatterns: z.array(z.string()).optional(),
});

export async function spiderRoutes(app: FastifyInstance): Promise<void> {
  // Start a docs spider crawl
  app.post('/api/v1/spider', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const parsed = SpiderBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.format() });
    }

    const store = getStore();
    const jobId = randomUUID();
    const { rootUrl, maxPages = 200, maxDepth = 3 } = parsed.data;

    // Create the job row before responding, so a client polling immediately
    // after the 202 always finds it.
    await store.createCrawlJob({
      id: jobId,
      tenantId,
      rootUrl,
      maxPages,
      maxDepth,
      status: 'running',
      pagesIngested: 0,
      pagesQueued: 0,
      pagesFailed: 0,
      totalChunks: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Run in background
    spiderDocs(tenantId, parsed.data, jobId).catch(err => {
      app.log.error({ err, jobId }, 'Spider job failed');
    });

    return reply.code(202).send({ jobId });
  });

  // List crawl jobs for this tenant (most recent first)
  app.get('/api/v1/spider', { preHandler: [requireRole('viewer')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const jobs = await getStore().getCrawlJobsByTenantId(tenantId);
    return reply.send({ jobs });
  });

  // Poll a single crawl job's status
  app.get('/api/v1/spider/:jobId', { preHandler: [requireRole('viewer')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const { jobId } = request.params as { jobId: string };
    const job = await getStore().getCrawlJob(jobId);
    if (!job || job.tenantId !== tenantId) {
      return reply.code(404).send({ error: 'Job not found' });
    }
    return reply.send(job);
  });

  // Cancel a running job — the spider loop checks job status before each
  // page and stops once it sees anything other than 'running'.
  app.post('/api/v1/spider/:jobId/cancel', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const { jobId } = request.params as { jobId: string };
    const store = getStore();
    const job = await store.getCrawlJob(jobId);
    if (!job || job.tenantId !== tenantId) {
      return reply.code(404).send({ error: 'Job not found' });
    }
    if (job.status !== 'running') {
      return reply.code(400).send({ error: `Job is already ${job.status}` });
    }

    const updated = await store.updateCrawlJob(jobId, { status: 'cancelled' });
    return reply.send(updated);
  });

  // Remove a finished job from history. Running jobs must be cancelled first.
  app.delete('/api/v1/spider/:jobId', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const { jobId } = request.params as { jobId: string };
    const store = getStore();
    const job = await store.getCrawlJob(jobId);
    if (!job || job.tenantId !== tenantId) {
      return reply.code(404).send({ error: 'Job not found' });
    }
    if (job.status === 'running') {
      return reply.code(400).send({ error: 'Cancel the job before removing it' });
    }

    await store.deleteCrawlJob(jobId);
    return reply.code(204).send();
  });
}
