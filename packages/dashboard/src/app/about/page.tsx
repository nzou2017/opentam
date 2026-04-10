// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import Link from 'next/link';

const VERSION = '1.0.0';

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-2xl font-black text-gray-900 shadow-[0_0_20px_5px_rgba(245,158,11,0.4)]">
          Q
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">OpenTAM</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Open Technical Account Manager &middot; v{VERSION}</p>
        </div>
      </div>

      {/* Description */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">What is OpenTAM?</h2>
        <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
          OpenTAM is an AI-powered customer support agent that detects user frustration in real-time &mdash; rage clicks,
          dead-end loops, dwell time anomalies, cursor search patterns &mdash; and provides non-intrusive guidance
          using RAG over product documentation and source code. Its built-in Q assistant helps your users find
          what they need before they give up.
        </p>
      </section>

      {/* Architecture */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Architecture</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { name: 'Observer', desc: 'Lightweight SDK (<20kb) injected into your site. Captures behavioral signals and emits frustration events.' },
            { name: 'Brain', desc: 'LLM reasoning layer with RAG over your docs and source code. Understands what the user is trying to do.' },
            { name: 'Actor', desc: 'Delivers guidance via overlays, deep links, or autonomous browser interactions.' },
          ].map((mod) => (
            <div key={mod.name} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
              <h3 className="mb-1 font-semibold text-amber-600 dark:text-amber-400">{mod.name}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{mod.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tech Stack */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Tech Stack</h2>
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 text-sm text-gray-600 dark:text-gray-300">
          <div><span className="font-medium text-gray-900 dark:text-gray-100">Client SDK:</span> Vanilla JS, &lt;20kb</div>
          <div><span className="font-medium text-gray-900 dark:text-gray-100">Backend:</span> Hono + Node.js</div>
          <div><span className="font-medium text-gray-900 dark:text-gray-100">Dashboard:</span> Next.js + Tailwind CSS</div>
          <div><span className="font-medium text-gray-900 dark:text-gray-100">Database:</span> SQLite (Drizzle ORM)</div>
          <div><span className="font-medium text-gray-900 dark:text-gray-100">Vector DB:</span> ChromaDB</div>
          <div><span className="font-medium text-gray-900 dark:text-gray-100">LLM:</span> OpenAI / Ollama</div>
          <div><span className="font-medium text-gray-900 dark:text-gray-100">MCP Server:</span> Stdio transport</div>
          <div><span className="font-medium text-gray-900 dark:text-gray-100">Proxy:</span> OpenTAM reverse proxy</div>
        </div>
      </section>

      {/* License */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">License</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          OpenTAM Community Edition is licensed under the{' '}
          <span className="font-medium text-gray-900 dark:text-gray-100">GNU Affero General Public License v3.0 (AGPL-3.0)</span>.
          Enterprise features (SSO, team management, surveys, feedback) require a separate commercial license.
        </p>
      </section>

      {/* Copyright & Links */}
      <section className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          &copy; 2026 Ning Zou. All rights reserved.
        </p>
        <div className="mt-3 flex gap-4 text-sm">
          <Link href="/contact" className="text-amber-600 hover:text-amber-500">Contact</Link>
          <a href="https://github.com/nicholaszou/OpenTAM" target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:text-amber-500">GitHub</a>
        </div>
      </section>
    </div>
  );
}
