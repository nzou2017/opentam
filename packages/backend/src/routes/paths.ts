// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { getStore } from '../db/index.js';

interface PathEvent {
  url: string;
  selector: string;
  timestamp: number;
}

// Ephemeral in-memory accumulator — NOT persisted to DB
const pathBuffer: Map<string, PathEvent[][]> = new Map(); // tenantId → sessions
const BATCH_THRESHOLD = 50; // trigger analysis after N sessions

async function getSdkKeyTenant(authHeader: string | undefined) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const key = authHeader.slice('Bearer '.length).trim();
  return (await getStore().getTenantBySdkKey(key)) ?? null;
}

export async function pathRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/paths', async (request, reply) => {
    const tenant = await getSdkKeyTenant(request.headers.authorization);
    if (!tenant) return reply.code(401).send({ error: 'Unauthorized' });

    const body = request.body as { sessionId: string; events: PathEvent[] };
    if (!body.sessionId || !Array.isArray(body.events) || body.events.length === 0) {
      return reply.code(400).send({ error: 'Missing sessionId or events' });
    }

    // Deduplicate consecutive same-URL/same-selector events
    const deduped: PathEvent[] = [];
    for (const evt of body.events) {
      const last = deduped[deduped.length - 1];
      if (last && last.url === evt.url && last.selector === evt.selector) continue;
      deduped.push({ url: evt.url, selector: evt.selector, timestamp: evt.timestamp });
    }

    if (deduped.length === 0) {
      return reply.send({ ok: true, queued: false });
    }

    // Accumulate in memory
    const sessions = pathBuffer.get(tenant.id) ?? [];
    sessions.push(deduped);
    pathBuffer.set(tenant.id, sessions);

    // Check batch threshold
    if (sessions.length >= BATCH_THRESHOLD) {
      pathBuffer.set(tenant.id, []);
      // Fire and forget — analysis runs async
      triggerAnalysis(tenant.id, sessions).catch((err) => {
        app.log.error('Path analysis failed:', err);
      });
    }

    return reply.send({ ok: true, queued: true, sessionsBuffered: pathBuffer.get(tenant.id)?.length ?? 0 });
  });
}

async function triggerAnalysis(tenantId: string, sessions: PathEvent[][]): Promise<void> {
  try {
    const { analyzePaths } = await import('../services/pathAnalyzer.js');
    await analyzePaths(tenantId, sessions);
  } catch (err) {
    console.error('[Q] Path analysis error:', err);
  }
}
