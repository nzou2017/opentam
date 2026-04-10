'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Page error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-8">
      <h2 className="mb-2 text-lg font-semibold text-gray-900">Something went wrong</h2>
      <p className="mb-4 text-sm text-gray-500">{error.message}</p>
      <button
        onClick={() => reset()}
        className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-amber-400"
      >
        Try Again
      </button>
    </div>
  );
}
