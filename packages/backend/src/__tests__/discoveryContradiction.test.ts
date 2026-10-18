// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, TENANT_ID } from './setup.js';
import { getStore } from '../db/index.js';
import { runDiscoveryStep } from '../agent/discovery.js';
import type { FactExtractor } from '../agent/factExtractor.js';
import type { ContradictionJudge } from '../agent/contradiction.js';
import type { KnowledgeService } from '../services/knowledgeService.js';

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });

const extractorWithClaim: FactExtractor = async () => ({
  caseType: 'feature_request',
  facts: [{ field: 'problem_statement', value: 'templates are limited', confidence: 0.9 }],
  confirmation: 'none',
  productClaims: ['templates can already be configured per dispute reason'],
});

const strongKnowledge: KnowledgeService = {
  searchProduct: async () => [
    { text: 'The standard notification uses one global template.', docId: 'd1', score: 0.9 },
    { text: 'Per-reason templates are not supported.', docId: 'd2', score: 0.8 },
  ],
};

const conflictJudge: ContradictionJudge = async () => ({
  conflict: true,
  kbClaim: 'the product uses one global template, not per-reason templates',
});

describe('runDiscoveryStep — contradiction detection', () => {
  it('flags a product-belief contradiction and folds it into the directive + trace', async () => {
    const store = getStore();
    const caseRow = await store.getOrCreateCase({ tenantId: TENANT_ID, sessionId: 'ct-1', platform: 'web' });

    const result = await runDiscoveryStep({
      store,
      caseRow,
      tenantId: TENANT_ID,
      message: 'we already configure a template per dispute reason, but it is clunky',
      userMessageId: 'u1',
      history: [],
      extractor: extractorWithClaim,
      knowledge: strongKnowledge,
      judge: conflictJudge,
    });

    expect(result.contradictions).toHaveLength(1);
    expect(result.contradictions[0].customerClaim).toContain('per dispute reason');
    expect(result.contradictions[0].kbClaim).toContain('one global template');
    expect(result.retrievalQueries).toEqual(['templates can already be configured per dispute reason']);
    // The responder is told not to confirm the contradicted capability.
    expect(result.directive).toContain('contradicts');
    expect(result.directive.toLowerCase()).toContain('do not confirm');
    // Lifecycle still proceeds (collecting the rest).
    expect(result.nextAction).toBe('ask');
  });

  it('no knowledge/judge injected → no contradiction work, no directive prefix', async () => {
    const store = getStore();
    const caseRow = await store.getOrCreateCase({ tenantId: TENANT_ID, sessionId: 'ct-2', platform: 'web' });

    const result = await runDiscoveryStep({
      store,
      caseRow,
      tenantId: TENANT_ID,
      message: 'we already configure a template per dispute reason',
      userMessageId: 'u1',
      history: [],
      extractor: extractorWithClaim,
      // knowledge + judge omitted
    });

    expect(result.contradictions).toEqual([]);
    expect(result.directive).not.toContain('contradicts');
    // retrievalQueries still reflects the planned product-claim lookups.
    expect(result.retrievalQueries).toEqual(['templates can already be configured per dispute reason']);
  });

  it('judge clears the claim → no contradiction surfaced', async () => {
    const store = getStore();
    const caseRow = await store.getOrCreateCase({ tenantId: TENANT_ID, sessionId: 'ct-3', platform: 'web' });

    const result = await runDiscoveryStep({
      store,
      caseRow,
      tenantId: TENANT_ID,
      message: 'does it support per-reason templates?',
      userMessageId: 'u1',
      history: [],
      extractor: extractorWithClaim,
      knowledge: strongKnowledge,
      judge: async () => ({ conflict: false, kbClaim: '' }),
    });

    expect(result.contradictions).toEqual([]);
    expect(result.directive).not.toContain('contradicts');
  });
});
