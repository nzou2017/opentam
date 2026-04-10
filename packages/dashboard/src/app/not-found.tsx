// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-6 text-center">
      {/* Giant Q logo as the "0" in 404 */}
      <div className="flex items-baseline gap-1 select-none">
        <span className="text-[8rem] font-black leading-none text-gray-300 dark:text-gray-600">4</span>
        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-amber-500 text-[5rem] font-black text-gray-900 shadow-[0_0_40px_8px_rgba(245,158,11,0.4)] animate-pulse">
          Q
        </div>
        <span className="text-[8rem] font-black leading-none text-gray-300 dark:text-gray-600">4</span>
      </div>

      <h1 className="mt-6 text-2xl font-bold text-gray-900 dark:text-gray-100">
        Lost in the matrix?
      </h1>
      <p className="mt-2 max-w-md text-gray-500 dark:text-gray-400">
        Even our AI couldn&apos;t find this page. It detected zero rage clicks here &mdash;
        probably because there&apos;s nothing to click on.
      </p>

      <div className="mt-8 flex items-center gap-4">
        <Link
          href="/"
          className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-amber-400 hover:shadow-md"
        >
          Back to Dashboard
        </Link>
        <Link
          href="/map"
          className="rounded-lg border border-gray-300 dark:border-gray-600 px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 transition hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Check the Map
        </Link>
      </div>

      <p className="mt-12 text-xs text-gray-400 dark:text-gray-600">
        Error 404 &bull; The page you&apos;re looking for doesn&apos;t exist or was moved.
      </p>
    </div>
  );
}
