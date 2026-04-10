// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getStore } from '../db/index.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { spiderDocs, getSpiderJob } from '../crawler/spider.js';

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

    const jobId = randomUUID();

    // Run in background
    spiderDocs(tenantId, parsed.data, jobId).catch(err => {
      app.log.error({ err, jobId }, 'Spider job failed');
    });

    return reply.code(202).send({ jobId });
  });

  // Poll spider job status
  app.get('/api/v1/spider/:jobId', { preHandler: [requireRole('viewer')] }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = getSpiderJob(jobId);
    if (!job) {
      return reply.code(404).send({ error: 'Job not found' });
    }
    return reply.send(job);
  });
}
