// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getStore } from '../db/index.js';
import { runChatAgent } from '../agent/chatAgent.js';
import { MODEL_BY_PLAN } from '../services/interventionService.js';
import { config } from '../config.js';
import { usageLimiter } from '../middleware/planLimits.js';
import { fireIntegrationEvent } from '../integrations/bus.js';

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

const ChatBody = z.object({
  tenantId: z.string().optional(), // ignored — tenant resolved from SDK key
  sessionId: z.string().min(1),
  message: z.string().min(1),
  currentUrl: z.string().min(1),
  history: z.array(ChatMessageSchema).optional(), // prior conversation turns
  // Mobile context fields (optional, backward compatible)
  platform: z.enum(['web', 'ios', 'android']).optional().default('web'),
  screenName: z.string().optional(),
  domSnapshot: z.string().optional(), // Mobile: JSON view hierarchy string
});

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/chat', { preHandler: [usageLimiter('chat')] }, async (request, reply) => {
    const store = getStore();

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing or invalid Authorization header' });
    }
    const sdkKey = authHeader.slice('Bearer '.length).trim();
    const tenant = await store.getTenantBySdkKey(sdkKey);
    if (!tenant) {
      return reply.code(401).send({ error: 'Invalid SDK key' });
    }

    const parsed = ChatBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.format() });
    }

    const { message, currentUrl, history, platform, screenName, domSnapshot } = parsed.data;
    const tenantId = tenant.id; // authoritative — resolved from SDK key

    const allEntries = await store.getMapEntriesByTenantId(tenantId);
    // Filter entries by platform so the agent only sees relevant selectors
    const entries = allEntries.filter(e => (e.platform ?? 'web') === platform);
    const model = tenant.model ?? MODEL_BY_PLAN[tenant.plan] ?? config.model;

    try {
      const result = await runChatAgent(message, tenantId, currentUrl, entries, model, history, platform, domSnapshot);

      // Record usage
      await store.recordUsage(tenantId, 'chat');

      // Fire integration event
      fireIntegrationEvent('chat_started', tenantId, {
        sessionId: parsed.data.sessionId,
        url: currentUrl,
        message,
      });

      return reply.code(200).send(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      app.log.error({ err, tenantId }, 'Chat agent failed');
      return reply.code(500).send({ error: `Chat failed: ${msg}` });
    }
  });
}
