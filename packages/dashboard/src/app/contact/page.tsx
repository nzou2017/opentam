// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">Contact</h1>
      <p className="mb-8 text-gray-500 dark:text-gray-400">
        Have a question, need enterprise licensing, or want to report a bug? Reach out through any of the channels below.
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* General */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
          <h2 className="mb-2 font-semibold text-gray-900 dark:text-gray-100">General Inquiries</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            For questions about OpenTAM, partnerships, or anything else.
          </p>
          <a
            href="mailto:q.cue.2026@gmail.com"
            className="text-sm font-medium text-amber-600 hover:text-amber-500"
          >
            q.cue.2026@gmail.com
          </a>
        </div>

        {/* Enterprise */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
          <h2 className="mb-2 font-semibold text-gray-900 dark:text-gray-100">Enterprise Licensing</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Need SSO, team management, surveys, or feedback features? Get an OpenTAM Enterprise license.
          </p>
          <a
            href="mailto:q.cue.2026@gmail.com?subject=OpenTAM%20Enterprise%20License%20Inquiry"
            className="text-sm font-medium text-amber-600 hover:text-amber-500"
          >
            Request a license
          </a>
        </div>

        {/* Security */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
          <h2 className="mb-2 font-semibold text-gray-900 dark:text-gray-100">Security Vulnerabilities</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Found a security issue? Please report it privately. Do not open a public issue.
          </p>
          <a
            href="mailto:q.cue.2026@gmail.com?subject=Security%20Vulnerability%20Report"
            className="text-sm font-medium text-amber-600 hover:text-amber-500"
          >
            Report privately
          </a>
        </div>

        {/* GitHub */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
          <h2 className="mb-2 font-semibold text-gray-900 dark:text-gray-100">Bug Reports &amp; Features</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Found a bug or have a feature request? Open an issue on GitHub.
          </p>
          <a
            href="https://github.com/nicholaszou/OpenTAM/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-amber-600 hover:text-amber-500"
          >
            GitHub Issues
          </a>
        </div>
      </div>

      {/* Response time */}
      <div className="mt-8 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 p-4">
        <p className="text-sm text-amber-800 dark:text-amber-300">
          <span className="font-semibold">Response time:</span> We aim to respond to all inquiries within 48 hours.
          Security reports are prioritized and typically acknowledged within 24 hours.
        </p>
      </div>
    </div>
  );
}
