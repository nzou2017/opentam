// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Recursive character text splitter.
 * No external dependencies.
 *
 * Default: chunkSize ~512 tokens (~2048 chars at ~4 chars/token)
 *          overlap  ~50 tokens  (~200 chars)
 */

interface ChunkOptions {
  chunkSize?: number; // in characters
  overlap?: number;   // in characters
}

const DEFAULT_CHUNK_SIZE = 2048;
const DEFAULT_OVERLAP = 200;

/**
 * Split text into overlapping chunks using a recursive strategy:
 * try splitting on paragraphs (\n\n), then sentences ('. '), then words (' ').
 */
export function splitIntoChunks(
  text: string,
  options: ChunkOptions = {},
): string[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap ?? DEFAULT_OVERLAP;

  const trimmed = text.trim();
  if (!trimmed) return [];

  const chunks = recursiveSplit(trimmed, chunkSize, ['\n\n', '\n', '. ', ' ', '']);
  return mergeWithOverlap(chunks, chunkSize, overlap);
}

function recursiveSplit(
  text: string,
  chunkSize: number,
  separators: string[],
): string[] {
  // Base case: text fits in one chunk
  if (text.length <= chunkSize) {
    const t = text.trim();
    return t ? [t] : [];
  }

  const [separator, ...remainingSeparators] = separators;

  // No more separators — force-split at chunkSize boundary
  if (separator === undefined || separator === '') {
    const result: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = start + chunkSize;
      const chunk = text.slice(start, end).trim();
      if (chunk) result.push(chunk);
      start = end;
    }
    return result;
  }

  const parts = text.split(separator);
  const results: string[] = [];

  for (const part of parts) {
    const trimmedPart = part.trim();
    if (!trimmedPart) continue;

    if (trimmedPart.length <= chunkSize) {
      results.push(trimmedPart);
    } else {
      // Recurse with next separator
      const subChunks = recursiveSplit(trimmedPart, chunkSize, remainingSeparators);
      results.push(...subChunks);
    }
  }

  return results;
}

/**
 * Merge small pieces into chunks of ~chunkSize, then apply overlap.
 */
function mergeWithOverlap(
  pieces: string[],
  chunkSize: number,
  overlap: number,
): string[] {
  if (pieces.length === 0) return [];

  const merged: string[] = [];
  let current = '';

  for (const piece of pieces) {
    const candidate = current ? `${current}\n\n${piece}` : piece;

    if (candidate.length <= chunkSize) {
      current = candidate;
    } else {
      if (current) {
        merged.push(current.trim());
      }
      // If even this single piece exceeds chunkSize, force it in
      current = piece;
    }
  }

  if (current.trim()) {
    merged.push(current.trim());
  }

  if (merged.length <= 1 || overlap <= 0) {
    return merged.filter((c) => c.trim().length > 0);
  }

  // Apply overlap: prepend tail of previous chunk to next chunk
  const withOverlap: string[] = [merged[0]];
  for (let i = 1; i < merged.length; i++) {
    const prev = merged[i - 1];
    const tail = prev.slice(-overlap);
    const joined = `${tail}\n\n${merged[i]}`;
    withOverlap.push(joined.length <= chunkSize * 1.25 ? joined : merged[i]);
  }

  return withOverlap.filter((c) => c.trim().length > 0);
}
