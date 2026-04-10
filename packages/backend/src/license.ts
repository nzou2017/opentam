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

export async function initLicense(): Promise<void> {
  const token = process.env.Q_LICENSE_KEY;
  if (!token) {
    cachedLicense = null;
    licenseError = null;
    console.log('[license] No Q_LICENSE_KEY set — running in Community mode');
    return;
  }

  try {
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
  } catch (err) {
    cachedLicense = null;
    licenseError = err instanceof Error ? err.message : 'Invalid license key';
    console.warn(`[license] Invalid license key: ${licenseError}`);
  }
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
 * Returns the parsed payload or throws.
 */
export async function validateLicenseKey(
  token: string,
): Promise<LicensePayload> {
  const publicKey = await importSPKI(PUBLIC_KEY_PEM, 'EdDSA');
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

  const license: LicensePayload = {
    plan: (payload.plan as string) ?? 'enterprise',
    features: features as Feature[],
    expiresAt,
  };

  // Update cached license
  cachedLicense = license;
  licenseError = null;

  return license;
}
