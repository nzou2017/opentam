// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { RetrievalHit } from '../agent/evidence.js';

// Knowledge service abstraction (design doc §13). The agent talks to this
// interface, not to ChromaDB directly, so product docs, known issues, release
// notes, historical cases, etc. can later come from different backends without
// touching agent logic. Phase 4 ships the product-docs method backed by the
// existing Chroma retrieval; more methods/sources come later.
export interface KnowledgeSearchOptions {
  topK?: number;
  /** Metadata equality filter passed through to the vector store (design doc §12). */
  where?: Record<string, unknown>;
}

export interface KnowledgeService {
  /** Semantic search over the tenant's product documentation. */
  searchProduct(tenantId: string, query: string, opts?: KnowledgeSearchOptions): Promise<RetrievalHit[]>;
}

/**
 * Chroma-backed implementation. Thin wrapper over the existing embed → query
 * pipeline; returns `[]` (rather than throwing) when RAG isn't configured for
 * the tenant, so callers can treat "no knowledge" uniformly.
 */
export const chromaKnowledgeService: KnowledgeService = {
  async searchProduct(tenantId, query, opts) {
    const { isRagConfiguredForTenant } = await import('../ingestion/ragConfig.js');
    if (!(await isRagConfiguredForTenant(tenantId))) return [];

    const { embedQuery } = await import('../ingestion/embedder.js');
    const { searchDocs } = await import('../ingestion/indexer.js');

    const queryEmbedding = await embedQuery(query, tenantId);
    return searchDocs(tenantId, queryEmbedding, opts?.topK ?? 5, opts?.where);
  },
};
