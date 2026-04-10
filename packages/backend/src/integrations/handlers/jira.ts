// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { IntegrationHandler, IntegrationEventPayload } from '../handler.js';

export const jiraHandler: IntegrationHandler = {
  type: 'jira',

  validateConfig(config: unknown): boolean {
    const c = config as Record<string, unknown>;
    return typeof c.baseUrl === 'string' &&
      typeof c.email === 'string' &&
      typeof c.apiToken === 'string' &&
      typeof c.projectKey === 'string';
  },

  async execute(config: Record<string, unknown>, payload: IntegrationEventPayload): Promise<void> {
    const { baseUrl, email, apiToken, projectKey, issueType } = config as {
      baseUrl: string; email: string; apiToken: string; projectKey: string; issueType?: string;
    };

    const summary = `[Q] ${payload.eventType}: ${payload.message ?? payload.url ?? 'Frustration detected'}`;
    const description = [
      `*Event:* ${payload.eventType}`,
      `*Tenant:* ${payload.tenantId}`,
      payload.url ? `*URL:* ${payload.url}` : null,
      payload.severity ? `*Severity:* ${payload.severity}` : null,
      payload.message ? `*Message:* ${payload.message}` : null,
      `*Time:* ${payload.timestamp}`,
    ].filter(Boolean).join('\n');

    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
      },
      body: JSON.stringify({
        fields: {
          project: { key: projectKey },
          summary: summary.slice(0, 255),
          description: {
            type: 'doc',
            version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
          },
          issuetype: { name: issueType ?? 'Task' },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`JIRA API returned ${res.status}: ${body.slice(0, 200)}`);
    }
  },

  async testConnection(config: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    const { baseUrl, email, apiToken } = config as { baseUrl: string; email: string; apiToken: string };
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/rest/api/3/myself`, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
        },
      });
      if (!res.ok) return { ok: false, error: `JIRA returned ${res.status}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
