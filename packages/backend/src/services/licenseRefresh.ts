// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { getStore } from '../db/index.js';
import { config } from '../config.js';
import { validateLicenseKey } from '../license.js';

const REFRESH_INTERVAL_MS = 25 * 24 * 60 * 60 * 1000; // 25 days

export function startLicenseRefreshScheduler(): void {
  scheduleRefresh();
}

async function doRefresh(): Promise<void> {
  const store = getStore();
  const sl = await store.getServerLicense();
  if (!sl || sl.plan === 'enterprise' || !sl.refreshToken || !sl.setupCompleted) return;

  try {
    const res = await fetch(`${config.licenseServerUrl}/api/licenses/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: sl.refreshToken,
        deploymentId: sl.deploymentId,
        name: `OpenTAM ${sl.ownerName}`,
        version: '1.0.0',
        ownerEmail: sl.ownerEmail,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[license-refresh] Refresh failed: ${res.status}`);
      return;
    }

    const data = await res.json() as { licenseKey: string; refreshToken: string; expiresAt: string };
    await store.saveServerLicense({
      ...sl,
      licenseKey: data.licenseKey,
      refreshToken: data.refreshToken,
      licenseExpiresAt: data.expiresAt,
      updatedAt: new Date().toISOString(),
    });
    await validateLicenseKey(data.licenseKey);
    console.log('[license-refresh] License refreshed successfully');
  } catch (err) {
    console.warn('[license-refresh] Refresh error:', err);
  }
}

function scheduleRefresh(): void {
  getStore().getServerLicense().then((sl) => {
    if (!sl || sl.plan === 'enterprise' || !sl.refreshToken) return;

    // If expiring within 5 days, refresh now
    if (sl.licenseExpiresAt) {
      const expiresMs = new Date(sl.licenseExpiresAt).getTime();
      const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
      if (expiresMs - Date.now() < fiveDaysMs) {
        doRefresh().catch(console.error);
      }
    }

    // Schedule recurring refresh
    setInterval(() => doRefresh().catch(console.error), REFRESH_INTERVAL_MS);
  }).catch(console.error);
}
