// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getStore } from '../db/index.js';
import { config } from '../config.js';
import { validateLicenseKey } from '../license.js';
import type { ServerLicense } from '../db/store.js';

const PLAN_FEATURES: Record<string, string[]> = {
  hobbyist: ['frustration_detection', 'overlay_hints', 'basic_analytics'],
  startup: ['frustration_detection', 'overlay_hints', 'basic_analytics', 'surveys', 'team_access'],
  enterprise: ['frustration_detection', 'overlay_hints', 'advanced_analytics', 'surveys', 'team_access', 'sso', 'audit_logs', 'custom_branding'],
};

const SetupBodySchema = z.object({
  ownerName: z.string().min(1),
  ownerEmail: z.string().email(),
  company: z.string().optional(),
  plan: z.enum(['hobbyist', 'startup', 'enterprise']),
  licenseKey: z.string().optional(),
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

    const { ownerName, ownerEmail, company, plan, licenseKey } = parseResult.data;
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

      return reply.send({
        success: true,
        plan,
        features: PLAN_FEATURES[plan] ?? [],
        expiresAt: regData.expiresAt,
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

    return reply.send({
      success: true,
      plan: 'enterprise',
      features: PLAN_FEATURES['enterprise'] ?? [],
      expiresAt: licensePayload.expiresAt,
    });
  });
}
