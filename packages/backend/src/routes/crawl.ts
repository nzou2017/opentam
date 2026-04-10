// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getStore } from '../db/index.js';
import { crawlGitHubRepo } from '../crawler/index.js';
import type { CrawlResult } from '../crawler/index.js';

async function getSecretKeyTenant(authHeader: string | undefined) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const secretKey = authHeader.slice('Bearer '.length).trim();
  return (await getStore().getTenantBySecretKey(secretKey)) ?? null;
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
}
