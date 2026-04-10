// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { PDFParse } from 'pdf-parse';

/**
 * Extract plain text from a PDF buffer using the pdf-parse v2 API.
 */
export async function extractText(buffer: Buffer): Promise<string> {
  // Convert Node.js Buffer to Uint8Array for pdf-parse v2 compatibility
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const parser = new PDFParse({ data });
  const result = await parser.getText();
  return result.text;
}
