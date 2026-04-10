// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getStore } from '../db/index.js';
import { config } from '../config.js';

const TranscribeBody = z.object({
  audio: z.string().min(1),
  mimeType: z.string().default('audio/webm'),
});

function extFromMime(mimeType: string): string {
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
}

export async function transcribeRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/transcribe', async (request, reply) => {
    const store = getStore();

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing Authorization header' });
    }
    const sdkKey = authHeader.slice(7).trim();
    const tenant = await store.getTenantBySdkKey(sdkKey);
    if (!tenant) return reply.code(401).send({ error: 'Invalid SDK key' });

    const parsed = TranscribeBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body' });
    }

    const { audio, mimeType } = parsed.data;

    try {
      const buffer = Buffer.from(audio, 'base64');
      const ext = extFromMime(mimeType);
      const filename = `recording.${ext}`;

      const formData = new FormData();
      formData.append('file', new Blob([buffer], { type: mimeType }), filename);
      formData.append('model', config.sttModel);

      const baseUrl = config.sttBaseUrl.replace(/\/$/, '');
      const url = `${baseUrl}${config.sttPath}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.sttApiKey}`,
        },
        body: formData,
      });

      const raw = await response.text();
      app.log.info({ status: response.status, url, body: raw.slice(0, 300) }, 'STT response');

      if (!response.ok) {
        throw new Error(`STT returned ${response.status}: ${raw.slice(0, 200)}`);
      }

      const data = JSON.parse(raw) as { text?: string; result?: string; transcript?: string };
      const text = data.text ?? data.result ?? data.transcript ?? '';
      return reply.code(200).send({ text });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      app.log.error({ err, tenant: tenant.id }, 'Transcription failed');
      return reply.code(500).send({ error: `Transcription failed: ${msg}` });
    }
  });
}
