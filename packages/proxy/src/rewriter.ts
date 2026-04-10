// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { parse } from 'node-html-parser';

/**
 * Rewrites an HTML document so that:
 * 1. Relative and same-origin href/src/action attributes are prefixed with /proxy?url=<encoded>
 * 2. The SDK snippet is injected just before </body>
 */
export function rewriteHtml(
  html: string,
  targetOrigin: string,
  proxyBase: string,
  sdkSnippet: string,
): string {
  try {
    const root = parse(html);

    // Rewrite href attributes (a, link)
    root.querySelectorAll('[href]').forEach((el) => {
      const href = el.getAttribute('href');
      if (!href) return;
      const rewritten = rewriteUrl(href, targetOrigin, proxyBase);
      if (rewritten !== href) el.setAttribute('href', rewritten);
    });

    // Rewrite src attributes (img, script, iframe, source, etc.)
    root.querySelectorAll('[src]').forEach((el) => {
      const src = el.getAttribute('src');
      if (!src) return;
      // Don't rewrite data URIs or blob URLs
      if (src.startsWith('data:') || src.startsWith('blob:')) return;
      const rewritten = rewriteUrl(src, targetOrigin, proxyBase);
      if (rewritten !== src) el.setAttribute('src', rewritten);
    });

    // Rewrite action attributes (form)
    root.querySelectorAll('[action]').forEach((el) => {
      const action = el.getAttribute('action');
      if (!action) return;
      const rewritten = rewriteUrl(action, targetOrigin, proxyBase);
      if (rewritten !== action) el.setAttribute('action', rewritten);
    });

    // Inject SDK snippet before </body>
    const body = root.querySelector('body');
    if (body) {
      body.insertAdjacentHTML('beforeend', sdkSnippet);
    } else {
      // No body tag — append to end
      root.insertAdjacentHTML('beforeend', sdkSnippet);
    }

    return root.toString();
  } catch {
    // If parsing fails, return original HTML untouched
    return html;
  }
}

function rewriteUrl(url: string, targetOrigin: string, proxyBase: string): string {
  // Skip anchor-only, javascript:, mailto:, tel:, data:, blob: links
  if (
    url.startsWith('#') ||
    url.startsWith('javascript:') ||
    url.startsWith('mailto:') ||
    url.startsWith('tel:') ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  ) {
    return url;
  }

  try {
    // Absolute URL
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
      const absoluteUrl = url.startsWith('//') ? `https:${url}` : url;
      const parsed = new URL(absoluteUrl);
      // Only rewrite same-origin URLs through the proxy
      if (parsed.origin === targetOrigin) {
        return `${proxyBase}/proxy?url=${encodeURIComponent(absoluteUrl)}`;
      }
      return url; // External URL — leave as-is
    }

    // Relative URL — resolve against target origin
    const resolved = new URL(url, targetOrigin).toString();
    return `${proxyBase}/proxy?url=${encodeURIComponent(resolved)}`;
  } catch {
    return url;
  }
}
