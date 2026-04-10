// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { getStore } from '../db/index.js';
import type { FunctionalMapEntry } from '@opentam/shared';

interface DiscoverBody {
  tenantId: string;
  entries: Array<{
    feature: string;
    url: string;
    selector: string;
  }>;
}

export async function mapDiscoverRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: DiscoverBody }>('/api/v1/map/discover', async (req, reply) => {
    const store = getStore();

    const authHeader = req.headers.authorization ?? '';
    const sdkKey = authHeader.replace(/^Bearer\s+/i, '').trim();
    const tenant = await store.getTenantBySdkKey(sdkKey);
    if (!tenant) return reply.status(401).send({ error: 'Unauthorized' });

    const { entries } = req.body;
    if (!Array.isArray(entries) || entries.length === 0) {
      return reply.status(400).send({ error: 'entries must be a non-empty array' });
    }

    let added = 0;
    let skipped = 0;

    for (const raw of entries) {
      if (!raw.feature || !raw.url || !raw.selector) continue;

      const entry: FunctionalMapEntry = {
        id: `disc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        tenantId: tenant.id,
        feature: raw.feature,
        url: raw.url,
        selector: raw.selector,
        description: `Auto-discovered: ${raw.feature}`,
        source: 'crawler',
      };

      const result = await store.upsertDiscoveredEntry(entry);
      if (result === 'added') added++;
      else skipped++;
    }

    return reply.send({ added, skipped });
  });
}
