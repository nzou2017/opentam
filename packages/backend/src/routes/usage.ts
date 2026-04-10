// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getStore } from '../db/index.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { checkUsage, PLAN_DEFAULTS } from '../middleware/planLimits.js';

export async function usageRoutes(app: FastifyInstance): Promise<void> {
  // Current month usage
  app.get('/api/v1/tenant/usage', { preHandler: [requireRole('viewer')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const store = getStore();
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const tenant = await store.getTenantById(tenantId);
    if (!tenant) return reply.code(404).send({ error: 'Tenant not found' });

    const overrides = await store.getUsageLimits(tenantId);
    const defaults = PLAN_DEFAULTS[tenant.plan] ?? PLAN_DEFAULTS.hobbyist;

    const eventUsed = await store.getUsageCount(tenantId, 'event');
    const chatUsed = await store.getUsageCount(tenantId, 'chat');
    const userCount = await store.countUsersByTenantId(tenantId);

    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return reply.send({
      events: { used: eventUsed, limit: overrides?.maxEventsMonth ?? defaults.maxEventsMonth },
      chat: { used: chatUsed, limit: overrides?.maxChatMonth ?? defaults.maxChatMonth },
      users: { used: userCount, limit: overrides?.maxUsers ?? defaults.maxUsers },
      plan: tenant.plan,
      period,
    });
  });

  // Usage history
  app.get('/api/v1/tenant/usage/history', { preHandler: [requireRole('viewer')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const store = getStore();
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const { months } = request.query as { months?: string };
    const monthCount = Math.min(parseInt(months ?? '6', 10) || 6, 12);

    const history = await store.getUsageHistory(tenantId, monthCount);
    return reply.send({ history });
  });
}
