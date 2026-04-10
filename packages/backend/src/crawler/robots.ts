// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

interface RobotsRules {
  disallowed: string[];
  crawlDelay?: number;
}

export async function fetchRobotsTxt(rootUrl: string): Promise<RobotsRules> {
  const url = new URL('/robots.txt', rootUrl).toString();
  const rules: RobotsRules = { disallowed: [] };

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return rules;

    const text = await res.text();
    let inUserAgent = false;

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().startsWith('user-agent:')) {
        const agent = trimmed.slice('user-agent:'.length).trim();
        inUserAgent = agent === '*' || agent.toLowerCase().includes('q');
      } else if (inUserAgent && trimmed.toLowerCase().startsWith('disallow:')) {
        const path = trimmed.slice('disallow:'.length).trim();
        if (path) rules.disallowed.push(path);
      } else if (inUserAgent && trimmed.toLowerCase().startsWith('crawl-delay:')) {
        const delay = parseInt(trimmed.slice('crawl-delay:'.length).trim(), 10);
        if (!isNaN(delay)) rules.crawlDelay = delay * 1000;
      }
    }
  } catch {
    // robots.txt not available — allow all
  }

  return rules;
}

export function isAllowedByRobots(url: string, rules: RobotsRules): boolean {
  try {
    const { pathname } = new URL(url);
    return !rules.disallowed.some(pattern => pathname.startsWith(pattern));
  } catch {
    return true;
  }
}
