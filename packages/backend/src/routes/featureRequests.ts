// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { FeatureRequest, FeedbackType, FeatureRequestStatus } from '@opentam/shared';
import { getStore } from '../db/index.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { requirePlan } from '../middleware/planGate.js';

const CreateFeatureRequestBody = z.object({
  type: z.enum(['feature_request', 'positive_feedback', 'bug_report']),
  title: z.string().min(1),
  description: z.string().min(1),
  submittedBy: z.string().min(1).optional(),
  submittedByEmail: z.string().email().optional(),
});

const UpdateFeatureRequestBody = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  status: z.enum(['new', 'under_review', 'planned', 'in_progress', 'completed', 'declined']).optional(),
});

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function featureRequestRoutes(app: FastifyInstance): Promise<void> {
  // All feature request routes require enterprise plan + license
  app.addHook('preHandler', requirePlan('feature_requests'));

  // List feature requests
  app.get('/api/v1/feature-requests', async (request: AuthenticatedRequest, reply) => {
    if (!request.tenant) return reply.code(401).send({ error: 'Unauthorized' });

    const query = request.query as Record<string, string>;
    const type = query.type as FeedbackType | undefined;
    const status = query.status as FeatureRequestStatus | undefined;

    const store = getStore();
    const featureRequests = await store.getFeatureRequestsByTenantId(request.tenant.id, type, status);
    return reply.send({ featureRequests });
  });

  // Create feature request (with duplicate detection)
  app.post('/api/v1/feature-requests', async (request: AuthenticatedRequest, reply) => {
    if (!request.tenant) return reply.code(401).send({ error: 'Unauthorized' });

    const parsed = CreateFeatureRequestBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const { type, title, description, submittedByEmail } = parsed.data;
    const submittedBy = parsed.data.submittedBy ?? request.user?.userId ?? 'anonymous';
    const store = getStore();

    // Check for similar titles (case-insensitive substring match)
    const existing = await store.getFeatureRequestsByTenantId(request.tenant.id);
    const titleLower = title.toLowerCase();
    const possibleDuplicates = existing.filter(r =>
      r.title.toLowerCase().includes(titleLower) || titleLower.includes(r.title.toLowerCase())
    );

    if (possibleDuplicates.length > 0) {
      return reply.code(200).send({ created: false, possibleDuplicates });
    }

    const now = new Date().toISOString();
    const featureRequest: FeatureRequest = {
      id: generateId('fr'),
      tenantId: request.tenant.id,
      type,
      title,
      description,
      status: 'new',
      votes: 0,
      submittedBy,
      submittedByEmail,
      createdAt: now,
      updatedAt: now,
    };

    await store.createFeatureRequest(featureRequest);
    await logAudit(request, 'feature_request.create', 'feature_request', featureRequest.id, { title, type });
    return reply.code(201).send({ created: true, featureRequest });
  });

  // Get single feature request
  app.get('/api/v1/feature-requests/:id', async (request: AuthenticatedRequest, reply) => {
    if (!request.tenant) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const store = getStore();
    const featureRequest = await store.getFeatureRequestById(id, request.tenant.id);
    if (!featureRequest) return reply.code(404).send({ error: 'Feature request not found' });

    return reply.send({ featureRequest });
  });

  // Update feature request (admin/owner only via JWT)
  app.put('/api/v1/feature-requests/:id', async (request: AuthenticatedRequest, reply) => {
    if (!request.user || !['owner', 'admin'].includes(request.user.role)) {
      return reply.code(403).send({ error: 'Admin or owner role required' });
    }
    if (!request.tenant) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const parsed = UpdateFeatureRequestBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const store = getStore();
    const updated = await store.updateFeatureRequest(id, request.tenant.id, parsed.data);
    if (!updated) return reply.code(404).send({ error: 'Feature request not found' });

    await logAudit(request, 'feature_request.update', 'feature_request', id);
    return reply.send({ featureRequest: updated });
  });

  // Delete feature request (admin/owner only via JWT)
  app.delete('/api/v1/feature-requests/:id', async (request: AuthenticatedRequest, reply) => {
    if (!request.user || !['owner', 'admin'].includes(request.user.role)) {
      return reply.code(403).send({ error: 'Admin or owner role required' });
    }
    if (!request.tenant) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const store = getStore();
    const deleted = await store.deleteFeatureRequest(id, request.tenant.id);
    if (!deleted) return reply.code(404).send({ error: 'Feature request not found' });

    await logAudit(request, 'feature_request.delete', 'feature_request', id);
    return reply.code(204).send();
  });

  // Vote on feature request (SDK key or JWT)
  app.post('/api/v1/feature-requests/:id/vote', async (request: AuthenticatedRequest, reply) => {
    if (!request.tenant) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const voterId = request.user?.userId
      ?? (request.body as Record<string, string>)?.voterId
      ?? `anon-${Date.now()}`;

    const store = getStore();
    const result = await store.voteFeatureRequest(id, voterId);
    await logAudit(request, 'feature_request.vote', 'feature_request', id);
    return reply.send(result);
  });
}
