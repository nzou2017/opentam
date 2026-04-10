// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getStore } from '../db/index.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { logAudit } from '../middleware/audit.js';

function maskApiKey(key?: string): string | undefined {
  if (!key) return undefined;
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

const SettingsBody = z.object({
  llmProvider: z.string().optional(),
  llmApiKey: z.string().optional(),
  llmBaseUrl: z.string().optional(),
  llmModel: z.string().optional(),
  sttBaseUrl: z.string().optional(),
  sttApiKey: z.string().optional(),
  sttModel: z.string().optional(),
  sttPath: z.string().optional(),
  embeddingProvider: z.string().optional(),
  openaiApiKey: z.string().optional(),
  ollamaUrl: z.string().optional(),
  ollamaEmbeddingModel: z.string().optional(),
  chromaUrl: z.string().optional(),
  chromaCollection: z.string().optional(),
  embeddingDimensions: z.number().int().positive().optional(),
});

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // Get settings (API keys masked)
  app.get('/api/v1/tenant/settings', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const store = getStore();
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const settings = await store.getTenantSettings(tenantId);
    if (!settings) {
      return reply.send({});
    }

    return reply.send({
      ...settings,
      llmApiKey: maskApiKey(settings.llmApiKey),
      sttApiKey: maskApiKey(settings.sttApiKey),
      openaiApiKey: maskApiKey(settings.openaiApiKey),
    });
  });

  // Update settings (owner only)
  app.put('/api/v1/tenant/settings', { preHandler: [requireRole('owner')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const store = getStore();
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const parsed = SettingsBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid settings', details: parsed.error.format() });
    }

    await store.updateTenantSettings(tenantId, parsed.data);
    await logAudit(request, 'settings.update', 'settings', tenantId);
    const updated = await store.getTenantSettings(tenantId);

    return reply.send({
      ...updated,
      llmApiKey: maskApiKey(updated?.llmApiKey),
      sttApiKey: maskApiKey(updated?.sttApiKey),
      openaiApiKey: maskApiKey(updated?.openaiApiKey),
    });
  });
}
