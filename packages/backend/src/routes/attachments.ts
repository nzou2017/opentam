// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getStore } from '../db/index.js';
import { MAX_ATTACHMENTS_PER_REQUEST } from '../agent/tools.js';

// Docker-mounted volume in production (see docker-compose.yml's
// q_attachments volume) — falls back to a local dir for non-Docker dev.
const ATTACHMENTS_DIR = process.env.ATTACHMENTS_DIR ?? join(process.cwd(), 'attachments');
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5MB decoded

// ── Abuse protection ────────────────────────────────────────────────────────
// Uploads are SDK-key authenticated but the key ships in every client bundle,
// so a scraped key + a bot can still flood the endpoint. These caps bound the
// blast radius: per-session pending backlog, plus sliding-window upload rates
// per tenant and per client IP (catches one attacker rotating session IDs).
export const MAX_PENDING_PER_SESSION = 2 * MAX_ATTACHMENTS_PER_REQUEST; // headroom above the per-bug cap
const RATE_WINDOW_MS = 60_000;
export const MAX_UPLOADS_PER_MIN_PER_TENANT = 30;
export const MAX_UPLOADS_PER_MIN_PER_IP = 20;

// In-memory sliding-window counters. Fine for a single-process deployment; a
// multi-node setup would move these to Redis. Keyed by `tenant:<id>` / `ip:<ip>`.
const uploadHits = new Map<string, number[]>();

/** Records an upload attempt for `key` and returns true if it exceeds `limit` within the window. */
function rateLimited(key: string, limit: number, now: number): boolean {
  const recent = (uploadHits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= limit) {
    uploadHits.set(key, recent); // keep the trimmed window, don't add another hit
    return true;
  }
  recent.push(now);
  uploadHits.set(key, recent);
  return false;
}

/** Test-only: clears the in-memory rate-limit window so limits don't bleed across test cases. */
export function __resetAttachmentRateLimits(): void {
  uploadHits.clear();
}

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
    const store = getStore();
    const tenant = await store.getTenantBySdkKey(sdkKey);
    if (!tenant) {
      return reply.code(401).send({ error: 'Invalid SDK key' });
    }

    // Rate-limit before doing any real work, so a flood is cheap to reject.
    const now = Date.now();
    if (rateLimited(`tenant:${tenant.id}`, MAX_UPLOADS_PER_MIN_PER_TENANT, now) ||
        rateLimited(`ip:${request.ip}`, MAX_UPLOADS_PER_MIN_PER_IP, now)) {
      request.log.warn({ tenantId: tenant.id, ip: request.ip }, 'attachment upload rate limit exceeded');
      return reply.code(429).send({ error: 'Too many uploads — slow down and try again shortly.' });
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

    // Dedupe: if this exact image was already uploaded in this session, return
    // the existing record instead of storing the bytes again. Guards against
    // double-clicks and bots re-posting the same screenshot.
    const contentHash = createHash('sha256').update(buffer).digest('hex');
    const existing = await store.getAttachmentByHash(tenant.id, sessionId, contentHash);
    if (existing) {
      return reply.code(200).send({ attachmentId: existing.id, url: existing.url, deduplicated: true });
    }

    // Cap how many unclaimed screenshots a single session can accumulate.
    if (await store.countPendingAttachmentsBySession(tenant.id, sessionId) >= MAX_PENDING_PER_SESSION) {
      return reply.code(429).send({ error: `Too many pending screenshots for this session — max ${MAX_PENDING_PER_SESSION}.` });
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

    await store.createAttachment({
      id,
      tenantId: tenant.id,
      sessionId,
      mimeType,
      filename,
      url,
      contentHash,
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
