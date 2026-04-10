// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import OpenAI from 'openai';
import { config } from '../config.js';

const BATCH_SIZE = 100;

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

async function openaiEmbedTexts(texts: string[]): Promise<number[][]> {
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
      ...(config.embeddingDimensions ? { dimensions: config.embeddingDimensions } : {}),
    });
    const sorted = response.data.sort((a, b) => a.index - b.index);
    results.push(...sorted.map((d) => d.embedding));
  }

  return results;
}

// ---------------------------------------------------------------------------
// MiniMax
// MiniMax uses asymmetric embeddings: type "db" for stored docs, "query" for search.
// Model: embo-01 (1536 dims). Supports MRL via the dimensions param.
// API ref: https://platform.minimaxi.com/document#embo-01
// ---------------------------------------------------------------------------

interface MiniMaxEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
}

async function minimaxEmbedBatch(
  texts: string[],
  type: 'db' | 'query',
): Promise<number[][]> {
  const body = {
    model: 'embo-01',
    input: texts,
    type,
    ...(config.embeddingDimensions ? { dimensions: config.embeddingDimensions } : {}),
  };

  // MiniMax requires GroupId as a query param when set
  const url = config.minimaxGroupId
    ? `https://api.minimax.chat/v1/embeddings?GroupId=${config.minimaxGroupId}`
    : 'https://api.minimax.chat/v1/embeddings';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.minimaxApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = await res.json() as Record<string, unknown>;

  // Check for MiniMax API-level errors (returned with 200 status)
  const baseResp = json['base_resp'] as { status_code?: number; status_msg?: string } | undefined;
  if (baseResp && baseResp.status_code !== 0) {
    throw new Error(`MiniMax API error ${baseResp.status_code}: ${baseResp.status_msg}`);
  }

  if (!res.ok) {
    throw new Error(`MiniMax HTTP error ${res.status}: ${JSON.stringify(json)}`);
  }

  // MiniMax returns { vectors: [{embedding, index}] }
  const vectors = (json['vectors'] ?? json['data']) as MiniMaxEmbeddingResponse['data'];
  return vectors.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

async function minimaxEmbedTexts(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = await minimaxEmbedBatch(texts.slice(i, i + BATCH_SIZE), 'db');
    results.push(...batch);
  }
  return results;
}

async function minimaxEmbedQuery(text: string): Promise<number[]> {
  const [embedding] = await minimaxEmbedBatch([text], 'query');
  return embedding;
}

// ---------------------------------------------------------------------------
// Ollama
// Endpoint: POST /api/embeddings  body: { model, prompt }
// Handles one text at a time — batch by looping.
// ---------------------------------------------------------------------------

interface OllamaEmbeddingResponse {
  embedding: number[];
}

async function ollamaEmbedOne(text: string): Promise<number[]> {
  const res = await fetch(`${config.ollamaUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.ollamaEmbeddingModel, prompt: text }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama embeddings error ${res.status}: ${err}`);
  }

  const json = (await res.json()) as OllamaEmbeddingResponse;
  return json.embedding;
}

async function ollamaEmbedTexts(texts: string[]): Promise<number[][]> {
  // Ollama has no batch endpoint — run sequentially
  const results: number[][] = [];
  for (const text of texts) {
    results.push(await ollamaEmbedOne(text));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Public API — provider-agnostic
// ---------------------------------------------------------------------------

/**
 * Embed an array of document texts for storage in ChromaDB.
 * Uses the configured EMBEDDING_PROVIDER.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  switch (config.embeddingProvider) {
    case 'minimax': return minimaxEmbedTexts(texts);
    case 'ollama':  return ollamaEmbedTexts(texts);
    default:        return openaiEmbedTexts(texts);
  }
}

/**
 * Embed a single search query.
 * MiniMax uses a distinct "query" embedding type for better retrieval quality.
 */
export async function embedQuery(text: string): Promise<number[]> {
  switch (config.embeddingProvider) {
    case 'minimax': return minimaxEmbedQuery(text);
    case 'ollama':  return ollamaEmbedOne(text);
    default: {
      const [embedding] = await openaiEmbedTexts([text]);
      return embedding;
    }
  }
}
