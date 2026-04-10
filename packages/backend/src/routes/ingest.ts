// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getStore } from '../db/index.js';
import { config } from '../config.js';
import { ingestText, ingestUrl } from '../ingestion/pipeline.js';
import { deleteDoc, listDocs } from '../ingestion/indexer.js';

async function getSecretKeyTenant(authHeader: string | undefined) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const secretKey = authHeader.slice('Bearer '.length).trim();
  return (await getStore().getTenantBySecretKey(secretKey)) ?? null;
}

function isRagConfigured(): boolean {
  switch (config.embeddingProvider) {
    case 'minimax': return Boolean(config.minimaxApiKey);
    case 'ollama':  return true;
    default:        return Boolean(config.openaiApiKey);
  }
}

const IngestUrlBody = z.object({
  url: z.string().url(),
});

const IngestTextBody = z.object({
  docId: z.string().min(1),
  text: z.string().min(1),
  mimeType: z.enum(['text/markdown', 'text/html', 'text/plain']),
});

export async function ingestRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/ingest/url', async (request, reply) => {
    const tenant = await getSecretKeyTenant(request.headers.authorization);
    if (!tenant) {
      return reply.code(401).send({ error: 'Missing or invalid secret key' });
    }

    if (!isRagConfigured()) {
      return reply.code(200).send({ error: 'RAG not configured', configured: false });
    }

    const parsed = IngestUrlBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.format() });
    }

    const { url } = parsed.data;

    try {
      const result = await ingestUrl(tenant.id, url);
      return reply.code(200).send({ docId: result.docId, chunks: result.chunks });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.error({ err, url }, 'Failed to ingest URL');
      return reply.code(500).send({ error: `Ingestion failed: ${message}` });
    }
  });

  app.post('/api/v1/ingest/text', async (request, reply) => {
    const tenant = await getSecretKeyTenant(request.headers.authorization);
    if (!tenant) {
      return reply.code(401).send({ error: 'Missing or invalid secret key' });
    }

    if (!isRagConfigured()) {
      return reply.code(200).send({ error: 'RAG not configured', configured: false });
    }

    const parsed = IngestTextBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.format() });
    }

    const { docId, text, mimeType } = parsed.data;

    try {
      const result = await ingestText(tenant.id, docId, text, mimeType);
      return reply.code(200).send({ docId, chunks: result.chunks });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.error({ err, docId }, 'Failed to ingest text');
      return reply.code(500).send({ error: `Ingestion failed: ${message}` });
    }
  });

  app.get('/api/v1/ingest', async (request, reply) => {
    const tenant = await getSecretKeyTenant(request.headers.authorization);
    if (!tenant) {
      return reply.code(401).send({ error: 'Missing or invalid secret key' });
    }

    if (!isRagConfigured()) {
      return reply.code(200).send({ docs: [], configured: false });
    }

    try {
      const docs = await listDocs(tenant.id);
      return reply.code(200).send({ docs, configured: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.error({ err }, 'Failed to list docs');
      return reply.code(500).send({ error: `Failed to list docs: ${message}` });
    }
  });

  app.delete('/api/v1/ingest/:docId', async (request, reply) => {
    const tenant = await getSecretKeyTenant(request.headers.authorization);
    if (!tenant) {
      return reply.code(401).send({ error: 'Missing or invalid secret key' });
    }

    if (!isRagConfigured()) {
      return reply.code(200).send({ error: 'RAG not configured', configured: false });
    }

    const { docId } = request.params as { docId: string };

    try {
      await deleteDoc(tenant.id, docId);
      return reply.code(200).send({ deleted: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.error({ err, docId }, 'Failed to delete doc');
      return reply.code(500).send({ error: `Deletion failed: ${message}` });
    }
  });
}
