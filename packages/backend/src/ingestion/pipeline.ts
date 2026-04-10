// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { extractText as extractMarkdown } from './parsers/markdown.js';
import { extractText as extractHtml } from './parsers/html.js';
import { extractText as extractPdf } from './parsers/pdf.js';
import { splitIntoChunks } from './chunker.js';
import { embedTexts } from './embedder.js';
import { upsertChunks, ensureIndex } from './indexer.js';

type TextMimeType = 'text/markdown' | 'text/html' | 'text/plain';

/**
 * Ingest plain/markdown/html text for a tenant document.
 */
export async function ingestText(
  tenantId: string,
  docId: string,
  text: string,
  mimeType: TextMimeType,
): Promise<{ chunks: number }> {
  let plainText: string;

  if (mimeType === 'text/markdown') {
    plainText = extractMarkdown(text);
  } else if (mimeType === 'text/html') {
    plainText = extractHtml(text);
  } else {
    plainText = text;
  }

  const chunks = splitIntoChunks(plainText);
  if (chunks.length === 0) return { chunks: 0 };

  await ensureIndex();
  const embeddings = await embedTexts(chunks);
  await upsertChunks(tenantId, docId, chunks, embeddings);

  return { chunks: chunks.length };
}

/**
 * Ingest a PDF buffer for a tenant document.
 */
export async function ingestBuffer(
  tenantId: string,
  docId: string,
  buffer: Buffer,
  mimeType: 'application/pdf',
): Promise<{ chunks: number }> {
  let plainText: string;

  if (mimeType === 'application/pdf') {
    plainText = await extractPdf(buffer);
  } else {
    throw new Error(`Unsupported buffer mime type: ${mimeType}`);
  }

  const chunks = splitIntoChunks(plainText);
  if (chunks.length === 0) return { chunks: 0 };

  await ensureIndex();
  const embeddings = await embedTexts(chunks);
  await upsertChunks(tenantId, docId, chunks, embeddings);

  return { chunks: chunks.length };
}

/**
 * Slugify a URL for use as a docId.
 */
function slugifyUrl(url: string): string {
  return url.replace(/[^a-zA-Z0-9]/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
}

/**
 * Fetch a URL, detect content type, parse, chunk, embed, and index.
 */
export async function ingestUrl(
  tenantId: string,
  url: string,
): Promise<{ chunks: number; docId: string }> {
  const docId = slugifyUrl(url);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL ${url}: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') ?? 'text/plain';
  const bodyBuffer = Buffer.from(await response.arrayBuffer());

  let result: { chunks: number };

  if (contentType.includes('application/pdf')) {
    result = await ingestBuffer(tenantId, docId, bodyBuffer, 'application/pdf');
  } else if (contentType.includes('text/html')) {
    const html = bodyBuffer.toString('utf-8');
    result = await ingestText(tenantId, docId, html, 'text/html');
  } else if (contentType.includes('text/markdown') || url.endsWith('.md')) {
    const text = bodyBuffer.toString('utf-8');
    result = await ingestText(tenantId, docId, text, 'text/markdown');
  } else {
    // Default: treat as plain text
    const text = bodyBuffer.toString('utf-8');
    result = await ingestText(tenantId, docId, text, 'text/plain');
  }

  return { ...result, docId };
}
