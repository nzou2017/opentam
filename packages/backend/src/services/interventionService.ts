// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FrustrationEvent, InterventionCommand, Tenant, Platform } from '@opentam/shared';
import { getStore } from '../db/index.js';
import { runInterventionAgent } from '../agent/graph.js';
import { config } from '../config.js';

export const MODEL_BY_PLAN: Record<Tenant['plan'], string> = {
  hobbyist: 'claude-haiku-4-5-20251001',
  startup: 'claude-sonnet-4-6',
  enterprise: 'claude-opus-4-6',
};

export async function getIntervention(
  event: FrustrationEvent,
  tenant: Tenant,
  platform: Platform = 'web',
): Promise<InterventionCommand> {
  const store = getStore();
  const allEntries = await store.getMapEntriesByTenantId(event.tenantId);
  // Filter entries by platform so the agent only sees relevant selectors
  const entries = allEntries.filter(e => (e.platform ?? 'web') === platform);

  // Per-tenant provider config
  const tenantSettings = await store.getTenantSettings(tenant.id);
  const model = tenantSettings?.llmModel ?? tenant.model ?? MODEL_BY_PLAN[tenant.plan] ?? config.model;

  const intervention = await runInterventionAgent(event, entries, model, platform);
  intervention.platform = platform;
  return intervention;
}
