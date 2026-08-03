// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { config } from '../config.js';
import { getStore } from '../db/index.js';

export interface ResolvedRagConfig {
  embeddingProvider: 'openai' | 'minimax' | 'ollama';
  openaiApiKey: string;
  minimaxApiKey: string;
  minimaxGroupId: string;
  ollamaUrl: string;
  ollamaEmbeddingModel: string;
  embeddingDimensions?: number;
  chromaUrl: string;
  chromaCollection: string;
}

/**
 * Resolves the RAG config actually used for a tenant: their own
 * Settings > Model overrides where set, falling back to the deployment-wide
 * .env config for anything left unset. Previously Settings > Model saved
 * these per-tenant fields but nothing in the ingestion/search pipeline ever
 * read them back — every tenant silently shared the one deployment config
 * regardless of what they configured.
 *
 * MiniMax credentials have no per-tenant override (not exposed in the
 * settings UI), so those always come from the deployment config.
 */
export async function resolveRagConfig(tenantId: string): Promise<ResolvedRagConfig> {
  const settings = await getStore().getTenantSettings(tenantId);
  return {
    embeddingProvider: (settings?.embeddingProvider as ResolvedRagConfig['embeddingProvider'] | undefined) || config.embeddingProvider,
    openaiApiKey: settings?.openaiApiKey || config.openaiApiKey,
    minimaxApiKey: config.minimaxApiKey,
    minimaxGroupId: config.minimaxGroupId,
    ollamaUrl: settings?.ollamaUrl || config.ollamaUrl,
    ollamaEmbeddingModel: settings?.ollamaEmbeddingModel || config.ollamaEmbeddingModel,
    embeddingDimensions: settings?.embeddingDimensions ?? config.embeddingDimensions,
    chromaUrl: settings?.chromaUrl || config.chromaUrl,
    chromaCollection: settings?.chromaCollection || config.chromaCollection,
  };
}

export async function isRagConfiguredForTenant(tenantId: string): Promise<boolean> {
  const cfg = await resolveRagConfig(tenantId);
  switch (cfg.embeddingProvider) {
    case 'minimax': return Boolean(cfg.minimaxApiKey);
    case 'ollama':  return true;
    default:        return Boolean(cfg.openaiApiKey);
  }
}
