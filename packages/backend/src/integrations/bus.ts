// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { getStore } from '../db/index.js';
import type { IntegrationHandler, IntegrationEventPayload } from './handler.js';
import { slackHandler } from './handlers/slack.js';
import { jiraHandler } from './handlers/jira.js';
import { webhookHandler } from './handlers/webhook.js';

const handlers = new Map<string, IntegrationHandler>();

export function initIntegrationBus(): void {
  handlers.set('slack', slackHandler);
  handlers.set('jira', jiraHandler);
  handlers.set('webhook', webhookHandler);
}

export function getHandler(type: string): IntegrationHandler | undefined {
  return handlers.get(type);
}

export async function fireIntegrationEvent(eventType: string, tenantId: string, payload: Omit<IntegrationEventPayload, 'eventType' | 'tenantId' | 'timestamp'>): Promise<void> {
  const store = getStore();
  const fullPayload: IntegrationEventPayload = {
    ...payload,
    eventType,
    tenantId,
    timestamp: new Date().toISOString(),
  };

  try {
    const triggers = await store.getEnabledTriggersByEvent(tenantId, eventType);
    for (const trigger of triggers) {
      const handler = handlers.get(trigger.integration.type);
      if (!handler) continue;

      // Fire and forget
      handler.execute(trigger.integration.config, fullPayload).catch((err) => {
        console.error(`[integrations] ${trigger.integration.type} handler failed:`, err);
      });
    }
  } catch (err) {
    console.error('[integrations] Failed to fire event:', err);
  }
}
