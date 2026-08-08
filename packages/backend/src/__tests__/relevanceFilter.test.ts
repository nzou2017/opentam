// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Stub both provider SDKs so these tests never make a real network call,
// regardless of which provider the deployment's .env or a tenant override
// happens to select — mirrors the reasoning in vitest.config.ts for why
// EMBEDDING_PROVIDER/OPENAI_API_KEY are forced empty for the ingest tests.
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

import { isDocRelevant } from '../ingestion/relevanceFilter.js';
import { getStore } from '../db/index.js';
import { buildApp, registerAndGetToken } from './setup.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

function anthropicReply(text: string) {
  anthropicCreateMock.mockResolvedValueOnce({ content: [{ type: 'text', text }] });
}

function openaiReply(text: string) {
  openaiCreateMock.mockResolvedValueOnce({ choices: [{ message: { content: text } }] });
}

describe('isDocRelevant', () => {
  beforeEach(() => {
    anthropicCreateMock.mockReset();
    openaiCreateMock.mockReset();
  });

  it('returns false immediately for an empty/whitespace-only excerpt, without calling any LLM', async () => {
    const { tenantId } = await registerAndGetToken(app);
    const result = await isDocRelevant(tenantId, 'docs/empty.md', '   \n  ');
    expect(result).toBe(false);
    expect(anthropicCreateMock).not.toHaveBeenCalled();
    expect(openaiCreateMock).not.toHaveBeenCalled();
  });

  it('uses the tenant-configured provider (Anthropic) and returns true for a RELEVANT verdict', async () => {
    const { tenantId } = await registerAndGetToken(app);
    await getStore().updateTenantSettings(tenantId, { llmProvider: 'anthropic', llmApiKey: 'test-anthropic-key' });
    anthropicReply('RELEVANT');

    const result = await isDocRelevant(tenantId, 'docs/getting-started.md', 'How to install and configure the product...');
    expect(result).toBe(true);
    expect(anthropicCreateMock).toHaveBeenCalledTimes(1);
    expect(openaiCreateMock).not.toHaveBeenCalled();
  });

  it('uses the tenant-configured provider (Anthropic) and returns false for an IRRELEVANT verdict', async () => {
    const { tenantId } = await registerAndGetToken(app);
    await getStore().updateTenantSettings(tenantId, { llmProvider: 'anthropic', llmApiKey: 'test-anthropic-key' });
    anthropicReply('IRRELEVANT');

    const result = await isDocRelevant(tenantId, 'LICENSE', 'MIT License\n\nCopyright (c) 2026...');
    expect(result).toBe(false);
  });

  it('routes to the OpenAI-compatible client when the tenant is configured for openai', async () => {
    const { tenantId } = await registerAndGetToken(app);
    await getStore().updateTenantSettings(tenantId, { llmProvider: 'openai', llmApiKey: 'test-openai-key', llmBaseUrl: 'https://example.test/v1' });
    openaiReply('RELEVANT');

    const result = await isDocRelevant(tenantId, 'docs/faq.md', 'Frequently asked questions about billing...');
    expect(result).toBe(true);
    expect(openaiCreateMock).toHaveBeenCalledTimes(1);
    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });

  it('routes minimax through the OpenAI-compatible client too', async () => {
    const { tenantId } = await registerAndGetToken(app);
    await getStore().updateTenantSettings(tenantId, { llmProvider: 'minimax', llmApiKey: 'test-minimax-key' });
    openaiReply('IRRELEVANT');

    const result = await isDocRelevant(tenantId, 'CHANGELOG.md', '- bumped deps\n- fixed typo');
    expect(result).toBe(false);
    expect(openaiCreateMock).toHaveBeenCalledTimes(1);
  });

  it('fails open (returns true) when the classifier call throws', async () => {
    const { tenantId } = await registerAndGetToken(app);
    await getStore().updateTenantSettings(tenantId, { llmProvider: 'anthropic', llmApiKey: 'test-anthropic-key' });
    anthropicCreateMock.mockRejectedValueOnce(new Error('network error'));

    const result = await isDocRelevant(tenantId, 'docs/whatever.md', 'Some content here.');
    expect(result).toBe(true);
  });

  it('only sends the first 500 characters of the excerpt to the classifier', async () => {
    const { tenantId } = await registerAndGetToken(app);
    await getStore().updateTenantSettings(tenantId, { llmProvider: 'anthropic', llmApiKey: 'test-anthropic-key' });
    anthropicReply('RELEVANT');

    const longText = 'A'.repeat(2000);
    await isDocRelevant(tenantId, 'docs/long.md', longText);

    const call = anthropicCreateMock.mock.calls[0][0];
    const userMessage = call.messages[0].content as string;
    const excerptSentToLlm = userMessage.split('Excerpt:\n')[1];
    expect(excerptSentToLlm.length).toBeLessThanOrEqual(500);
  });
});
