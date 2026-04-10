// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getStore } from '../db/index.js';
import { logAudit } from '../middleware/audit.js';

const PlatformSchema = z.enum(['web', 'ios', 'android']);

const CreateEntryBody = z.object({
  feature: z.string().min(1),
  url: z.string().min(1),
  selector: z.string().min(1),
  description: z.string().min(1),
  preconditions: z.array(z.string()).optional(),
  source: z.enum(['manual', 'crawler']),
  platform: PlatformSchema.optional().default('web'),
});

const UpdateEntryBody = z.object({
  feature: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  selector: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  preconditions: z.array(z.string()).optional(),
  source: z.enum(['manual', 'crawler']).optional(),
  platform: PlatformSchema.optional(),
});

async function getSecretKeyTenant(authHeader: string | undefined) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const secretKey = authHeader.slice('Bearer '.length).trim();
  return (await getStore().getTenantBySecretKey(secretKey)) ?? null;
}

async function getSdkKeyTenant(authHeader: string | undefined) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const sdkKey = authHeader.slice('Bearer '.length).trim();
  return (await getStore().getTenantBySdkKey(sdkKey)) ?? null;
}

export async function mapRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/map', async (request, reply) => {
    const store = getStore();
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing or invalid Authorization header' });
    }

    const key = authHeader.slice('Bearer '.length).trim();
    const tenant = (await store.getTenantBySdkKey(key)) ?? (await store.getTenantBySecretKey(key));
    if (!tenant) {
      return reply.code(401).send({ error: 'Invalid key' });
    }

    let entries = await store.getMapEntriesByTenantId(tenant.id);

    const query = request.query as Record<string, string>;
    const includeReference = query.includeReference === 'true';

    // Filter by platform if ?platform= query param is provided
    if (query.platform && ['web', 'ios', 'android'].includes(query.platform)) {
      entries = entries.filter(e => (e.platform ?? 'web') === query.platform);
    }

    if (includeReference && tenant.id !== 'tenant-q-admin') {
      let referenceEntries = await store.getMapEntriesByTenantId('tenant-q-admin');
      if (query.platform && ['web', 'ios', 'android'].includes(query.platform)) {
        referenceEntries = referenceEntries.filter(e => (e.platform ?? 'web') === query.platform);
      }
      return reply.send({ entries, referenceEntries });
    }

    return reply.send({ entries });
  });

  app.get('/api/v1/map/logs', async (request, reply) => {
    const store = getStore();
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing or invalid Authorization header' });
    }

    const key = authHeader.slice('Bearer '.length).trim();
    const tenant = (await store.getTenantBySdkKey(key)) ?? (await store.getTenantBySecretKey(key));
    if (!tenant) {
      return reply.code(401).send({ error: 'Invalid key' });
    }

    const logs = await store.getInterventionLogs(tenant.id);
    return reply.send({ logs });
  });

  app.post('/api/v1/map', async (request, reply) => {
    const store = getStore();
    const tenant = await getSecretKeyTenant(request.headers.authorization);
    if (!tenant) {
      return reply.code(401).send({ error: 'Missing or invalid secret key' });
    }

    const parsed = CreateEntryBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.format() });
    }

    const { feature, url, selector, description, preconditions, source, platform } = parsed.data;
    const id = `entry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const entry = { id, tenantId: tenant.id, feature, url, selector, description, preconditions, source, platform };
    await store.addMapEntry(entry);

    await logAudit(request, 'map_entry.create', 'map_entry', id, { feature });

    return reply.code(201).send({ entry });
  });

  app.put('/api/v1/map/:id', async (request, reply) => {
    const store = getStore();
    const tenant = await getSecretKeyTenant(request.headers.authorization);
    if (!tenant) {
      return reply.code(401).send({ error: 'Missing or invalid secret key' });
    }

    const { id } = request.params as { id: string };
    const parsed = UpdateEntryBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.format() });
    }

    const updated = await store.updateMapEntry(id, tenant.id, parsed.data);
    if (!updated) {
      return reply.code(404).send({ error: 'Map entry not found' });
    }

    await logAudit(request, 'map_entry.update', 'map_entry', id);

    return reply.send({ entry: updated });
  });

  app.delete('/api/v1/map/:id', async (request, reply) => {
    const store = getStore();
    const tenant = await getSecretKeyTenant(request.headers.authorization);
    if (!tenant) {
      return reply.code(401).send({ error: 'Missing or invalid secret key' });
    }

    const { id } = request.params as { id: string };
    const deleted = await store.deleteMapEntry(id, tenant.id);
    if (!deleted) {
      return reply.code(404).send({ error: 'Map entry not found' });
    }

    await logAudit(request, 'map_entry.delete', 'map_entry', id);

    return reply.code(204).send();
  });
}
