// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { getStore } from '../db/index.js';
import { executeSearchDocs } from '../agent/tools.js';

async function getSecretKeyTenant(authHeader: string | undefined) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const secretKey = authHeader.slice('Bearer '.length).trim();
  return (await getStore().getTenantBySecretKey(secretKey)) ?? null;
}

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/search', async (request, reply) => {
    const tenant = await getSecretKeyTenant(request.headers.authorization);
    if (!tenant) {
      return reply.code(401).send({ error: 'Missing or invalid secret key' });
    }

    const { q } = request.query as { q?: string };
    if (!q || q.trim() === '') {
      return reply.code(400).send({ error: 'Missing query parameter: q' });
    }

    try {
      const results = await executeSearchDocs({ query: q }, tenant.id);
      return reply.send({ results });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.error({ err, q }, 'Search failed');
      return reply.code(500).send({ error: `Search failed: ${message}` });
    }
  });
}
