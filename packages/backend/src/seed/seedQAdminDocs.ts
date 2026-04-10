// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Seeds Q product documentation into ChromaDB for the q-admin tenant.
 * Runs once on backend startup when RAG is configured.
 * Idempotent — uses stable docIds so repeated runs upsert, not duplicate.
 */
import { config } from '../config.js';
import { ingestText } from '../ingestion/pipeline.js';
import { Q_ADMIN_DOCS } from './qAdminDocs.js';

const Q_ADMIN_TENANT_ID = 'tenant-q-admin';

function isRagConfigured(): boolean {
  switch (config.embeddingProvider) {
    case 'minimax': return Boolean(config.minimaxApiKey);
    case 'ollama':  return true;
    default:        return Boolean(config.openaiApiKey);
  }
}

export async function seedQAdminDocs(): Promise<void> {
  if (!isRagConfigured()) {
    console.log('[seed] RAG not configured — skipping Q admin doc seeding');
    return;
  }

  console.log(`[seed] Ingesting ${Q_ADMIN_DOCS.length} Q admin docs into tenant ${Q_ADMIN_TENANT_ID}...`);

  let ingested = 0;
  for (const doc of Q_ADMIN_DOCS) {
    try {
      const result = await ingestText(Q_ADMIN_TENANT_ID, doc.docId, doc.content, 'text/markdown');
      ingested++;
      console.log(`[seed]   ✓ ${doc.docId} (${result.chunks} chunks)`);
    } catch (err) {
      console.error(`[seed]   ✗ ${doc.docId}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`[seed] Q admin docs: ${ingested}/${Q_ADMIN_DOCS.length} ingested`);
}
