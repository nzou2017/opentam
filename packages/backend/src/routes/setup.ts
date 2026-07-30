// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { randomUUID, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hash } from '@node-rs/argon2';
import { getStore } from '../db/index.js';
import { config } from '../config.js';
import { validateLicenseKey } from '../license.js';
import { createJwt, hashToken } from '../middleware/auth.js';
import type { ServerLicense } from '../db/store.js';
import { isPasswordValid } from '@opentam/shared';

const PLAN_FEATURES: Record<string, string[]> = {
  hobbyist: ['frustration_detection', 'overlay_hints', 'basic_analytics'],
  startup: ['frustration_detection', 'overlay_hints', 'basic_analytics', 'surveys', 'team_access'],
  enterprise: ['frustration_detection', 'overlay_hints', 'advanced_analytics', 'surveys', 'team_access', 'sso', 'audit_logs', 'custom_branding'],
};

function generateKey(prefix: string): string {
  return `${prefix}_${randomBytes(24).toString('hex')}`;
}

const SetupBodySchema = z.object({
  ownerName: z.string().min(1),
  ownerEmail: z.string().email(),
  company: z.string().optional(),
  plan: z.enum(['hobbyist', 'startup', 'enterprise']),
  licenseKey: z.string().optional(),
  // First admin account
  adminEmail: z.string().email(),
  adminPassword: z.string().refine(isPasswordValid, {
    message: 'Password must be at least 12 characters with uppercase, lowercase, number, and special character',
  }),
  adminName: z.string().min(1),
});

export async function setupRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/setup/status — public, no auth required
  app.get('/api/v1/setup/status', async (_request, reply) => {
    const store = getStore();
    const sl = await store.getServerLicense();
    return reply.send({ setupCompleted: sl?.setupCompleted === true });
  });

  // POST /api/v1/setup — public, no auth required
  app.post('/api/v1/setup', async (request, reply) => {
    const store = getStore();

    // Check if setup already completed
    const existing = await store.getServerLicense();
    if (existing?.setupCompleted) {
      return reply.code(400).send({ error: 'Setup already completed' });
    }

    // Validate body
    const parseResult = SetupBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: parseResult.error.issues.map(i => i.message).join(', ') });
    }

    const { ownerName, ownerEmail, company, plan, licenseKey, adminEmail, adminPassword, adminName } = parseResult.data;

    // Helper: create the first tenant + admin user, return session token
    async function createAdminAccount(): Promise<{ token: string; tenantId: string; sdkKey: string; secretKey: string }> {
      const existingUser = await store.getUserByEmail(adminEmail);
      if (existingUser) {
        throw new Error('An account with that email already exists');
      }
      const tenantId = `tenant-${randomUUID().slice(0, 8)}`;
      const sdkKey = generateKey('sdk');
      const secretKey = generateKey('sk');
      await store.createTenant({
        id: tenantId,
        name: company ?? `${adminName}'s Workspace`,
        sdkKey,
        secretKey,
        plan,
      });
      const userId = randomUUID();
      const now = new Date().toISOString();
      const passwordHash = await hash(adminPassword);
      await store.createUser({
        id: userId,
        tenantId,
        email: adminEmail,
        passwordHash,
        name: adminName,
        role: 'owner',
        createdAt: now,
        updatedAt: now,
      });
      const jwt = await createJwt({ userId, tenantId, email: adminEmail, role: 'owner' });
      await store.createSession({
        id: randomUUID(),
        userId,
        tokenHash: hashToken(jwt),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: now,
      });
      return { token: jwt, tenantId, sdkKey, secretKey };
    }
    const deploymentId = randomUUID();
    const now = new Date().toISOString();

    if (plan === 'hobbyist' || plan === 'startup') {
      // Register with license server
      let regData: { licenseKey: string; refreshToken: string; expiresAt: string; customerId?: string };
      try {
        const res = await fetch(`${config.licenseServerUrl}/api/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': config.licenseServerApiKey,
          },
          body: JSON.stringify({
            name: ownerName,
            email: ownerEmail,
            company,
            plan,
            externalId: deploymentId,
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({})) as Record<string, unknown>;
          const errMsg = (errBody as any)?.error ?? (errBody as any)?.message ?? `License server returned ${res.status}`;
          return reply.code(502).send({ error: `License registration failed: ${errMsg}` });
        }

        regData = await res.json() as { licenseKey: string; refreshToken: string; expiresAt: string; customerId?: string };
      } catch (err) {
        if (err instanceof Error && err.name === 'TimeoutError') {
          return reply.code(502).send({ error: 'License server is unreachable. Please try again later.' });
        }
        return reply.code(502).send({ error: 'Unable to reach the license server. Please check your network connection.' });
      }

      // Validate and cache the license key
      let licensePayload;
      try {
        licensePayload = await validateLicenseKey(regData.licenseKey);
      } catch (err) {
        return reply.code(502).send({ error: 'License server returned an invalid license key.' });
      }

      const sl: ServerLicense = {
        deploymentId,
        ownerName,
        ownerEmail,
        company,
        plan,
        licenseKey: regData.licenseKey,
        refreshToken: regData.refreshToken,
        licenseExpiresAt: regData.expiresAt,
        setupCompleted: true,
        createdAt: now,
        updatedAt: now,
      };
      await store.saveServerLicense(sl);

      let adminResult;
      try {
        adminResult = await createAdminAccount();
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : 'Failed to create admin account' });
      }

      return reply.send({
        success: true,
        plan,
        features: PLAN_FEATURES[plan] ?? [],
        expiresAt: regData.expiresAt,
        token: adminResult.token,
        sdkKey: adminResult.sdkKey,
      });
    }

    // Enterprise plan
    if (!licenseKey?.trim()) {
      return reply.code(400).send({ error: 'Enterprise plan requires a license key' });
    }

    // Validate the provided license key
    let licensePayload;
    try {
      licensePayload = await validateLicenseKey(licenseKey.trim());
    } catch (err) {
      return reply.code(400).send({ error: 'Invalid license key: ' + (err instanceof Error ? err.message : String(err)) });
    }

    const sl: ServerLicense = {
      deploymentId,
      ownerName,
      ownerEmail,
      company,
      plan: 'enterprise',
      licenseKey: licenseKey.trim(),
      setupCompleted: true,
      createdAt: now,
      updatedAt: now,
    };
    await store.saveServerLicense(sl);

    let adminResult;
    try {
      adminResult = await createAdminAccount();
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Failed to create admin account' });
    }

    return reply.send({
      success: true,
      plan: 'enterprise',
      features: PLAN_FEATURES['enterprise'] ?? [],
      expiresAt: licensePayload.expiresAt,
      token: adminResult.token,
      sdkKey: adminResult.sdkKey,
    });
  });
}
