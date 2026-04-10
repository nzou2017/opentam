// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuthenticatedRequest } from './auth.js';
import { getStore } from '../db/index.js';
import type { Tenant } from '@opentam/shared';

const PLAN_DEFAULTS: Record<string, { maxEventsMonth: number; maxChatMonth: number; maxUsers: number; maxSdkKeys: number }> = {
  hobbyist: { maxEventsMonth: 1000, maxChatMonth: 100, maxUsers: 1, maxSdkKeys: 1 },
  startup: { maxEventsMonth: 10000, maxChatMonth: 1000, maxUsers: 5, maxSdkKeys: 3 },
  enterprise: { maxEventsMonth: 999999999, maxChatMonth: 999999999, maxUsers: 999999999, maxSdkKeys: 999999999 },
};

export async function checkUsage(tenantId: string, type: 'event' | 'chat'): Promise<{ allowed: boolean; used: number; limit: number }> {
  const store = getStore();
  const tenant = await store.getTenantById(tenantId);
  if (!tenant) return { allowed: false, used: 0, limit: 0 };

  const overrides = await store.getUsageLimits(tenantId);
  const defaults = PLAN_DEFAULTS[tenant.plan] ?? PLAN_DEFAULTS.hobbyist;

  const limit = type === 'event'
    ? (overrides?.maxEventsMonth ?? defaults.maxEventsMonth)
    : (overrides?.maxChatMonth ?? defaults.maxChatMonth);

  const used = await store.getUsageCount(tenantId, type);

  return { allowed: used < limit, used, limit };
}

export function usageLimiter(type: 'event' | 'chat') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as AuthenticatedRequest;
    const tenantId = req.tenant?.id;
    if (!tenantId) return; // auth will handle rejection

    const { allowed, used, limit } = await checkUsage(tenantId, type);
    if (!allowed) {
      return reply.code(429).send({
        error: `${type} limit exceeded`,
        used,
        limit,
        plan: req.tenant?.plan,
      });
    }
  };
}

export { PLAN_DEFAULTS };
