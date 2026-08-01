// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { parse as parseHtml } from 'node-html-parser';
import { fetchRobotsTxt, isAllowedByRobots } from './robots.js';
import { ingestText } from '../ingestion/pipeline.js';
import { getStore } from '../db/index.js';

export interface SpiderOptions {
  rootUrl: string;
  maxPages?: number;
  maxDepth?: number;
  delayMs?: number;
  allowPatterns?: string[];
  denyPatterns?: string[];
}

export interface SpiderResult {
  pagesIngested: number;
  pagesFailed: number;
  totalChunks: number;
  urls: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function matchesPatterns(url: string, patterns: string[]): boolean {
  return patterns.some(p => {
    const regex = p.replace(/\*/g, '.*');
    return new RegExp(regex).test(url);
  });
}

function isSameDomain(url: string, rootUrl: string): boolean {
  try {
    return new URL(url).hostname === new URL(rootUrl).hostname;
  } catch {
    return false;
  }
}

function normalizeUrl(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    url.hash = '';
    url.search = '';
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchSitemap(rootUrl: string): Promise<string[]> {
  const urls: string[] = [];
  try {
    const sitemapUrl = new URL('/sitemap.xml', rootUrl).toString();
    const res = await fetch(sitemapUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return urls;

    const text = await res.text();
    // Simple regex extraction of <loc> tags
    const matches = text.matchAll(/<loc>\s*(https?:\/\/[^<]+?)\s*<\/loc>/gi);
    for (const m of matches) {
      if (isSameDomain(m[1], rootUrl)) {
        urls.push(m[1]);
      }
    }
  } catch {
    // No sitemap available
  }
  return urls;
}

function extractLinks(html: string, baseUrl: string): string[] {
  const root = parseHtml(html);
  const links: string[] = [];
  for (const el of root.querySelectorAll('a[href]')) {
    const href = el.getAttribute('href');
    if (!href) continue;
    const normalized = normalizeUrl(href, baseUrl);
    if (normalized && isSameDomain(normalized, baseUrl)) {
      links.push(normalized);
    }
  }
  return links;
}

function extractText(html: string): string {
  const root = parseHtml(html);
  // Remove script, style, nav, header, footer
  for (const tag of ['script', 'style', 'nav', 'header', 'footer']) {
    for (const el of root.querySelectorAll(tag)) {
      el.remove();
    }
  }
  return root.text.replace(/\s+/g, ' ').trim();
}

/**
 * Runs the crawl for an already-created crawl_jobs row (see routes/spider.ts,
 * which creates the row synchronously before firing this off detached, so a
 * client polling immediately after the 202 response always finds it).
 * Checks the job's own status before each page so a 'cancelled' write from
 * the cancel endpoint stops the crawl at the next iteration.
 */
export async function spiderDocs(tenantId: string, options: SpiderOptions, jobId: string): Promise<SpiderResult> {
  const { rootUrl, maxPages = 200, maxDepth = 3, delayMs = 200, allowPatterns = [], denyPatterns = [] } = options;
  const store = getStore();

  const result: SpiderResult = { pagesIngested: 0, pagesFailed: 0, totalChunks: 0, urls: [] };
  const visited = new Set<string>();

  try {
    // Fetch robots.txt
    const robots = await fetchRobotsTxt(rootUrl);
    const effectiveDelay = Math.max(delayMs, robots.crawlDelay ?? 0);

    // Try sitemap first
    const sitemapUrls = await fetchSitemap(rootUrl);
    const queue: { url: string; depth: number }[] = [];

    if (sitemapUrls.length > 0) {
      for (const url of sitemapUrls.slice(0, maxPages)) {
        queue.push({ url, depth: 0 });
      }
    } else {
      queue.push({ url: rootUrl, depth: 0 });
    }

    await store.updateCrawlJob(jobId, { pagesQueued: queue.length });

    while (queue.length > 0 && result.pagesIngested < maxPages) {
      // Cancellation check — a running job can be marked 'cancelled' from
      // outside (POST /api/v1/spider/:jobId/cancel) at any time.
      const current = await store.getCrawlJob(jobId);
      if (!current || current.status !== 'running') break;

      const { url, depth } = queue.shift()!;

      if (visited.has(url)) continue;
      visited.add(url);

      // Check robots.txt
      if (!isAllowedByRobots(url, robots)) continue;

      // Check patterns
      if (denyPatterns.length > 0 && matchesPatterns(url, denyPatterns)) continue;
      if (allowPatterns.length > 0 && !matchesPatterns(url, allowPatterns)) continue;

      try {
        await sleep(effectiveDelay);

        const res = await fetch(url, {
          signal: AbortSignal.timeout(15000),
          headers: { 'User-Agent': 'Q-Spider/1.0' },
        });

        if (!res.ok) {
          result.pagesFailed++;
          continue;
        }

        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('text/html')) {
          continue;
        }

        const html = await res.text();
        const text = extractText(html);

        if (text.length < 50) continue; // Skip empty pages

        // Ingest into RAG
        const docId = `spider:${url}`;
        const ingestResult = await ingestText(tenantId, docId, text, 'text/plain');
        result.pagesIngested++;
        result.totalChunks += ingestResult.chunks;
        result.urls.push(url);

        // Extract links for further crawling
        if (depth < maxDepth) {
          const links = extractLinks(html, url);
          for (const link of links) {
            if (!visited.has(link)) {
              queue.push({ url: link, depth: depth + 1 });
            }
          }
        }

        await store.updateCrawlJob(jobId, {
          pagesIngested: result.pagesIngested,
          pagesFailed: result.pagesFailed,
          totalChunks: result.totalChunks,
          pagesQueued: visited.size + queue.length,
        });
      } catch {
        result.pagesFailed++;
        await store.updateCrawlJob(jobId, { pagesFailed: result.pagesFailed });
      }
    }

    // Only overwrite to 'completed' if it wasn't cancelled out from under us.
    const finalJob = await store.getCrawlJob(jobId);
    if (finalJob?.status === 'running') {
      await store.updateCrawlJob(jobId, {
        status: 'completed',
        pagesIngested: result.pagesIngested,
        pagesFailed: result.pagesFailed,
        totalChunks: result.totalChunks,
      });
    }
  } catch (err) {
    await store.updateCrawlJob(jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return result;
}
