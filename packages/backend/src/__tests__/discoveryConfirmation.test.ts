// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ExtractionResult } from '../agent/factExtractor.js';

const { runChatAgentMock, extractFactsMock } = vi.hoisted(() => ({
  runChatAgentMock: vi.fn(),
  extractFactsMock: vi.fn(),
}));
vi.mock('../agent/chatAgent.js', () => ({ runChatAgent: runChatAgentMock }));
vi.mock('../agent/factExtractor.js', () => ({ extractFacts: extractFactsMock }));

import { buildApp, SDK_KEY, TENANT_ID } from './setup.js';
import { getStore } from '../db/index.js';
import { config } from '../config.js';

let app: FastifyInstance;

beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });

beforeEach(() => {
  runChatAgentMock.mockReset();
  runChatAgentMock.mockResolvedValue({ reply: 'stub reply' });
  extractFactsMock.mockReset();
  (config as unknown as Record<string, unknown>).discoveryState = true;
});
afterEach(() => { (config as unknown as Record<string, unknown>).discoveryState = false; });

function chat(sessionId: string, message: string) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/chat',
    headers: { authorization: `Bearer ${SDK_KEY}` },
    payload: { sessionId, message, currentUrl: '/' },
  });
}

function extraction(result: Partial<ExtractionResult> & Pick<ExtractionResult, 'caseType' | 'facts'>) {
  extractFactsMock.mockResolvedValueOnce({ confirmation: 'none', productClaims: [], ...result });
}

const ALL_FEATURE_FACTS = [
  { field: 'problem_statement', value: 'cannot tell why an invoice was disputed', confidence: 0.95 },
  { field: 'affected_persona', value: 'AP analyst', confidence: 0.9 },
  { field: 'current_workflow', value: 'email finance and wait', confidence: 0.9 },
  { field: 'desired_outcome', value: 'see the dispute reason inline on the invoice', confidence: 0.95 },
  { field: 'business_impact', value: 'delays invoice processing by ~2 days', confidence: 0.9 },
  { field: 'example_scenario', value: 'invoice 4821 last Tuesday', confidence: 0.85 },
];

describe('Discovery confirmation + handoff lifecycle', () => {
  it('complete case → confirmation summary, then affirm files the handoff + requirement', async () => {
    const store = getStore();

    // Turn 1 — all required facts arrive; case becomes complete.
    extraction({ caseType: 'feature_request', facts: ALL_FEATURE_FACTS });
    await chat('cf-s1', 'here is everything about the dispute visibility request');

    let c = await store.getOrCreateCase({ tenantId: TENANT_ID, sessionId: 'cf-s1', platform: 'web' });
    expect(c.status).toBe('awaiting_confirmation');
    let turns = await store.getAgentTurns(c.id, TENANT_ID);
    expect(turns[0].nextAction).toBe('confirm');
    const confirmDirective = runChatAgentMock.mock.calls[0][12] as string;
    expect(confirmDirective.toLowerCase()).toContain('accurate');

    // Turn 2 — user confirms.
    extraction({ caseType: 'feature_request', facts: [], confirmation: 'affirm' });
    await chat('cf-s1', 'yes that is exactly right');

    c = await store.getOrCreateCase({ tenantId: TENANT_ID, sessionId: 'cf-s1', platform: 'web' });
    expect(c.status).toBe('filed');
    expect(c.featureRequestId).toBeTruthy();

    // Handoff feature request created from the facts.
    const frs = await store.getFeatureRequestsByTenantId(TENANT_ID, 'feature_request');
    const fr = frs.find((f) => f.id === c.featureRequestId);
    expect(fr).toBeTruthy();
    expect(fr!.submittedBy).toBe('q-discovery-agent');
    expect(fr!.description).toContain('Desired outcome');
    expect(fr!.description).toContain('see the dispute reason inline');

    // First-class requirement, customer-confirmed, linked to the handoff.
    const reqs = await store.getRequirementsByCase(c.id, TENANT_ID);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].customerConfirmed).toBe(true);
    expect(reqs[0].type).toBe('functional');
    expect(reqs[0].featureRequestId).toBe(c.featureRequestId);
    expect(reqs[0].statement).toContain('see the dispute reason inline');
    expect(reqs[0].sourceFactIds.length).toBe(ALL_FEATURE_FACTS.length);

    turns = await store.getAgentTurns(c.id, TENANT_ID);
    expect(turns[1].nextAction).toBe('handoff');

    const filedDirective = runChatAgentMock.mock.calls[1][12] as string;
    expect(filedDirective.toLowerCase()).toContain('recorded');
  });

  it('deny at confirmation returns the case to collecting', async () => {
    const store = getStore();
    extraction({ caseType: 'feature_request', facts: ALL_FEATURE_FACTS });
    await chat('cf-s2', 'all the details');

    extraction({ caseType: 'feature_request', facts: [], confirmation: 'deny' });
    await chat('cf-s2', 'no, the impact is wrong');

    const c = await store.getOrCreateCase({ tenantId: TENANT_ID, sessionId: 'cf-s2', platform: 'web' });
    expect(c.status).toBe('open');
    const turns = await store.getAgentTurns(c.id, TENANT_ID);
    expect(turns[1].nextAction).toBe('ask');
    // No handoff filed.
    const frs = await store.getFeatureRequestsByTenantId(TENANT_ID, 'feature_request');
    expect(frs.some((f) => f.id === c.featureRequestId)).toBe(false);
  });

  it('does not re-file after a case is already filed', async () => {
    const store = getStore();
    extraction({ caseType: 'feature_request', facts: ALL_FEATURE_FACTS });
    await chat('cf-s3', 'details');
    extraction({ caseType: 'feature_request', facts: [], confirmation: 'affirm' });
    await chat('cf-s3', 'yes');

    const before = (await store.getFeatureRequestsByTenantId(TENANT_ID, 'feature_request')).length;

    // A follow-up message after filing must not create another handoff.
    extraction({ caseType: 'feature_request', facts: [], confirmation: 'none' });
    await chat('cf-s3', 'thanks!');

    const c = await store.getOrCreateCase({ tenantId: TENANT_ID, sessionId: 'cf-s3', platform: 'web' });
    expect(c.status).toBe('filed');
    const after = (await store.getFeatureRequestsByTenantId(TENANT_ID, 'feature_request')).length;
    expect(after).toBe(before);
    const turns = await store.getAgentTurns(c.id, TENANT_ID);
    expect(turns[2].nextAction).toBe('answer');
  });
});
