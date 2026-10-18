// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { config } from '../config.js';
import { getStore } from '../db/index.js';

// Shared provider-agnostic "forced tool call" used by the discovery agent's
// structured steps (fact extraction §25, contradiction judging §15). The agent
// must produce structured JSON regardless of which LLM a tenant runs, so this
// mirrors the chat agent's provider dispatch (see chatAgent.ts): Anthropic uses
// its native SDK; every OpenAI-compatible provider (OpenAI, MiniMax, Gemini's
// compat layer, DeepSeek, …) goes through the OpenAI SDK with function calling.

export interface StructuredTool {
  name: string;
  description: string;
  /** JSON-schema object describing the tool arguments. */
  schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface StructuredCallArgs {
  tenantId: string;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  tool: StructuredTool;
  maxTokens?: number;
}

type Resolved =
  | { kind: 'anthropic'; model: string; apiKey: string }
  | { kind: 'openai'; model: string; apiKey: string; baseURL: string };

// Resolve the tenant's provider into a concrete client config, or null when no
// usable API key is configured (caller then treats the turn as "no extraction"
// rather than throwing). Model overrides pointing at a Claude model are ignored
// on non-Anthropic providers — same guard the chat agent applies.
async function resolveLlm(tenantId: string): Promise<Resolved | null> {
  const store = getStore();
  const s = await store.getTenantSettings(tenantId);
  const provider = s?.llmProvider ?? config.llmProvider;

  if (provider === 'gemini') {
    const apiKey = s?.llmApiKey ?? config.geminiApiKey;
    if (!apiKey) return null;
    const model = s?.llmModel && !s.llmModel.startsWith('claude') ? s.llmModel : config.geminiModel;
    return { kind: 'openai', model, apiKey, baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/' };
  }

  if (provider === 'openai' || provider === 'minimax') {
    const apiKey = s?.llmApiKey ?? config.llmApiKey;
    if (!apiKey) return null;
    const model = s?.llmModel && !s.llmModel.startsWith('claude') ? s.llmModel : config.llmModel;
    return { kind: 'openai', model, apiKey, baseURL: s?.llmBaseUrl ?? config.llmBaseUrl };
  }

  // Anthropic (default)
  const apiKey = s?.llmApiKey ?? config.anthropicApiKey;
  if (!apiKey) return null;
  return { kind: 'anthropic', model: s?.llmModel ?? config.model, apiKey };
}

/**
 * Make one forced-tool call and return the tool's arguments as a plain object,
 * or null when the provider isn't configured or the model produced no usable
 * tool call. Callers own validation/coercion of the returned shape.
 */
export async function callStructuredTool(args: StructuredCallArgs): Promise<Record<string, unknown> | null> {
  const resolved = await resolveLlm(args.tenantId);
  if (!resolved) return null;
  const maxTokens = args.maxTokens ?? 512;

  if (resolved.kind === 'anthropic') {
    const client = new Anthropic({ apiKey: resolved.apiKey });
    const response = await client.messages.create({
      model: resolved.model,
      max_tokens: maxTokens,
      system: args.system,
      tools: [{ name: args.tool.name, description: args.tool.description, input_schema: args.tool.schema }],
      tool_choice: { type: 'tool', name: args.tool.name },
      messages: args.messages.map((m) => ({ role: m.role, content: m.content })),
    });
    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === args.tool.name) {
        return block.input as Record<string, unknown>;
      }
    }
    return null;
  }

  // OpenAI-compatible (openai / minimax / gemini compat layer)
  const client = new OpenAI({ apiKey: resolved.apiKey, baseURL: resolved.baseURL });
  const response = await client.chat.completions.create({
    model: resolved.model,
    max_tokens: maxTokens,
    tools: [{ type: 'function', function: { name: args.tool.name, description: args.tool.description, parameters: args.tool.schema } }],
    tool_choice: { type: 'function', function: { name: args.tool.name } },
    messages: [
      { role: 'system', content: args.system },
      ...args.messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });

  const choice = response.choices[0];
  const call = choice?.message.tool_calls?.find((t) => t.type === 'function' && t.function.name === args.tool.name);
  if (call && call.type === 'function') {
    try {
      return JSON.parse(call.function.arguments) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  // Fallback: some compat models (notably MiniMax) emit the tool arguments as a
  // JSON object in the message content instead of via tool_calls. Strip any
  // <think> reasoning block and parse the first {...} object we find.
  const content = choice?.message.content;
  if (typeof content === 'string') {
    const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }
  return null;
}
