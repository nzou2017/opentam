// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { Tenant } from '@opentam/shared';
import { getStore } from '../db/index.js';
import { config } from '../config.js';
import { verifyTenantLicenseKey } from '../license.js';

// How often the scheduler scans for tenants whose license is about to expire.
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
// Renew a tenant's license once it is within this window of expiring.
const RENEW_BEFORE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
// Give the app a moment to finish booting before the first scan.
const INITIAL_DELAY_MS = 60 * 1000; // 1 minute

let timer: ReturnType<typeof setInterval> | null = null;
// Prevents a slow scan from overlapping the next tick (per-tenant network
// calls can take seconds; a backlog must not run passes concurrently).
let running = false;

export interface RefreshSummary {
  scanned: number;
  eligible: number;
  renewed: number;
  failed: number;
}

/**
 * Start the background scheduler that renews SaaS-provisioned tenant licenses
 * before they expire. No-op unless tenant provisioning is enabled — community /
 * self-hosted deployments never issue per-tenant licenses, so there is nothing
 * to renew. Safe to call once at startup; repeated calls are ignored.
 */
export function startTenantLicenseRefreshScheduler(): void {
  if (!config.registerTenantsWithLicenseServer) return;
  if (timer) return;

  // Kick off an initial pass shortly after boot, then on a fixed interval.
  setTimeout(() => {
    void refreshExpiringTenantLicenses().catch((err) =>
      console.warn('[tenant-license] Initial refresh pass failed:', err),
    );
  }, INITIAL_DELAY_MS).unref?.();

  timer = setInterval(() => {
    void refreshExpiringTenantLicenses().catch((err) =>
      console.warn('[tenant-license] Scheduled refresh pass failed:', err),
    );
  }, CHECK_INTERVAL_MS);
  timer.unref?.();
}

/** Stop the scheduler (used in teardown / tests). */
export function stopTenantLicenseRefreshScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * Scan every tenant that holds a refresh token and renew the ones whose
 * license expires within {@link RENEW_BEFORE_MS}. Each tenant is refreshed
 * independently — one failure never aborts the pass. Returns a summary for
 * logging and tests.
 */
export async function refreshExpiringTenantLicenses(now: Date = new Date()): Promise<RefreshSummary> {
  const summary: RefreshSummary = { scanned: 0, eligible: 0, renewed: 0, failed: 0 };

  // Guard against overlapping passes when a prior scan is still in flight.
  if (running) return summary;
  running = true;

  try {
    const store = getStore();
    const tenants = await store.listTenantsWithLicenseRefresh();
    summary.scanned = tenants.length;

    for (const tenant of tenants) {
      if (!isDueForRenewal(tenant, now)) continue;
      summary.eligible += 1;
      try {
        await renewTenantLicense(tenant);
        summary.renewed += 1;
      } catch (err) {
        summary.failed += 1;
        console.warn(
          `[tenant-license] Renewal failed for tenant ${tenant.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } finally {
    running = false;
  }

  if (summary.renewed > 0 || summary.failed > 0) {
    console.log(
      `[tenant-license] Refresh pass: scanned=${summary.scanned} eligible=${summary.eligible} renewed=${summary.renewed} failed=${summary.failed}`,
    );
  }
  return summary;
}

/** A tenant is due when its license expires within the renewal window. */
function isDueForRenewal(tenant: Tenant, now: Date): boolean {
  if (!tenant.licenseRefreshToken || !tenant.licenseExpiresAt) return false;
  const expiresMs = new Date(tenant.licenseExpiresAt).getTime();
  if (Number.isNaN(expiresMs)) return false;
  return expiresMs - now.getTime() <= RENEW_BEFORE_MS;
}

/**
 * Renew a single tenant's license with the license server and persist the
 * rotated key + refresh token. Throws on any failure so the caller can count
 * it; on failure the tenant keeps its existing (still-valid) license.
 */
async function renewTenantLicense(tenant: Tenant): Promise<void> {
  const res = await fetch(`${config.licenseServerUrl}/api/licenses/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': config.licenseServerApiKey,
    },
    body: JSON.stringify({
      refreshToken: tenant.licenseRefreshToken,
      externalId: tenant.id,
      plan: tenant.plan,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const errMsg = (errBody.error ?? errBody.message ?? `HTTP ${res.status}`) as string;
    throw new Error(errMsg);
  }

  const data = (await res.json().catch(() => ({}))) as {
    licenseKey?: string;
    refreshToken?: string;
    expiresAt?: string;
  };
  if (!data.licenseKey) throw new Error('license server returned no license key');

  // Verify the rotated key is authentic before we overwrite the working one.
  const payload = await verifyTenantLicenseKey(data.licenseKey);

  await getStore().updateTenant(tenant.id, {
    licenseKey: data.licenseKey,
    licenseExpiresAt: payload.expiresAt || data.expiresAt || tenant.licenseExpiresAt,
    // Rotate the refresh token when the server issues a new one; otherwise keep
    // the existing one so the tenant stays renewable.
    licenseRefreshToken: data.refreshToken ?? tenant.licenseRefreshToken,
  });

  console.log(`[tenant-license] Renewed license for tenant ${tenant.id}`);
}
