// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Stub both provider SDKs so these tests never make a real network call — same
// pattern as relevanceFilter.test.ts.
const anthropicCreateMock = vi.fn();
const openaiCreateMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function AnthropicMock() {
    return { messages: { create: anthropicCreateMock } };
  }),
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(function OpenAIMock() {
    return { chat: { completions: { create: openaiCreateMock } } };
  }),
}));

import { callStructuredTool } from '../agent/structuredLlm.js';
import type { StructuredTool } from '../agent/structuredLlm.js';
import { getStore } from '../db/index.js';
import { buildApp, registerAndGetToken } from './setup.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

const TOOL: StructuredTool = {
  name: 'record',
  description: 'Record a structured result.',
  schema: {
    type: 'object',
    properties: { answer: { type: 'string' }, score: { type: 'number' } },
    required: ['answer', 'score'],
  },
};

function call(tenantId: string) {
  return callStructuredTool({
    tenantId,
    system: 'system prompt',
    messages: [{ role: 'user', content: 'hi' }],
    tool: TOOL,
  });
}

describe('callStructuredTool', () => {
  beforeEach(() => {
    anthropicCreateMock.mockReset();
    openaiCreateMock.mockReset();
  });

  it('returns null (no call) when the provider has no API key configured', async () => {
    const { tenantId } = await registerAndGetToken(app);
    await getStore().updateTenantSettings(tenantId, { llmProvider: 'anthropic', llmApiKey: '' });

    const result = await call(tenantId);
    expect(result).toBeNull();
    expect(anthropicCreateMock).not.toHaveBeenCalled();
    expect(openaiCreateMock).not.toHaveBeenCalled();
  });

  it('Anthropic: returns the forced tool_use input', async () => {
    const { tenantId } = await registerAndGetToken(app);
    await getStore().updateTenantSettings(tenantId, { llmProvider: 'anthropic', llmApiKey: 'k' });
    anthropicCreateMock.mockResolvedValueOnce({
      content: [{ type: 'tool_use', name: 'record', input: { answer: 'yes', score: 0.9 } }],
    });

    const result = await call(tenantId);
    expect(result).toEqual({ answer: 'yes', score: 0.9 });
    expect(openaiCreateMock).not.toHaveBeenCalled();
  });

  it('OpenAI-compatible (minimax): parses tool_call arguments JSON', async () => {
    const { tenantId } = await registerAndGetToken(app);
    await getStore().updateTenantSettings(tenantId, { llmProvider: 'minimax', llmApiKey: 'k' });
    openaiCreateMock.mockResolvedValueOnce({
      choices: [{
        message: {
          tool_calls: [{ type: 'function', function: { name: 'record', arguments: '{"answer":"maybe","score":0.5}' } }],
        },
      }],
    });

    const result = await call(tenantId);
    expect(result).toEqual({ answer: 'maybe', score: 0.5 });
    expect(anthropicCreateMock).not.toHaveBeenCalled();
    expect(openaiCreateMock).toHaveBeenCalledTimes(1);
  });

  it('MiniMax fallback: recovers tool args emitted as JSON in content (strips <think>)', async () => {
    const { tenantId } = await registerAndGetToken(app);
    await getStore().updateTenantSettings(tenantId, { llmProvider: 'minimax', llmApiKey: 'k' });
    openaiCreateMock.mockResolvedValueOnce({
      choices: [{
        message: {
          content: '<think>deliberating</think> Here is the result: {"answer":"fallback","score":0.3} done',
          tool_calls: [],
        },
      }],
    });

    const result = await call(tenantId);
    expect(result).toEqual({ answer: 'fallback', score: 0.3 });
  });

  it('returns null when the model produced no usable tool call or parseable content', async () => {
    const { tenantId } = await registerAndGetToken(app);
    await getStore().updateTenantSettings(tenantId, { llmProvider: 'openai', llmApiKey: 'k', llmBaseUrl: 'https://x.test/v1' });
    openaiCreateMock.mockResolvedValueOnce({
      choices: [{ message: { content: 'no json here', tool_calls: [] } }],
    });

    const result = await call(tenantId);
    expect(result).toBeNull();
  });
});
