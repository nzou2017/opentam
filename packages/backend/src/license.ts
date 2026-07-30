// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { importSPKI, jwtVerify } from 'jose';
import type { Feature } from '@opentam/shared';

// Ed25519 public key for license verification (can verify but not forge).
// Override via LICENSE_PUBLIC_KEY env var (full PEM string, or just the base64 body).
const DEFAULT_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA3C65h8OryVxcEy1iM7+e1NW6QMG2N7zskaxphNIEyOU=
-----END PUBLIC KEY-----`;

function getPublicKeyPem(): string {
  const env = process.env.LICENSE_PUBLIC_KEY?.trim();
  if (!env) return DEFAULT_PUBLIC_KEY_PEM;
  if (env.startsWith('-----')) return env;
  // bare base64 body — wrap it
  return `-----BEGIN PUBLIC KEY-----\n${env}\n-----END PUBLIC KEY-----`;
}

export interface LicensePayload {
  plan: string;
  features: Feature[];
  expiresAt: string;
  iss?: string;
  sub?: string;
}

let cachedLicense: LicensePayload | null = null;
let licenseError: string | null = null;

/**
 * Verify a license key's signature and expiry. Does not touch any cache —
 * safe to call for per-tenant license checks in multi-tenant SaaS mode,
 * where the deployment-wide `cachedLicense` below must not be mutated by
 * a single tenant's key.
 */
async function verifyLicenseToken(token: string): Promise<LicensePayload> {
  const publicKey = await importSPKI(getPublicKeyPem(), 'EdDSA');
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: 'q-license',
  });

  const features = (payload.features as string[] | undefined) ?? [];
  const expiresAt = payload.exp
    ? new Date(payload.exp * 1000).toISOString()
    : '';

  if (payload.exp && payload.exp * 1000 < Date.now()) {
    throw new Error('License expired');
  }

  return {
    plan: (payload.plan as string) ?? 'enterprise',
    features: features as Feature[],
    expiresAt,
  };
}

async function validateAndCacheLicense(token: string): Promise<void> {
  try {
    cachedLicense = await verifyLicenseToken(token);
    licenseError = null;
    console.log(
      `[license] Valid license: plan=${cachedLicense.plan}, features=[${cachedLicense.features.join(',')}], expires=${cachedLicense.expiresAt}`,
    );
  } catch (err) {
    cachedLicense = null;
    licenseError = err instanceof Error ? err.message : 'Invalid license key';
    console.warn(`[license] ${licenseError}`);
  }
}

/**
 * Verify a license key for a single tenant, independent of the
 * deployment-wide license cache. Use this — never `validateLicenseKey` —
 * when activating a license on a specific tenant in multi-tenant SaaS mode,
 * so one customer's key can't leak Enterprise access to every other tenant.
 */
export async function verifyTenantLicenseKey(token: string): Promise<LicensePayload> {
  return verifyLicenseToken(token);
}

export async function initLicense(): Promise<void> {
  // 1. Try env var (legacy / enterprise set via env)
  const token = process.env.Q_LICENSE_KEY;
  if (token) {
    try {
      await validateAndCacheLicense(token);
    } catch (err) {
      cachedLicense = null;
      licenseError = err instanceof Error ? err.message : 'Invalid license key';
      console.warn(`[license] Invalid license key: ${licenseError}`);
    }
    return;
  }

  // 2. Try DB (set via setup wizard)
  try {
    const { getStore } = await import('./db/index.js');
    const store = getStore();
    const sl = await store.getServerLicense();
    if (sl?.setupCompleted && sl.licenseKey) {
      try {
        await validateAndCacheLicense(sl.licenseKey);
      } catch (err) {
        cachedLicense = null;
        licenseError = err instanceof Error ? err.message : 'Invalid license key';
        console.warn(`[license] Invalid license key from DB: ${licenseError}`);
      }
      return;
    }
  } catch { /* store not ready yet */ }

  cachedLicense = null;
  licenseError = null;
  console.log('[license] No license configured — running in Community mode');
}

export function getLicense(): LicensePayload | null {
  return cachedLicense;
}

export function getLicenseError(): string | null {
  return licenseError;
}

export function isFeatureLicensed(feature: Feature): boolean {
  if (!cachedLicense) return false;
  return cachedLicense.features.includes(feature);
}

/**
 * Re-validate a license key token (used when activating via API).
 * Updates the in-memory cache and returns the parsed payload or throws.
 */
export async function validateLicenseKey(
  token: string,
): Promise<LicensePayload> {
  await validateAndCacheLicense(token);
  if (!cachedLicense) {
    throw new Error(licenseError ?? 'Invalid license key');
  }
  return cachedLicense;
}
