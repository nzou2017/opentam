// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ExtractionResult } from '../agent/factExtractor.js';

// Stub the responder (no real LLM) and the fact extractor (deterministic facts).
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

describe('Discovery playbook orchestration', () => {
  it('classifies the case, persists facts, and traces the turn', async () => {
    const store = getStore();
    extraction({
      caseType: 'feature_request',
      facts: [
        { field: 'problem_statement', value: 'cannot tell why an invoice was disputed', confidence: 0.95 },
        { field: 'affected_persona', value: 'AP analyst', confidence: 0.9 },
      ],
    });

    const res = await chat('pb-s1', 'I wish I could see the dispute reason on invoices');
    expect(res.statusCode).toBe(200);

    const c = await store.getOrCreateCase({ tenantId: TENANT_ID, sessionId: 'pb-s1', platform: 'web' });
    expect(c.type).toBe('feature_request'); // reclassified from 'unknown'

    const facts = await store.getFacts(c.id, TENANT_ID);
    expect(facts.map((f) => f.field).sort()).toEqual(['affected_persona', 'problem_statement']);
    expect(facts.every((f) => f.sourceType === 'customer' && f.status === 'customer_stated')).toBe(true);

    const turns = await store.getAgentTurns(c.id, TENANT_ID);
    expect(turns).toHaveLength(1);
    expect(turns[0].intent).toBe('feature_request');
    expect(turns[0].nextAction).toBe('ask'); // required fields still missing
    expect((turns[0].factsExtracted as unknown[]).length).toBe(2);
    // Before the turn the case was 'unknown' (no playbook) → no baseline missing.
    expect(turns[0].missingFieldsBefore).toEqual([]);
    expect(turns[0].missingFieldsAfter).toContain('desired_outcome');
    expect(turns[0].missingFieldsAfter).not.toContain('problem_statement');
  });

  it('feeds the next-question directive into the responder', async () => {
    extraction({
      caseType: 'feature_request',
      facts: [{ field: 'problem_statement', value: 'no dispute visibility', confidence: 0.9 }],
    });
    await chat('pb-s2', 'dispute visibility is a problem');

    // runChatAgent's 13th positional arg (index 12) is the discovery directive.
    const directive = runChatAgentMock.mock.calls[0][12] as string;
    expect(directive).toContain('DISCOVERY CONTEXT');
    expect(directive).toContain('problem_statement'); // listed as already known
    expect(directive.toLowerCase()).toContain('ask one'); // one-question guidance
  });

  it('accumulates facts across turns and shrinks the missing set', async () => {
    const store = getStore();
    extraction({ caseType: 'feature_request', facts: [{ field: 'problem_statement', value: 'p', confidence: 0.9 }] });
    await chat('pb-s3', 'first');

    extraction({
      caseType: 'feature_request',
      facts: [
        { field: 'desired_outcome', value: 'see reason inline', confidence: 0.9 },
        { field: 'current_workflow', value: 'email finance', confidence: 0.8 },
      ],
    });
    await chat('pb-s3', 'second');

    const c = await store.getOrCreateCase({ tenantId: TENANT_ID, sessionId: 'pb-s3', platform: 'web' });
    const facts = await store.getFacts(c.id, TENANT_ID);
    expect(facts).toHaveLength(3);

    const turns = await store.getAgentTurns(c.id, TENANT_ID);
    expect(turns).toHaveLength(2);
    // Second turn saw problem_statement already present as its baseline.
    expect(turns[1].missingFieldsBefore).toContain('desired_outcome');
    expect(turns[1].missingFieldsAfter).not.toContain('desired_outcome');
    expect(turns[1].missingFieldsAfter).not.toContain('current_workflow');
  });

  it('positive_feedback has no playbook: no directive, answer action', async () => {
    const store = getStore();
    extraction({ caseType: 'positive_feedback', facts: [] });
    await chat('pb-s4', 'love this app');

    const directive = runChatAgentMock.mock.calls[0][12] as string | undefined;
    expect(directive === '' || directive === undefined).toBe(true);

    const c = await store.getOrCreateCase({ tenantId: TENANT_ID, sessionId: 'pb-s4', platform: 'web' });
    const turns = await store.getAgentTurns(c.id, TENANT_ID);
    expect(turns[0].intent).toBe('positive_feedback');
    expect(turns[0].nextAction).toBe('answer');
  });
});
