// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

export interface IntegrationEventPayload {
  eventType: string;
  tenantId: string;
  sessionId?: string;
  url?: string;
  message?: string;
  severity?: string;
  action?: string;
  confidence?: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface IntegrationHandler {
  type: string;
  validateConfig(config: unknown): boolean;
  execute(config: Record<string, unknown>, payload: IntegrationEventPayload): Promise<void>;
  testConnection(config: Record<string, unknown>): Promise<{ ok: boolean; error?: string }>;
}
