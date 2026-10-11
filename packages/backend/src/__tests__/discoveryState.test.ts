// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Stub the chat agent so the /chat route completes without a real LLM call.
// `vi.hoisted` makes the mock fn available to the hoisted vi.mock factory.
const { runChatAgentMock } = vi.hoisted(() => ({ runChatAgentMock: vi.fn() }));
vi.mock('../agent/chatAgent.js', () => ({ runChatAgent: runChatAgentMock }));

import { buildApp, SDK_KEY, TENANT_ID } from './setup.js';
import { getStore } from '../db/index.js';
import { config } from '../config.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  runChatAgentMock.mockReset();
  runChatAgentMock.mockResolvedValue({ reply: 'stub reply' });
});

// `config.discoveryState` is read at request time, so flip the runtime value
// per-test (the `as const` on config is compile-time only).
function setDiscoveryState(on: boolean) {
  (config as unknown as Record<string, unknown>).discoveryState = on;
}
afterEach(() => setDiscoveryState(false));

function chat(sessionId: string, message: string, history?: { role: string; content: string }[]) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/chat',
    headers: { authorization: `Bearer ${SDK_KEY}` },
    payload: { sessionId, message, currentUrl: '/', history },
  });
}

describe('Discovery state — store layer', () => {
  it('getOrCreateCase is idempotent per (tenant, session)', async () => {
    const store = getStore();
    const c1 = await store.getOrCreateCase({ tenantId: TENANT_ID, sessionId: 'disc-s1', platform: 'web' });
    const c2 = await store.getOrCreateCase({ tenantId: TENANT_ID, sessionId: 'disc-s1', platform: 'web' });
    expect(c2.id).toBe(c1.id);
    expect(c1.type).toBe('unknown');
    expect(c1.status).toBe('open');
  });

  it('appendMessage assigns monotonic seq; getMessages returns ordered + honors limit', async () => {
    const store = getStore();
    const c = await store.getOrCreateCase({ tenantId: TENANT_ID, sessionId: 'disc-s2', platform: 'web' });
    const now = new Date().toISOString();
    const m1 = await store.appendMessage({ id: 'm-a', caseId: c.id, tenantId: TENANT_ID, role: 'user', content: '1', createdAt: now });
    const m2 = await store.appendMessage({ id: 'm-b', caseId: c.id, tenantId: TENANT_ID, role: 'assistant', content: '2', createdAt: now });
    const m3 = await store.appendMessage({ id: 'm-c', caseId: c.id, tenantId: TENANT_ID, role: 'user', content: '3', createdAt: now });
    expect([m1.seq, m2.seq, m3.seq]).toEqual([1, 2, 3]);

    const all = await store.getMessages(c.id, TENANT_ID);
    expect(all.map((m) => m.content)).toEqual(['1', '2', '3']);

    const lastTwo = await store.getMessages(c.id, TENANT_ID, 2);
    expect(lastTwo.map((m) => m.content)).toEqual(['2', '3']);
  });

  it('facts and turns persist and are tenant-scoped', async () => {
    const store = getStore();
    const c = await store.getOrCreateCase({ tenantId: TENANT_ID, sessionId: 'disc-s3', platform: 'web' });
    const now = new Date().toISOString();

    await store.addFact({
      id: 'f-1', caseId: c.id, tenantId: TENANT_ID, field: 'problem_statement',
      value: 'cannot export', sourceType: 'customer', confidence: 0.9,
      status: 'customer_stated', createdAt: now,
    });
    const facts = await store.getFacts(c.id, TENANT_ID);
    expect(facts).toHaveLength(1);
    expect(facts[0].field).toBe('problem_statement');
    // Wrong tenant sees nothing.
    expect(await store.getFacts(c.id, 'tenant-other')).toHaveLength(0);

    await store.recordAgentTurn({
      id: 't-1', caseId: c.id, tenantId: TENANT_ID, sessionId: 'disc-s3',
      userMessageId: 'u-1', intent: 'unknown',
      factsExtracted: [], retrievalQueries: [], missingFieldsBefore: [], missingFieldsAfter: [],
      nextAction: 'answer', toolsCalled: [], model: 'test-model', latencyMs: 5, createdAt: now,
    });
    const turns = await store.getAgentTurns(c.id, TENANT_ID);
    expect(turns).toHaveLength(1);
    expect(turns[0].nextAction).toBe('answer');
    expect(await store.getAgentTurns(c.id, 'tenant-other')).toHaveLength(0);
  });
});

describe('Discovery state — chat route wiring', () => {
  it('flag ON: server history is authoritative, client history ignored', async () => {
    setDiscoveryState(true);
    const store = getStore();

    // First turn — bogus client history must NOT reach the agent.
    const r1 = await chat('route-s1', 'first message', [{ role: 'user', content: 'SPOOFED' }]);
    expect(r1.statusCode).toBe(200);
    const firstHistoryArg = runChatAgentMock.mock.calls[0][5] as { role: string; content: string }[];
    expect(firstHistoryArg).toEqual([]); // only message is the current user turn, which we drop from the tail
    expect(JSON.stringify(firstHistoryArg)).not.toContain('SPOOFED');

    // Second turn — agent should now see the persisted first turn, still not the spoof.
    const r2 = await chat('route-s1', 'second message', [{ role: 'user', content: 'SPOOFED' }]);
    expect(r2.statusCode).toBe(200);
    const secondHistoryArg = runChatAgentMock.mock.calls[1][5] as { role: string; content: string }[];
    expect(secondHistoryArg.map((m) => m.content)).toEqual(['first message', 'stub reply']);
    expect(JSON.stringify(secondHistoryArg)).not.toContain('SPOOFED');

    // 2 user + 2 assistant messages, and one trace per request.
    const c = await store.getOrCreateCase({ tenantId: TENANT_ID, sessionId: 'route-s1', platform: 'web' });
    const msgs = await store.getMessages(c.id, TENANT_ID);
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    const turns = await store.getAgentTurns(c.id, TENANT_ID);
    expect(turns).toHaveLength(2);
    expect(turns[0].model).toBeTruthy();
    expect(turns[0].assistantMessageId).toBeTruthy();
    expect(turns[0].latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('flag OFF: client history passed through verbatim, no case persisted', async () => {
    setDiscoveryState(false);
    const store = getStore();
    const clientHistory = [{ role: 'user', content: 'PRIOR TURN' }];
    const res = await chat('route-off', 'hello', clientHistory);
    expect(res.statusCode).toBe(200);

    // Agent got exactly the client-supplied history — no server substitution.
    const historyArg = runChatAgentMock.mock.calls[0][5];
    expect(historyArg).toEqual(clientHistory);

    // No discovery rows were written for this session: getMessages on a
    // freshly-created case (created only now, by this assertion) is empty.
    const c = await store.getOrCreateCase({ tenantId: TENANT_ID, sessionId: 'route-off', platform: 'web' });
    expect(await store.getMessages(c.id, TENANT_ID)).toHaveLength(0);
    expect(await store.getAgentTurns(c.id, TENANT_ID)).toHaveLength(0);
  });
});
