// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { backendConfig } from '@/lib/config';
import DocsManager from './DocsManager';

export const dynamic = 'force-dynamic';

export default function DocsPage() {
  return (
    <div className="flex flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Documentation</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
          Ingest your product documentation so the Q assistant can answer user how-to questions with precise,
          context-aware guidance. Supported formats: URLs (HTML, Markdown, PDF), plain text,
          and Markdown. Ingested content is embedded and stored for semantic search.
        </p>
      </div>
      <DocsManager
        backendUrl={backendConfig.backendUrl}
        secretKey={backendConfig.secretKey}
      />
    </div>
  );
}
