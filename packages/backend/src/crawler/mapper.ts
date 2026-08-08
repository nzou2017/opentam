// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { Platform } from '@opentam/shared';
import type { ExtractedElement } from './parser.js';

export interface MapCandidate {
  feature: string;
  url: string;
  selector: string;
  description: string;
  source: 'crawler';
  platform?: Platform;
}

/** Derive a screen name from a Swift file path, e.g. Sources/Views/LoginView.swift -> LoginView */
function filePathToScreenName(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath;
  return base.replace(/\.swift$/, '');
}

const SWIFT_TYPE_LABELS: Record<string, string> = {
  button: 'Button',
  link: 'Navigation link',
  input: 'Text field',
  toggle: 'Toggle',
};

function toIosMapCandidates(elements: ExtractedElement[]): MapCandidate[] {
  const seen = new Set<string>();
  const candidates: MapCandidate[] = [];

  for (const el of elements) {
    // The accessibility identifier is the only reliable XCUITest lookup
    // mechanism (the iOS analog of a CSS selector) — without one, there's
    // nothing an automated intervention could target, so skip it, same as
    // the web mapper already does for inputs lacking a selector.
    const selector = el.selector;
    if (!selector || seen.has(selector)) continue;
    seen.add(selector);

    const screen = filePathToScreenName(el.filePath);
    const typeLabel = SWIFT_TYPE_LABELS[el.type] ?? 'Element';
    const feature = el.label
      ? (el.type === 'input' ? `${el.label} field` : el.type === 'toggle' ? `${el.label} toggle` : el.label)
      : `${typeLabel} on ${screen}`;

    candidates.push({
      feature,
      url: screen,
      selector,
      description: `${typeLabel} on the ${screen} screen`,
      source: 'crawler',
      platform: 'ios',
    });
  }

  return candidates;
}

/**
 * Derive a URL path from a file path.
 * e.g. src/pages/settings/team.tsx -> /settings/team
 *      src/app/dashboard/page.tsx  -> /dashboard
 */
function filePathToUrl(filePath: string): string {
  // Strip leading src/, app/, pages/ prefixes
  let path = filePath
    .replace(/\.(tsx|jsx)$/, '')
    .replace(/^src\//, '')
    .replace(/^app\//, '')
    .replace(/^pages\//, '');

  // Remove Next.js-style route segments: /page, /layout, /route, /index
  path = path.replace(/\/(page|layout|route|index)$/, '');
  path = path.replace(/^(page|layout|route|index)$/, '');

  // Remove (group) route segments in Next.js App Router
  path = path.replace(/\([^)]+\)\//g, '');
  path = path.replace(/\([^)]+\)$/, '');

  // Remove remaining pages/ or app/ after stripping
  path = path.replace(/^pages\//, '').replace(/^app\//, '');

  if (!path || path === '') return '/';
  if (!path.startsWith('/')) path = `/${path}`;

  return path;
}

export function toMapCandidates(
  elements: ExtractedElement[],
  baseUrl: string,
  platform: Platform = 'web',
): MapCandidate[] {
  if (platform === 'ios') return toIosMapCandidates(elements);

  const seen = new Set<string>();
  const candidates: MapCandidate[] = [];

  for (const el of elements) {
    if (el.type === 'button') {
      const feature = el.label;
      const selector = el.selector;

      if (!feature || !selector) continue;

      const url = filePathToUrl(el.filePath);
      const description = `"${feature}" button on ${url} page`;

      if (seen.has(selector)) continue;
      seen.add(selector);

      candidates.push({ feature, url, selector, description, source: 'crawler' });
    } else if (el.type === 'link') {
      const feature = el.label || el.href;
      const href = el.href;

      if (!feature || !href) continue;

      // Build selector
      const selector = `a[href="${href}"]`;

      if (seen.has(selector)) continue;
      seen.add(selector);

      // Determine URL
      let url: string;
      if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
        url = href;
      } else {
        url = baseUrl + href;
      }

      const description = `Link to "${href}" — ${feature}`;

      candidates.push({ feature, url, selector, description, source: 'crawler' });
    } else if (el.type === 'input') {
      const label = el.label;
      const selector = el.selector;

      if (!selector) continue;

      const feature = label ? `${label} field` : 'Input field';
      const url = filePathToUrl(el.filePath);
      const description = label
        ? `"${label}" input field on ${url} page`
        : `Input field on ${url} page`;

      if (seen.has(selector)) continue;
      seen.add(selector);

      candidates.push({ feature, url, selector, description, source: 'crawler' });
    } else if (el.type === 'form') {
      const selector = el.selector;
      if (!selector) continue;

      const url = filePathToUrl(el.filePath);
      const feature = `Form on ${url}`;
      const description = `Form element on ${url} page`;

      if (seen.has(selector)) continue;
      seen.add(selector);

      candidates.push({ feature, url, selector, description, source: 'crawler' });
    }
  }

  return candidates;
}
