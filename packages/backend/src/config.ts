// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

// Load root .env (monorepo root is two levels up from packages/backend)
// then allow a local packages/backend/.env to override
loadEnv({ path: resolve(__dirname, '../../../.env') });
loadEnv({ path: resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  databaseUrl: process.env.DATABASE_URL ?? '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  // Embedding provider: 'openai' | 'minimax' | 'ollama'
  embeddingProvider: (process.env.EMBEDDING_PROVIDER ?? 'openai') as 'openai' | 'minimax' | 'ollama',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  ollamaUrl: process.env.OLLAMA_URL ?? 'http://localhost:11434',
  ollamaEmbeddingModel: process.env.OLLAMA_EMBEDDING_MODEL ?? 'nomic-embed-text',
  chromaUrl: process.env.CHROMA_URL ?? 'http://localhost:8000',
  // Optional: override the ChromaDB collection name for a tenant.
  // Useful when pointing Q at a pre-existing index (e.g. one built with LlamaIndex).
  // If unset, Q uses its own namespace: q_tenant_{tenantId}
  chromaCollection: process.env.CHROMA_COLLECTION ?? '',
  model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6', // cost-efficient default; override per tenant for higher plans
  // LLM provider for the chat agent:
  //   'anthropic' (default) — Anthropic SDK, full tool-use support
  //   'gemini'              — Google Gemini via its OpenAI-compatible endpoint
  //   'openai'              — any OpenAI-compatible endpoint (OpenAI, DeepSeek, Groq, Ollama, MiniMax, …)
  llmProvider: (process.env.LLM_PROVIDER ?? 'anthropic') as 'anthropic' | 'gemini' | 'openai' | 'minimax',

  // ── Anthropic ─────────────────────────────────────────────────────────────
  // anthropicApiKey already declared above; model controlled by ANTHROPIC_MODEL / per-tenant override.

  // ── Google Gemini ─────────────────────────────────────────────────────────
  // Uses Gemini's OpenAI-compatible REST layer — no extra SDK required.
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',

  // ── Generic OpenAI-compatible LLM ─────────────────────────────────────────
  // Works with OpenAI, DeepSeek, Groq, Ollama (/v1), MiniMax, OpenRouter, etc.
  // MINIMAX_* vars are accepted as fallbacks for backward compatibility.
  llmBaseUrl: process.env.LLM_BASE_URL ?? process.env.MINIMAX_BASE_URL ?? 'https://api.openai.com/v1',
  llmApiKey: process.env.LLM_API_KEY ?? process.env.MINIMAX_API_KEY ?? process.env.OPENAI_API_KEY ?? '',
  llmModel: process.env.LLM_MODEL ?? process.env.MINIMAX_CHAT_MODEL ?? 'gpt-4o',

  // ── Speech-to-text (any OpenAI-compatible STT endpoint) ───────────────────
  // STT_BASE_URL defaults to LLM_BASE_URL so single-provider setups need no extra config.
  // STT_PATH: OpenAI/Groq/DeepSeek use /audio/transcriptions; MiniMax uses /speech/recognitions.
  sttBaseUrl: process.env.STT_BASE_URL ?? process.env.LLM_BASE_URL ?? process.env.MINIMAX_BASE_URL ?? 'https://api.openai.com/v1',
  sttApiKey: process.env.STT_API_KEY ?? process.env.LLM_API_KEY ?? process.env.MINIMAX_API_KEY ?? process.env.OPENAI_API_KEY ?? '',
  sttModel: process.env.STT_MODEL ?? process.env.MINIMAX_STT_MODEL ?? 'whisper-1',
  sttPath: process.env.STT_PATH ?? '/audio/transcriptions',

  // Kept for backward compat (used by embedding provider 'minimax')
  minimaxApiKey: process.env.MINIMAX_API_KEY ?? '',
  minimaxGroupId: process.env.MINIMAX_GROUP_ID ?? '',
  minimaxBaseUrl: process.env.MINIMAX_BASE_URL ?? 'https://api.minimax.io/v1',
  // MRL: truncate embeddings to fewer dimensions for cheaper storage + faster search.
  // text-embedding-3-small supports 256–1536. nomic-embed-text supports 64–768.
  // Must match the dimension used when the ChromaDB collection was first created.
  embeddingDimensions: process.env.EMBEDDING_DIMENSIONS
    ? parseInt(process.env.EMBEDDING_DIMENSIONS, 10)
    : undefined, // undefined = provider default (full dimensions)

  // Testing mode: when true, Q admin portal can submit feature requests/bug reports to itself.
  // In production this should be false — end-users don't care about admin portal issues.
  testingMode: process.env.TESTING_MODE === 'true',
} as const;
