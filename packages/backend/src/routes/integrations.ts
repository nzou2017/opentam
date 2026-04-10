// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getStore } from '../db/index.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { getHandler } from '../integrations/bus.js';
import { logAudit } from '../middleware/audit.js';

const CreateIntegrationBody = z.object({
  type: z.enum(['slack', 'jira', 'webhook']),
  name: z.string().min(1),
  config: z.record(z.unknown()),
  enabled: z.boolean().default(true),
});

const UpdateIntegrationBody = z.object({
  name: z.string().min(1).optional(),
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

const CreateTriggerBody = z.object({
  eventType: z.string().min(1),
  filterConfig: z.record(z.unknown()).optional(),
  enabled: z.boolean().default(true),
});

export async function integrationRoutes(app: FastifyInstance): Promise<void> {
  // List integrations
  app.get('/api/v1/tenant/integrations', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const store = getStore();
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const integrations = await store.getIntegrationsByTenantId(tenantId);
    return reply.send({ integrations });
  });

  // Get single integration
  app.get('/api/v1/tenant/integrations/:id', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const store = getStore();
    const { id } = request.params as { id: string };

    const integration = await store.getIntegrationById(id);
    if (!integration || integration.tenantId !== (req.tenant?.id ?? req.user?.tenantId)) {
      return reply.code(404).send({ error: 'Integration not found' });
    }

    const triggers = await store.getTriggersByIntegrationId(id);
    return reply.send({ integration, triggers });
  });

  // Create integration
  app.post('/api/v1/tenant/integrations', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const store = getStore();
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const parsed = CreateIntegrationBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.format() });
    }

    const handler = getHandler(parsed.data.type);
    if (handler && !handler.validateConfig(parsed.data.config)) {
      return reply.code(400).send({ error: `Invalid config for ${parsed.data.type} integration` });
    }

    const integration = {
      id: randomUUID(),
      tenantId,
      type: parsed.data.type,
      name: parsed.data.name,
      config: parsed.data.config as Record<string, unknown>,
      enabled: parsed.data.enabled,
      createdAt: new Date().toISOString(),
    };
    await store.createIntegration(integration);

    await logAudit(request, 'integration.create', 'integration', integration.id, { type: integration.type, name: integration.name });

    return reply.code(201).send({ integration });
  });

  // Update integration
  app.put('/api/v1/tenant/integrations/:id', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const store = getStore();
    const { id } = request.params as { id: string };

    const existing = await store.getIntegrationById(id);
    if (!existing || existing.tenantId !== (req.tenant?.id ?? req.user?.tenantId)) {
      return reply.code(404).send({ error: 'Integration not found' });
    }

    const parsed = UpdateIntegrationBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.format() });
    }

    const updated = await store.updateIntegration(id, parsed.data);
    await logAudit(request, 'integration.update', 'integration', id);
    return reply.send({ integration: updated });
  });

  // Delete integration
  app.delete('/api/v1/tenant/integrations/:id', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const store = getStore();
    const { id } = request.params as { id: string };

    const existing = await store.getIntegrationById(id);
    if (!existing || existing.tenantId !== (req.tenant?.id ?? req.user?.tenantId)) {
      return reply.code(404).send({ error: 'Integration not found' });
    }

    await store.deleteIntegration(id);
    await logAudit(request, 'integration.delete', 'integration', id);
    return reply.code(204).send();
  });

  // Test integration
  app.post('/api/v1/tenant/integrations/:id/test', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const store = getStore();
    const { id } = request.params as { id: string };

    const integration = await store.getIntegrationById(id);
    if (!integration || integration.tenantId !== (req.tenant?.id ?? req.user?.tenantId)) {
      return reply.code(404).send({ error: 'Integration not found' });
    }

    const handler = getHandler(integration.type);
    if (!handler) {
      return reply.code(400).send({ error: `No handler for type: ${integration.type}` });
    }

    const result = await handler.testConnection(integration.config);
    return reply.send(result);
  });

  // Create trigger
  app.post('/api/v1/tenant/integrations/:id/triggers', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const store = getStore();
    const { id } = request.params as { id: string };

    const integration = await store.getIntegrationById(id);
    if (!integration || integration.tenantId !== (req.tenant?.id ?? req.user?.tenantId)) {
      return reply.code(404).send({ error: 'Integration not found' });
    }

    const parsed = CreateTriggerBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.format() });
    }

    const trigger = {
      id: randomUUID(),
      integrationId: id,
      eventType: parsed.data.eventType,
      filterConfig: parsed.data.filterConfig as Record<string, unknown> | undefined,
      enabled: parsed.data.enabled,
    };
    await store.createTrigger(trigger);

    return reply.code(201).send({ trigger });
  });

  // Delete trigger
  app.delete('/api/v1/tenant/integrations/:integrationId/triggers/:triggerId', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const store = getStore();
    const { triggerId } = request.params as { integrationId: string; triggerId: string };
    await store.deleteTrigger(triggerId);
    return reply.code(204).send();
  });
}
