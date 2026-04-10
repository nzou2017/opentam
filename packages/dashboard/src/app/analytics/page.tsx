// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { getAnalytics } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const analytics = await getAnalytics().catch(() => null);

  const actionLabels: Record<string, string> = {
    overlay_highlight: 'Overlay Highlight',
    deep_link: 'Deep Link',
    message_only: 'Message Only',
    dismissed: 'Dismissed',
  };

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">Analytics</h1>

      {!analytics ? (
        <p className="text-gray-500 dark:text-gray-400">Failed to load analytics. Is the backend running?</p>
      ) : (
        <div className="space-y-8">
          {/* Resolution rate hero */}
          <div className="inline-flex flex-col items-center rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 shadow-sm">
            <p className="text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Resolution Rate
            </p>
            <p className="mt-2 text-6xl font-extrabold text-amber-500">
              {(analytics.resolutionRate * 100).toFixed(1)}%
            </p>
            <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
              {analytics.resolvedInterventions} of {analytics.totalInterventions} resolved
            </p>
          </div>

          {/* Top frustration URLs — horizontal bar heatmap */}
          <div>
            <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-200">
              Top Frustration URLs
            </h2>
            <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm p-5">
              {analytics.topFrustrationUrls.length === 0 ? (
                <p className="text-center text-gray-400 dark:text-gray-500 py-4">No data yet.</p>
              ) : (() => {
                const maxCount = Math.max(...analytics.topFrustrationUrls.map(e => e.count));
                return (
                  <div className="space-y-3">
                    {analytics.topFrustrationUrls.map(({ url, count }) => {
                      const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                      return (
                        <div key={url} className="flex items-center gap-3">
                          <span className="w-40 shrink-0 font-mono text-xs text-gray-600 dark:text-gray-400 truncate" title={url}>
                            {url}
                          </span>
                          <div className="relative flex-1 h-6 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                              style={{
                                width: `${pct}%`,
                                background: 'linear-gradient(90deg, #6366f1, #f59e0b)',
                              }}
                            />
                          </div>
                          <span className="w-8 shrink-0 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Platform distribution */}
          {analytics.platformDistribution && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-200">
                Platform Distribution
              </h2>
              <div className="grid grid-cols-3 gap-4">
                {([['web', 'Web', 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'], ['ios', 'iOS', 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'], ['android', 'Android', 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300']] as const).map(([key, label, cls]) => (
                  <div
                    key={key}
                    className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm text-center"
                  >
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
                      {label}
                    </span>
                    <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
                      {analytics.platformDistribution![key as keyof typeof analytics.platformDistribution]}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Breakdown by action */}
          <div>
            <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-200">
              Interventions by Action
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Object.entries(analytics.interventionsByAction).map(([action, count]) => (
                <div
                  key={action}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm text-center"
                >
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {actionLabels[action] ?? action}
                  </p>
                  <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">{count}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
