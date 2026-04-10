// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { parse } from 'node-html-parser';

/**
 * Extract plain text from an HTML string.
 * Removes script/style tags, then returns innerText.
 */
export function extractText(html: string): string {
  const root = parse(html);

  // Remove script and style elements
  root.querySelectorAll('script, style').forEach((el) => el.remove());

  return root.innerText
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Extract all href values from <a> tags in the HTML.
 */
export function extractLinks(html: string): string[] {
  const root = parse(html);
  const hrefs: string[] = [];

  root.querySelectorAll('a').forEach((el) => {
    const href = el.getAttribute('href');
    if (href && href.trim()) {
      hrefs.push(href.trim());
    }
  });

  return hrefs;
}
