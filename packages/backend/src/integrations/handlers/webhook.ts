// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { createHmac } from 'node:crypto';
import type { IntegrationHandler, IntegrationEventPayload } from '../handler.js';

export const webhookHandler: IntegrationHandler = {
  type: 'webhook',

  validateConfig(config: unknown): boolean {
    const c = config as Record<string, unknown>;
    return typeof c.url === 'string' && c.url.startsWith('http');
  },

  async execute(config: Record<string, unknown>, payload: IntegrationEventPayload): Promise<void> {
    const { url, headers: customHeaders, method, secret } = config as {
      url: string;
      headers?: Record<string, string>;
      method?: string;
      secret?: string;
    };

    const body = JSON.stringify(payload);
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    // HMAC signature for verification
    if (secret) {
      const signature = createHmac('sha256', secret).update(body).digest('hex');
      reqHeaders['X-Q-Signature'] = signature;
    }

    const res = await fetch(url, {
      method: method ?? 'POST',
      headers: reqHeaders,
      body,
    });

    if (!res.ok) {
      throw new Error(`Webhook returned ${res.status}`);
    }
  },

  async testConnection(config: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.execute(config, {
        eventType: 'test',
        tenantId: 'test',
        message: 'Q webhook test',
        timestamp: new Date().toISOString(),
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
