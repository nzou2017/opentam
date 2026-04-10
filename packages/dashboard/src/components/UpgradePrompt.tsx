// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

'use client';

interface UpgradePromptProps {
  feature: string;
  description?: string;
}

export function UpgradePrompt({ feature, description }: UpgradePromptProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
      <span className="mb-4 inline-block rounded-full bg-amber-100 dark:bg-amber-900/40 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
        Enterprise
      </span>
      <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
        {feature}
      </h2>
      {description && (
        <p className="mb-6 max-w-md text-sm text-gray-500 dark:text-gray-400">
          {description}
        </p>
      )}
      <a
        href="/settings/general#license"
        className="rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-amber-600 transition-colors"
      >
        Enter License Key
      </a>
      <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
        This feature requires a valid OpenTAM Enterprise license key.
      </p>
    </div>
  );
}
