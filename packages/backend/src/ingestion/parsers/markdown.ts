// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { marked } from 'marked';

/**
 * Extract plain text from a markdown string.
 * Uses marked to render to HTML, then strips HTML tags.
 */
export function extractText(markdown: string): string {
  // Render markdown to HTML (marked returns string when not given async renderer)
  const html = marked(markdown) as string;
  // Strip HTML tags to get plain text
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
