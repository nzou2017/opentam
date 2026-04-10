// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { CrawlManager } from './CrawlManager';
import { SpiderManager } from './SpiderManager';

export default function CrawlPage() {
  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Repository Crawler</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Extract UI elements from a GitHub repository and populate the functional map automatically.
        </p>
      </div>
      <CrawlManager />

      <div className="border-t border-gray-200 dark:border-gray-700 pt-8">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Docs Spider</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Crawl a documentation website and ingest pages into the RAG knowledge base.
        </p>
      </div>
      <SpiderManager />
    </div>
  );
}
