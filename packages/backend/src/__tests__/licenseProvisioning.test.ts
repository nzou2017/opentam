// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { generateKeyPair, exportSPKI, SignJWT } from 'jose';

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
import { buildApp } from './setup.js';
import { getStore } from '../db/index.js';
import { config } from '../config.js';
import { refreshExpiringTenantLicenses } from '../services/tenantLicenseRefresh.js';

let app: FastifyInstance;
let privateKey: PrivateKey;
const realFetch = global.fetch;
let uid = 0;

beforeAll(async () => {
  app = await buildApp();
  // Use a throwaway keypair so the test can mint real, verifiable license keys.
  // license.ts reads LICENSE_PUBLIC_KEY lazily on each verify, so setting it now works.
  const kp = await generateKeyPair('EdDSA');
  privateKey = kp.privateKey;
  process.env.LICENSE_PUBLIC_KEY = await exportSPKI(kp.publicKey);
});

afterAll(async () => {
  await app.close();
  delete process.env.LICENSE_PUBLIC_KEY;
  global.fetch = realFetch;
});

afterEach(() => {
  global.fetch = realFetch;
  setProvisioning(false);
  vi.restoreAllMocks();
});

function setProvisioning(enabled: boolean): void {
  (config as { registerTenantsWithLicenseServer: boolean }).registerTenantsWithLicenseServer = enabled;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Mint a real license key signed by the test keypair. */
async function signLicense(opts: { plan?: string; expiresInMs?: number } = {}): Promise<string> {
  const expSec = Math.floor((Date.now() + (opts.expiresInMs ?? 30 * 24 * 60 * 60 * 1000)) / 1000);
  return new SignJWT({ plan: opts.plan ?? 'hobbyist', features: [] })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setIssuer('q-license')
    .setExpirationTime(expSec)
    .sign(privateKey);
}

function registerPayload() {
  uid += 1;
  return { email: `lic-${Date.now()}-${uid}@example.com`, password: 'Password123!', name: 'Lic User' };
}

describe('License provisioning on signup', () => {
  it('does not contact the license server when provisioning is disabled', async () => {
    setProvisioning(false);
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: registerPayload() });

    expect(res.statusCode).toBe(201);
    expect(fetchSpy).not.toHaveBeenCalled();
    const tenant = await getStore().getTenantById(JSON.parse(res.body).user.tenantId);
    expect(tenant?.licenseKey).toBeUndefined();
  });

  it('provisions and records a license (key, expiry, refresh token) on signup', async () => {
    setProvisioning(true);
    const key = await signLicense({ expiresInMs: 30 * 24 * 60 * 60 * 1000 });
    const fetchSpy = vi.fn(async () =>
      jsonResponse({ licenseKey: key, refreshToken: 'rt_signup', expiresAt: '2030-01-01T00:00:00.000Z' }),
    );
    global.fetch = fetchSpy as unknown as typeof fetch;

    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: registerPayload() });

    expect(res.statusCode).toBe(201);
    const tenantId = JSON.parse(res.body).user.tenantId as string;
    const tenant = await getStore().getTenantById(tenantId);
    expect(tenant?.licenseKey).toBe(key);
    expect(tenant?.licenseRefreshToken).toBe('rt_signup');
    expect(tenant?.licenseExpiresAt).toBeTruthy();

    // Registered against the license server with the tenant id as external id.
    const [url, opts] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/api/register');
    expect(JSON.parse(opts.body as string).externalId).toBe(tenantId);
  });

  it('aborts signup with 502 and creates no tenant when the license server rejects', async () => {
    setProvisioning(true);
    global.fetch = vi.fn(async () => jsonResponse({ error: 'quota exceeded' }, 402)) as unknown as typeof fetch;

    const payload = registerPayload();
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });

    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body).error).toContain('quota exceeded');
    // Neither the user nor a tenant should have been created.
    expect(await getStore().getUserByEmail(payload.email)).toBeUndefined();
  });

  it('aborts signup with 502 when the license server is unreachable', async () => {
    setProvisioning(true);
    global.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const payload = registerPayload();
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });

    expect(res.statusCode).toBe(502);
    expect(await getStore().getUserByEmail(payload.email)).toBeUndefined();
  });

  it('aborts signup with 502 when the returned key fails verification', async () => {
    setProvisioning(true);
    // A syntactically-plausible but unsigned/invalid token.
    global.fetch = vi.fn(async () =>
      jsonResponse({ licenseKey: 'not-a-valid-jwt', refreshToken: 'rt', expiresAt: '2030-01-01T00:00:00.000Z' }),
    ) as unknown as typeof fetch;

    const payload = registerPayload();
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });

    expect(res.statusCode).toBe(502);
    expect(await getStore().getUserByEmail(payload.email)).toBeUndefined();
  });
});

describe('Per-tenant license auto-renew', () => {
  async function seedTenant(fields: { expiresInMs: number; refreshToken?: string | null; licenseKey?: string }) {
    uid += 1;
    const id = `tenant-renew-${Date.now()}-${uid}`;
    await getStore().createTenant({
      id,
      name: `Renew ${id}`,
      sdkKey: `sdk_${id}`,
      secretKey: `sk_${id}`,
      plan: 'hobbyist',
      licenseKey: fields.licenseKey ?? 'old-key',
      licenseExpiresAt: new Date(Date.now() + fields.expiresInMs).toISOString(),
      licenseRefreshToken: fields.refreshToken === null ? undefined : (fields.refreshToken ?? 'rt_seed'),
    });
    return id;
  }

  it('renews a tenant whose license expires within the window', async () => {
    const id = await seedTenant({ expiresInMs: 2 * 24 * 60 * 60 * 1000, refreshToken: 'rt_old' });
    const newKey = await signLicense({ expiresInMs: 30 * 24 * 60 * 60 * 1000 });
    global.fetch = vi.fn(async () =>
      jsonResponse({ licenseKey: newKey, refreshToken: 'rt_new', expiresAt: '2030-06-01T00:00:00.000Z' }),
    ) as unknown as typeof fetch;

    const summary = await refreshExpiringTenantLicenses();

    expect(summary.renewed).toBeGreaterThanOrEqual(1);
    const tenant = await getStore().getTenantById(id);
    expect(tenant?.licenseKey).toBe(newKey);
    expect(tenant?.licenseRefreshToken).toBe('rt_new'); // token rotated
  });

  it('leaves a not-yet-expiring tenant untouched', async () => {
    const id = await seedTenant({ expiresInMs: 60 * 24 * 60 * 60 * 1000, licenseKey: 'fresh-key' });
    // Any renewal attempt would fail this call — but a far-off tenant must be skipped.
    global.fetch = vi.fn(async () => jsonResponse({}, 500)) as unknown as typeof fetch;

    await refreshExpiringTenantLicenses();

    const tenant = await getStore().getTenantById(id);
    expect(tenant?.licenseKey).toBe('fresh-key');
  });

  it('keeps the existing license when renewal fails', async () => {
    const id = await seedTenant({ expiresInMs: 1 * 24 * 60 * 60 * 1000, licenseKey: 'keep-key', refreshToken: 'rt_keep' });
    global.fetch = vi.fn(async () => jsonResponse({ error: 'invalid refresh token' }, 401)) as unknown as typeof fetch;

    const summary = await refreshExpiringTenantLicenses();

    expect(summary.failed).toBeGreaterThanOrEqual(1);
    const tenant = await getStore().getTenantById(id);
    expect(tenant?.licenseKey).toBe('keep-key');
    expect(tenant?.licenseRefreshToken).toBe('rt_keep');
  });
});
