// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { ChromaClient } from 'chromadb';
import { config } from '../config.js';

// Collection per tenant: q_tenant_{tenantId}
// Override with CHROMA_COLLECTION env var to point at a pre-existing index.
// ChromaDB names must be 3-63 chars, alphanumeric + underscores/hyphens
function collectionName(tenantId: string): string {
  if (config.chromaCollection) return config.chromaCollection;
  return `q_tenant_${tenantId.replace(/[^a-z0-9_-]/gi, '_')}`;
}

function getClient(): ChromaClient {
  return new ChromaClient({ path: config.chromaUrl });
}

async function getCollection(tenantId: string) {
  const client = getClient();
  // Use getCollection (not getOrCreateCollection) when pointing at an existing index
  // so Q doesn't silently create an empty collection if the name is wrong.
  if (config.chromaCollection) {
    return client.getCollection({ name: config.chromaCollection });
  }
  return client.getOrCreateCollection({
    name: collectionName(tenantId),
    metadata: { 'hnsw:space': 'cosine' },
  });
}

/**
 * No-op for ChromaDB — collections are created on demand in getOrCreateCollection.
 * Kept for API compatibility with the pipeline.
 */
export async function ensureIndex(): Promise<void> {
  // ChromaDB creates collections lazily — nothing to pre-provision
}

/**
 * Upsert chunk vectors for a document into the tenant collection.
 */
export async function upsertChunks(
  tenantId: string,
  docId: string,
  chunks: string[],
  embeddings: number[][],
): Promise<void> {
  const collection = await getCollection(tenantId);

  const ids = chunks.map((_, i) => `${docId}-chunk-${i}`);
  const metadatas = chunks.map((_, i) => ({ tenantId, docId, chunkIndex: i }));

  // ChromaDB upsert in batches of 100
  const BATCH = 100;
  for (let i = 0; i < chunks.length; i += BATCH) {
    await collection.upsert({
      ids: ids.slice(i, i + BATCH),
      embeddings: embeddings.slice(i, i + BATCH),
      documents: chunks.slice(i, i + BATCH),
      metadatas: metadatas.slice(i, i + BATCH),
    });
  }
}

/**
 * Query ChromaDB for the most relevant chunks for a given tenant.
 */
export async function searchDocs(
  tenantId: string,
  queryEmbedding: number[],
  topK = 5,
): Promise<Array<{ text: string; score: number; docId: string }>> {
  const collection = await getCollection(tenantId);

  const result = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: topK,
  });

  const docs = result.documents[0] ?? [];
  const distances = result.distances?.[0] ?? [];
  const metadatas = result.metadatas[0] ?? [];

  return docs
    .map((text, i) => ({
      text: text ?? '',
      // ChromaDB returns L2 distance for cosine space; convert to similarity score
      score: distances[i] != null ? 1 - distances[i] : 0,
      docId: (metadatas[i]?.docId as string) ?? '',
    }))
    .filter((r) => r.text.length > 0);
}

/**
 * List all distinct document IDs in the tenant collection with chunk counts.
 */
export async function listDocs(tenantId: string): Promise<Array<{ docId: string; chunks: number }>> {
  try {
    const collection = await getCollection(tenantId);
    const result = await collection.get({ include: ['metadatas'] });
    const metadatas = result.metadatas ?? [];
    const counts = new Map<string, number>();
    for (const m of metadatas) {
      const id = (m?.docId as string) ?? '';
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([docId, chunks]) => ({ docId, chunks }))
      .sort((a, b) => a.docId.localeCompare(b.docId));
  } catch {
    return [];
  }
}

/**
 * Delete all chunks for a document from the tenant collection.
 */
export async function deleteDoc(tenantId: string, docId: string): Promise<void> {
  const collection = await getCollection(tenantId);
  await collection.delete({ where: { docId } });
}
