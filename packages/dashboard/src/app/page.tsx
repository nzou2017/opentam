// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { getAnalytics, getInterventionLogs } from '@/lib/api';
import type { InterventionLog } from '@opentam/shared';
import { InterventionLogsTable } from '@/components/InterventionLogsTable';

export const dynamic = 'force-dynamic';

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

async function getUsageSummary(): Promise<{ events: { used: number; limit: number }; chat: { used: number; limit: number }; plan: string } | null> {
  try {
    const { backendConfig } = await import('@/lib/config');
    const res = await fetch(`${backendConfig.backendUrl}/api/v1/tenant/usage`, {
      headers: { Authorization: `Bearer ${backendConfig.secretKey}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export default async function OverviewPage() {
  const [analytics, logs, usage] = await Promise.all([
    getAnalytics().catch(() => null),
    getInterventionLogs().catch(() => [] as InterventionLog[]),
    getUsageSummary(),
  ]);

  const topUrl = analytics?.topFrustrationUrls?.[0]?.url ?? '—';
  const recentLogs = [...logs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">Overview</h1>

      {/* Stat cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Interventions"
          value={analytics?.totalInterventions ?? 0}
        />
        <StatCard
          label="Resolution Rate"
          value={
            analytics
              ? `${(analytics.resolutionRate * 100).toFixed(1)}%`
              : '0%'
          }
        />
        <StatCard label="Top Frustration URL" value={topUrl} />
        {usage && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Usage ({usage.plan})</p>
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Events</span>
                <span className="font-medium">{usage.events.used} / {usage.events.limit >= 999999 ? '...' : usage.events.limit}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Chat</span>
                <span className="font-medium">{usage.chat.used} / {usage.chat.limit >= 999999 ? '...' : usage.chat.limit}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recent intervention logs */}
      <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-200">
        Recent Interventions
      </h2>
      <InterventionLogsTable logs={recentLogs} />
    </div>
  );
}
