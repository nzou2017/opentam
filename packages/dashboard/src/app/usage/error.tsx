'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useEffect } from 'react';

export default function UsageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Usage page error:', error);
  }, [error]);

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Usage</h1>
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="mb-2 text-sm font-medium text-gray-700">Failed to load usage data</p>
        <p className="mb-4 text-xs text-gray-400">{error.message}</p>
        <button
          onClick={() => reset()}
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-amber-400"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
