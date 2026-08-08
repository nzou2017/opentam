// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { config } from '../config.js';
import { getStore } from '../db/index.js';

// Only the first chunk of a doc is sent to the classifier — enough to judge
// relevance without the latency/cost of sending (and, for large files,
// re-sending on every crawl resume) the full text.
const EXCERPT_LENGTH = 500;

const SYSTEM_PROMPT = `You decide whether a document is worth indexing into a product's customer-support knowledge base, which an AI support agent searches to answer user questions about how to use the product.

RELEVANT: user-facing docs, guides, tutorials, FAQs, feature explanations, API/SDK reference docs, troubleshooting pages, release notes describing user-visible changes.
NOT RELEVANT: license files, changelogs that are just commit lists, code-of-conduct/contributing/governance docs, auto-generated boilerplate, files that are empty or near-empty, internal-only engineering notes (RFCs, ADRs, CI config docs) with no end-user-facing content.

Reply with exactly one word: RELEVANT or IRRELEVANT. No other text.`;

function buildUserPrompt(docPath: string, textExcerpt: string): string {
  return `Document path: ${docPath}\n\nExcerpt:\n${textExcerpt}`;
}

function parseVerdict(text: string): boolean {
  return /\bRELEVANT\b/i.test(text) && !/\bIRRELEVANT\b/i.test(text);
}

async function classifyWithAnthropic(apiKey: string, model: string, docPath: string, excerpt: string): Promise<boolean> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 10,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(docPath, excerpt) }],
  });
  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock?.type === 'text' ? parseVerdict(textBlock.text) : true;
}

async function classifyWithOpenAICompatible(baseURL: string | undefined, apiKey: string, model: string, docPath: string, excerpt: string): Promise<boolean> {
  const client = new OpenAI({ apiKey, baseURL });
  const response = await client.chat.completions.create({
    model,
    max_tokens: 10,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(docPath, excerpt) },
    ],
  });
  const text = response.choices[0]?.message?.content;
  return text ? parseVerdict(text) : true;
}

/**
 * Classifies whether a doc is worth indexing, using the tenant's own
 * configured LLM provider/key when set (same resolution as chatAgent.ts),
 * falling back to the deployment-wide default. Fails open (returns true —
 * index it) on any error, since silently dropping a possibly-relevant doc
 * is worse than indexing an occasional irrelevant one.
 */
export async function isDocRelevant(tenantId: string, docPath: string, textExcerpt: string): Promise<boolean> {
  const excerpt = textExcerpt.slice(0, EXCERPT_LENGTH).trim();
  if (!excerpt) return false; // nothing to index

  try {
    const tenantSettings = await getStore().getTenantSettings(tenantId);
    const provider = tenantSettings?.llmProvider ?? config.llmProvider;

    if (provider === 'gemini') {
      const apiKey = tenantSettings?.llmApiKey ?? config.geminiApiKey;
      if (!apiKey) return true;
      const model = tenantSettings?.llmModel?.startsWith('claude') ? config.geminiModel : (tenantSettings?.llmModel ?? config.geminiModel);
      return await classifyWithOpenAICompatible('https://generativelanguage.googleapis.com/v1beta/openai/', apiKey, model, docPath, excerpt);
    }

    if (provider === 'openai' || provider === 'minimax') {
      const apiKey = tenantSettings?.llmApiKey ?? config.llmApiKey;
      if (!apiKey) return true;
      const model = tenantSettings?.llmModel?.startsWith('claude') ? config.llmModel : (tenantSettings?.llmModel ?? config.llmModel);
      return await classifyWithOpenAICompatible(tenantSettings?.llmBaseUrl ?? config.llmBaseUrl, apiKey, model, docPath, excerpt);
    }

    // Anthropic (default)
    const apiKey = tenantSettings?.llmApiKey ?? config.anthropicApiKey;
    if (!apiKey) return true;
    const model = tenantSettings?.llmModel ?? config.model;
    return await classifyWithAnthropic(apiKey, model, docPath, excerpt);
  } catch {
    return true;
  }
}
