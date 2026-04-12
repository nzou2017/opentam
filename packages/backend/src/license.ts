// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { importSPKI, jwtVerify } from 'jose';
import type { Feature } from '@opentam/shared';

// Ed25519 public key for license verification (can verify but not forge)
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA3C65h8OryVxcEy1iM7+e1NW6QMG2N7zskaxphNIEyOU=
-----END PUBLIC KEY-----`;

export interface LicensePayload {
  plan: string;
  features: Feature[];
  expiresAt: string;
  iss?: string;
  sub?: string;
}

let cachedLicense: LicensePayload | null = null;
let licenseError: string | null = null;

async function validateAndCacheLicense(token: string): Promise<void> {
  const publicKey = await importSPKI(PUBLIC_KEY_PEM, 'EdDSA');
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: 'q-license',
  });

  const features = (payload.features as string[] | undefined) ?? [];
  const expiresAt = payload.exp
    ? new Date(payload.exp * 1000).toISOString()
    : '';

  if (payload.exp && payload.exp * 1000 < Date.now()) {
    cachedLicense = null;
    licenseError = 'License expired';
    console.warn('[license] License key is expired');
    return;
  }

  cachedLicense = {
    plan: (payload.plan as string) ?? 'enterprise',
    features: features as Feature[],
    expiresAt,
  };
  licenseError = null;
  console.log(
    `[license] Valid license: plan=${cachedLicense.plan}, features=[${cachedLicense.features.join(',')}], expires=${cachedLicense.expiresAt}`,
  );
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
