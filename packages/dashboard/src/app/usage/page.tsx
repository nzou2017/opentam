'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useState, useEffect } from 'react';
import { backendConfig } from '@/lib/config';
import { UsageBar } from '@/components/UsageBar';
import { TimeSeriesChart } from '@/components/TimeSeriesChart';

export default function UsagePage() {
  const [usage, setUsage] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    const headers = { Authorization: `Bearer ${backendConfig.secretKey}` };

    fetch(`${backendConfig.backendUrl}/api/v1/tenant/usage`, { headers })
      .then(r => r.json())
      .then(setUsage)
      .catch(() => {});

    fetch(`${backendConfig.backendUrl}/api/v1/tenant/usage/history?months=6`, { headers })
      .then(r => r.json())
      .then((data: { history?: any[] }) => setHistory(data.history ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">Usage</h1>

      {usage && (
        <div className="mb-4 inline-flex rounded-full bg-amber-100 dark:bg-amber-900/40 px-3 py-1 text-sm font-medium text-amber-800 dark:text-amber-300 capitalize">
          {usage.plan} plan
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <UsageBar
          label="Events"
          used={usage?.events?.used ?? 0}
          limit={usage?.events?.limit ?? 1000}
        />
        <UsageBar
          label="Chat Messages"
          used={usage?.chat?.used ?? 0}
          limit={usage?.chat?.limit ?? 100}
        />
        <UsageBar
          label="Users"
          used={usage?.users?.used ?? 0}
          limit={usage?.users?.limit ?? 1}
        />
      </div>

      {history.length > 0 && <TimeSeriesChart data={history} />}
    </div>
  );
}
