// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { IntegrationHandler, IntegrationEventPayload } from '../handler.js';

export const slackHandler: IntegrationHandler = {
  type: 'slack',

  validateConfig(config: unknown): boolean {
    const c = config as Record<string, unknown>;
    return typeof c.webhookUrl === 'string' && c.webhookUrl.startsWith('https://hooks.slack.com/');
  },

  async execute(config: Record<string, unknown>, payload: IntegrationEventPayload): Promise<void> {
    const webhookUrl = config.webhookUrl as string;
    const channel = config.channel as string | undefined;

    const text = `*Q Alert* — \`${payload.eventType}\`\n` +
      `Tenant: \`${payload.tenantId}\`\n` +
      (payload.url ? `URL: ${payload.url}\n` : '') +
      (payload.message ? `Message: ${payload.message}\n` : '') +
      (payload.severity ? `Severity: ${payload.severity}\n` : '') +
      `Time: ${payload.timestamp}`;

    const body: Record<string, unknown> = { text };
    if (channel) body.channel = channel;

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Slack webhook returned ${res.status}`);
    }
  },

  async testConnection(config: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.execute(config, {
        eventType: 'test',
        tenantId: 'test',
        message: 'Q integration test — if you see this, the connection works!',
        timestamp: new Date().toISOString(),
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
