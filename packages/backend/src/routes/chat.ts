// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getStore } from '../db/index.js';
import { runChatAgent } from '../agent/chatAgent.js';
import { runDiscoveryStep } from '../agent/discovery.js';
import { extractFacts } from '../agent/factExtractor.js';
import { MODEL_BY_PLAN } from '../services/interventionService.js';
import { config } from '../config.js';
import { usageLimiter } from '../middleware/planLimits.js';
import { fireIntegrationEvent } from '../integrations/bus.js';
import { DeviceInfoSchema } from './events.js';

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
  // Attached to any feedback filed during this turn (see agent/tools.ts's
  // FeedbackContext) — not used for guidance itself, just richer bug reports.
  appVersion: z.string().optional(),
  deviceInfo: DeviceInfoSchema.optional(),
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

    const { message, currentUrl, history, platform, screenName, domSnapshot, appVersion, deviceInfo, sessionId } = parsed.data;
    const tenantId = tenant.id; // authoritative — resolved from SDK key

    const allEntries = await store.getMapEntriesByTenantId(tenantId);
    // Filter entries by platform so the agent only sees relevant selectors
    const entries = allEntries.filter(e => (e.platform ?? 'web') === platform);
    const model = tenant.model ?? MODEL_BY_PLAN[tenant.plan] ?? config.model;

    try {
      // Discovery state (Phase 1): when enabled, persist conversation server-side
      // and feed the agent history from the DB rather than the client-supplied
      // `history`. When disabled, behavior is identical to before.
      let caseRow: Awaited<ReturnType<typeof store.getOrCreateCase>> | undefined;
      let userMessageId: string | undefined;
      let effectiveHistory = history;
      // Phase 2: discovery analysis (fact extraction → playbook evaluation →
      // next-question directive). Populated only in discovery mode.
      let discovery: Awaited<ReturnType<typeof runDiscoveryStep>> | undefined;

      if (config.discoveryState) {
        caseRow = await store.getOrCreateCase({ tenantId, sessionId, platform });
        const userMsg = await store.appendMessage({
          id: randomUUID(),
          caseId: caseRow.id,
          tenantId,
          role: 'user',
          content: message,
          createdAt: new Date().toISOString(),
        });
        userMessageId = userMsg.id;
        // Server-persisted history is authoritative — the client cannot spoof
        // the agent's memory. Keep the most recent 20 messages (10 turns), which
        // includes the user message we just appended, so drop it from the tail
        // to avoid duplicating the current turn's input.
        const prior = await store.getMessages(caseRow.id, tenantId, 20);
        effectiveHistory = prior
          .filter((m) => m.id !== userMsg.id)
          .map((m) => ({ role: m.role, content: m.content }));

        // Extract facts, merge into the case, and evaluate the playbook BEFORE
        // the responder runs, so its directive can steer the next question.
        discovery = await runDiscoveryStep({
          store,
          caseRow,
          tenantId,
          message,
          userMessageId,
          history: effectiveHistory,
          extractor: extractFacts,
        });
      }

      const startedAt = Date.now();
      const result = await runChatAgent(message, tenantId, currentUrl, entries, model, effectiveHistory, platform, domSnapshot, screenName, appVersion, deviceInfo, sessionId, discovery?.directive);
      const latencyMs = Date.now() - startedAt;

      if (config.discoveryState && caseRow && userMessageId) {
        const asstMsg = await store.appendMessage({
          id: randomUUID(),
          caseId: caseRow.id,
          tenantId,
          role: 'assistant',
          content: result.reply,
          createdAt: new Date().toISOString(),
        });
        // Prefer the orchestrator's lifecycle action (ask/confirm/handoff/answer);
        // an intervention still takes precedence in the trace.
        const nextAction = result.intervention ? 'intervene' : discovery?.nextAction ?? 'answer';
        await store.recordAgentTurn({
          id: randomUUID(),
          caseId: caseRow.id,
          tenantId,
          sessionId,
          userMessageId,
          assistantMessageId: asstMsg.id,
          intent: discovery?.intent ?? caseRow.type,
          factsExtracted: discovery?.factsExtracted ?? [],
          retrievalQueries: [],
          missingFieldsBefore: discovery?.missingBefore ?? [],
          missingFieldsAfter: discovery?.missingAfter ?? [],
          nextAction,
          toolsCalled: [],
          model,
          latencyMs,
          createdAt: new Date().toISOString(),
        });
        await store.updateCase(caseRow.id, tenantId, { updatedAt: new Date().toISOString() });
      }

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
