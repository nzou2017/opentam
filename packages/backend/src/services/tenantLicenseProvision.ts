// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { config } from '../config.js';
import { verifyTenantLicenseKey } from '../license.js';

/**
 * Raised when SaaS-mode tenant provisioning against the license server fails.
 * Signup routes turn this into a 502 and abort, so a tenant is never created
 * without a valid, recorded license.
 */
export class LicenseProvisioningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LicenseProvisioningError';
  }
}

export interface TenantLicense {
  licenseKey: string;
  licenseExpiresAt: string;
  licenseRefreshToken?: string;
}

/**
 * Register a newly-created tenant with the license server and return its
 * issued license key, expiry, and renewal token.
 *
 * Returns `null` when SaaS provisioning is disabled (self-hosted / community /
 * tests) so signup proceeds with no license. When it is enabled, any failure —
 * unreachable server, non-2xx response, or an unverifiable key — throws a
 * {@link LicenseProvisioningError}; the caller aborts signup rather than
 * creating an unlicensed, unrecorded tenant.
 *
 * Verification uses `verifyTenantLicenseKey` — never the deployment-wide cache
 * — so one tenant's key can never leak plan access to other tenants.
 */
export async function registerTenantWithLicenseServer(params: {
  tenantId: string;
  tenantName: string;
  ownerName: string;
  ownerEmail: string;
  plan: string;
}): Promise<TenantLicense | null> {
  if (!config.registerTenantsWithLicenseServer) return null;

  let res: Response;
  try {
    res = await fetch(`${config.licenseServerUrl}/api/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': config.licenseServerApiKey,
      },
      body: JSON.stringify({
        name: params.ownerName,
        email: params.ownerEmail,
        company: params.tenantName,
        plan: params.plan,
        externalId: params.tenantId,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    console.warn(`[license] Tenant ${params.tenantId} registration error: ${err instanceof Error ? err.message : String(err)}`);
    throw new LicenseProvisioningError(
      timedOut
        ? 'The license server timed out. Please try again in a moment.'
        : 'Could not reach the license server. Please try again in a moment.',
    );
  }

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const errMsg = (errBody.error ?? errBody.message ?? `HTTP ${res.status}`) as string;
    console.warn(`[license] Tenant ${params.tenantId} registration failed: ${errMsg}`);
    throw new LicenseProvisioningError(`Could not create your workspace: ${errMsg}`);
  }

  const regData = (await res.json().catch(() => ({}))) as {
    licenseKey?: string;
    refreshToken?: string;
    expiresAt?: string;
  };
  if (!regData.licenseKey) {
    console.warn(`[license] Tenant ${params.tenantId} registration returned no license key`);
    throw new LicenseProvisioningError('The license server returned an incomplete response. Please try again.');
  }

  // Verify the key the server issued is authentic before recording it.
  let payload;
  try {
    payload = await verifyTenantLicenseKey(regData.licenseKey);
  } catch (err) {
    console.warn(`[license] Tenant ${params.tenantId} received an invalid license key: ${err instanceof Error ? err.message : String(err)}`);
    throw new LicenseProvisioningError('The license server returned an invalid license key. Please try again.');
  }

  return {
    licenseKey: regData.licenseKey,
    licenseExpiresAt: payload.expiresAt || regData.expiresAt || '',
    licenseRefreshToken: regData.refreshToken,
  };
}
