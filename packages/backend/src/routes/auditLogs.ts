// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { getStore } from '../db/index.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export async function auditLogRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/audit-logs', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const store = getStore();
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const query = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '50', 10) || 50));
    const offset = (page - 1) * limit;
    const action = query.action || undefined;
    const userId = query.userId || undefined;

    const [logs, total] = await Promise.all([
      store.getAuditLogs(tenantId, { limit, offset, action, userId }),
      store.countAuditLogs(tenantId, { action, userId }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return reply.send({ logs, total, page, totalPages });
  });
}
