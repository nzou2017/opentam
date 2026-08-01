// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Test helper — spins up a real Fastify instance with the in-memory store.
 * Every test file that imports `buildApp()` gets a fresh app + fresh store.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { initStore, getStore } from '../db/index.js';
import { registerCors } from '../plugins/cors.js';
import { registerAuthHook } from '../middleware/auth.js';

// Route modules
import { healthRoutes } from '../routes/health.js';
import { authRoutes } from '../routes/auth.js';
import { passwordResetRoutes } from '../routes/passwordReset.js';
import { ssoRoutes } from '../routes/sso.js';
import { twoFactorRoutes } from '../routes/twoFactor.js';
import { eventsRoutes } from '../routes/events.js';
import { mapRoutes } from '../routes/map.js';
import { analyticsRoutes } from '../routes/analytics.js';
import { searchRoutes } from '../routes/search.js';
import { chatRoutes } from '../routes/chat.js';
import { transcribeRoutes } from '../routes/transcribe.js';
import { mapDiscoverRoutes } from '../routes/mapDiscover.js';
import { tenantRoutes } from '../routes/tenant.js';
import { usageRoutes } from '../routes/usage.js';
import { settingsRoutes } from '../routes/settings.js';
import { integrationRoutes } from '../routes/integrations.js';
import { workflowRoutes } from '../routes/workflows.js';
import { pathRoutes } from '../routes/paths.js';
import { featureRequestRoutes } from '../routes/featureRequests.js';
import { surveyRoutes } from '../routes/surveys.js';
import { auditLogRoutes } from '../routes/auditLogs.js';
import { spiderRoutes } from '../routes/spider.js';
import { crawlRoutes } from '../routes/crawl.js';
import { initIntegrationBus } from '../integrations/bus.js';
import { initLicense } from '../license.js';

// Seeded test credentials (from inMemoryStore.seed())
export const SDK_KEY = 'sdk_test_acme';
export const SECRET_KEY = 'sk_test_acme';
export const TENANT_ID = 'tenant-1';

// OpenTAM Admin Portal tenant
export const Q_ADMIN_SDK_KEY = 'sdk_q_admin';
export const Q_ADMIN_SECRET_KEY = 'sk_q_admin';
export const Q_ADMIN_TENANT_ID = 'tenant-q-admin';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Force in-memory store (no DATABASE_URL)
  delete process.env.DATABASE_URL;
  await initStore();
  await initLicense();
  initIntegrationBus();

  await registerCors(app);
  registerAuthHook(app);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(passwordResetRoutes);
  await app.register(ssoRoutes);
  await app.register(twoFactorRoutes);
  await app.register(eventsRoutes);
  await app.register(mapRoutes);
  await app.register(analyticsRoutes);
  await app.register(searchRoutes);
  await app.register(chatRoutes);
  await app.register(transcribeRoutes);
  await app.register(mapDiscoverRoutes);
  await app.register(tenantRoutes);
  await app.register(usageRoutes);
  await app.register(settingsRoutes);
  await app.register(integrationRoutes);
  await app.register(workflowRoutes);
  await app.register(pathRoutes);
  await app.register(featureRequestRoutes);
  await app.register(surveyRoutes);
  await app.register(auditLogRoutes);
  await app.register(spiderRoutes);
  await app.register(crawlRoutes);

  await app.ready();
  return app;
}

/** Helper to register a user and get a JWT token back */
export async function registerAndGetToken(
  app: FastifyInstance,
  overrides?: { email?: string; password?: string; name?: string; tenantName?: string; plan?: 'hobbyist' | 'startup' | 'enterprise' },
) {
  const email = overrides?.email ?? `test-${Date.now()}@example.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email,
      password: overrides?.password ?? 'TestPass1234!',
      name: overrides?.name ?? 'Test User',
      tenantName: overrides?.tenantName,
    },
  });
  const body = JSON.parse(res.body);
  const tenantId = body.user?.tenantId as string;

  // Registration always creates a hobbyist-plan tenant; bump it for tests
  // that need to exercise startup/enterprise-gated features.
  if (overrides?.plan && overrides.plan !== 'hobbyist') {
    await getStore().updateTenant(tenantId, { plan: overrides.plan });
  }

  return { token: body.token as string, user: body.user, tenantId };
}
