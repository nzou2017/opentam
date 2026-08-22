// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getStore } from '../db/index.js';

// Docker-mounted volume in production (see docker-compose.yml's
// q_attachments volume) — falls back to a local dir for non-Docker dev.
const ATTACHMENTS_DIR = process.env.ATTACHMENTS_DIR ?? join(process.cwd(), 'attachments');
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5MB decoded

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const UploadBody = z.object({
  sessionId: z.string().min(1),
  // Base64-encoded image bytes (no data: URL prefix — the client strips
  // that before sending). Same binary-over-JSON pattern the SDK already
  // uses for voice input (Transport.sendTranscribe) — this codebase has
  // no multipart/FormData precedent anywhere, so this stays consistent
  // rather than introducing one just for this.
  imageBase64: z.string().min(1),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
});

export async function attachmentRoutes(app: FastifyInstance): Promise<void> {
  // Fastify's default bodyLimit is 1MB; base64 inflates the payload ~33%,
  // so a 5MB image needs headroom. Scoped to this route only, not raised
  // globally.
  app.post('/api/v1/attachments', { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing or invalid Authorization header' });
    }
    const sdkKey = authHeader.slice('Bearer '.length).trim();
    const tenant = await getStore().getTenantBySdkKey(sdkKey);
    if (!tenant) {
      return reply.code(401).send({ error: 'Invalid SDK key' });
    }

    const parsed = UploadBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.format() });
    }

    const { sessionId, imageBase64, mimeType } = parsed.data;
    const buffer = Buffer.from(imageBase64, 'base64');
    if (buffer.length === 0) {
      return reply.code(400).send({ error: 'Empty image data' });
    }
    if (buffer.length > MAX_ATTACHMENT_BYTES) {
      return reply.code(413).send({ error: `Image too large — max ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB` });
    }

    // Doubles as the access token for the public GET route below — long
    // and random enough to be unguessable.
    const id = randomBytes(24).toString('hex');
    const filename = `${id}.${MIME_EXTENSIONS[mimeType]}`;

    await mkdir(ATTACHMENTS_DIR, { recursive: true });
    await writeFile(join(ATTACHMENTS_DIR, filename), buffer);

    // Computed once here, while a request object is actually available,
    // and stored — executeSubmitFeedback links attachments to a feature
    // request much later (agent/tools.ts has no request context to derive
    // this from itself).
    const url = `${request.protocol}://${request.hostname}/api/v1/attachments/${id}`;

    await getStore().createAttachment({
      id,
      tenantId: tenant.id,
      sessionId,
      mimeType,
      filename,
      url,
      createdAt: new Date().toISOString(),
    });

    // Not linked to a feature request yet — executeSubmitFeedback claims
    // it later, by (tenantId, sessionId), whenever the chat agent actually
    // files a bug report (which may be several turns from now).
    return reply.code(201).send({ attachmentId: id, url });
  });

  // Deliberately no auth — a plain <img src> or link click can't carry an
  // Authorization header, so the unguessable ID itself is the access
  // control, same trust model as S3 signed URLs / how Slack, Linear, etc.
  // serve uploaded attachments.
  app.get('/api/v1/attachments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const attachment = await getStore().getAttachmentById(id);
    if (!attachment) {
      return reply.code(404).send({ error: 'Attachment not found' });
    }

    try {
      const data = await readFile(join(ATTACHMENTS_DIR, attachment.filename));
      return reply.type(attachment.mimeType).send(data);
    } catch {
      return reply.code(404).send({ error: 'Attachment not found' });
    }
  });
}
