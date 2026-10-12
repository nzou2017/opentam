// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Backfill license provisioning for tenants that were created before license
 * registration was wired in (or via a signup path that skipped it, e.g. Google
 * SSO). Registers each licence-less tenant with the license server and persists
 * the issued key / expiry / refresh token.
 *
 * The auto-renew scheduler only tracks tenants that already hold a refresh
 * token, so unregistered tenants never self-heal — this script is how they get
 * onto the license server after the fact.
 *
 * Usage (from packages/backend):
 *   REGISTER_TENANTS_WITH_LICENSE_SERVER=true \
 *   LICENSE_SERVER_URL=https://license.opentam.io \
 *   LICENSE_SERVER_API_KEY=... \
 *   DATABASE_URL=file:./data/q.db \
 *   pnpm backfill:licenses [--dry-run]
 *
 * Idempotent: only touches tenants with no license key, so re-running after a
 * partial failure retries just the ones still missing.
 */

import { config } from '../config.js';
import { initStore } from '../db/index.js';
import { registerTenantWithLicenseServer } from '../services/tenantLicenseProvision.js';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  if (!config.registerTenantsWithLicenseServer) {
    console.error(
      '[backfill] REGISTER_TENANTS_WITH_LICENSE_SERVER is not "true" — provisioning is disabled, nothing to do.\n' +
        '           Set it (and LICENSE_SERVER_URL / LICENSE_SERVER_API_KEY) before running the backfill.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(`[backfill] License server: ${config.licenseServerUrl}`);
  if (dryRun) console.log('[backfill] DRY RUN — no tenants will be registered or modified.');

  const store = await initStore();
  const tenants = await store.listTenantsMissingLicense();

  if (tenants.length === 0) {
    console.log('[backfill] No tenants missing a license. Done.');
    return;
  }

  console.log(`[backfill] ${tenants.length} tenant(s) missing a license.`);

  let registered = 0;
  let skipped = 0;
  let failed = 0;

  for (const tenant of tenants) {
    // Pick the owner as the license contact; fall back to the first user.
    const users = await store.getUsersByTenantId(tenant.id);
    const owner = users.find((u) => u.role === 'owner') ?? users[0];
    if (!owner) {
      console.warn(`[backfill] Tenant ${tenant.id} (${tenant.name}) has no users — skipping.`);
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(`[backfill] Would register tenant ${tenant.id} (${tenant.name}) as ${owner.email} [plan=${tenant.plan}]`);
      registered += 1;
      continue;
    }

    try {
      const license = await registerTenantWithLicenseServer({
        tenantId: tenant.id,
        tenantName: tenant.name,
        ownerName: owner.name,
        ownerEmail: owner.email,
        plan: tenant.plan,
      });
      if (!license) {
        // Should not happen (flag is checked above), but guard anyway.
        console.warn(`[backfill] Tenant ${tenant.id}: provisioning returned no license — skipping.`);
        skipped += 1;
        continue;
      }
      await store.updateTenant(tenant.id, {
        licenseKey: license.licenseKey,
        licenseExpiresAt: license.licenseExpiresAt,
        licenseRefreshToken: license.licenseRefreshToken,
      });
      console.log(`[backfill] Registered tenant ${tenant.id} (${tenant.name}).`);
      registered += 1;
    } catch (err) {
      console.error(`[backfill] Tenant ${tenant.id} (${tenant.name}) failed: ${err instanceof Error ? err.message : String(err)}`);
      failed += 1;
    }
  }

  console.log(`[backfill] Done. registered=${registered} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[backfill] Fatal:', err);
  process.exit(1);
});
