// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { getStore } from '../db/index.js';

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/analytics', async (request, reply) => {
    const store = getStore();

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing or invalid Authorization header' });
    }

    const secretKey = authHeader.slice('Bearer '.length).trim();
    const tenant = await store.getTenantBySecretKey(secretKey);
    if (!tenant) {
      return reply.code(401).send({ error: 'Invalid secret key' });
    }

    const { platform } = request.query as { platform?: string };
    const allLogs = await store.getInterventionLogs(tenant.id);
    const logs = platform
      ? allLogs.filter(l => (l.platform ?? 'web') === platform)
      : allLogs;

    const totalInterventions = logs.length;
    const resolvedInterventions = logs.filter((l) => l.resolved).length;
    const resolutionRate = totalInterventions > 0 ? resolvedInterventions / totalInterventions : 0;

    const urlCounts = new Map<string, number>();
    for (const log of logs) {
      const key = log.url ?? 'unknown';
      urlCounts.set(key, (urlCounts.get(key) ?? 0) + 1);
    }
    const topFrustrationUrls = [...urlCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([url, count]) => ({ url, count }));

    const interventionsByAction = {
      overlay_highlight: 0,
      deep_link: 0,
      message_only: 0,
      dismissed: 0,
    };
    for (const log of logs) {
      if (log.action in interventionsByAction) {
        interventionsByAction[log.action as keyof typeof interventionsByAction]++;
      }
    }

    // Platform distribution (always computed from all logs, ignoring filter)
    const platformDistribution: Record<string, number> = { web: 0, ios: 0, android: 0 };
    for (const log of allLogs) {
      const p = log.platform ?? 'web';
      platformDistribution[p] = (platformDistribution[p] ?? 0) + 1;
    }

    return reply.send({
      totalInterventions,
      resolvedInterventions,
      resolutionRate,
      topFrustrationUrls,
      interventionsByAction,
      platformDistribution,
    });
  });
}
