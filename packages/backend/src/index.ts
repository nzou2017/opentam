// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import Fastify from 'fastify';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config.js';
import { initStore } from './db/index.js';
import { registerCors } from './plugins/cors.js';
import { healthRoutes } from './routes/health.js';
import { eventsRoutes } from './routes/events.js';
import { mapRoutes } from './routes/map.js';
import { analyticsRoutes } from './routes/analytics.js';
import { ingestRoutes } from './routes/ingest.js';
import { crawlRoutes } from './routes/crawl.js';
import { searchRoutes } from './routes/search.js';
import { chatRoutes } from './routes/chat.js';
import { mapDiscoverRoutes } from './routes/mapDiscover.js';
import { transcribeRoutes } from './routes/transcribe.js';
import { authRoutes } from './routes/auth.js';
import { passwordResetRoutes } from './routes/passwordReset.js';
import { ssoRoutes } from './routes/sso.js';
import { twoFactorRoutes } from './routes/twoFactor.js';
import { tenantRoutes } from './routes/tenant.js';
import { usageRoutes } from './routes/usage.js';
import { settingsRoutes } from './routes/settings.js';
import { integrationRoutes } from './routes/integrations.js';
import { spiderRoutes } from './routes/spider.js';
import { workflowRoutes } from './routes/workflows.js';
import { pathRoutes } from './routes/paths.js';
import { featureRequestRoutes } from './routes/featureRequests.js';
import { surveyRoutes } from './routes/surveys.js';
import { auditLogRoutes } from './routes/auditLogs.js';
import { registerAuthHook } from './middleware/auth.js';
import { initIntegrationBus } from './integrations/bus.js';
import { seedQAdminDocs } from './seed/seedQAdminDocs.js';
import { initLicense } from './license.js';

async function bootstrap(): Promise<void> {
  const isDev = process.env.NODE_ENV !== 'production';
  const app = Fastify({
    logger: isDev
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true },
          },
        }
      : true,
  });

  // Initialize store
  await initStore();

  // Initialize license verification
  await initLicense();

  // Initialize integration bus
  initIntegrationBus();

  // Plugins
  await registerCors(app);

  // Auth hook (global)
  registerAuthHook(app);

  // Routes
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(passwordResetRoutes);
  await app.register(ssoRoutes);
  await app.register(twoFactorRoutes);
  await app.register(eventsRoutes);
  await app.register(mapRoutes);
  await app.register(analyticsRoutes);
  await app.register(ingestRoutes);
  await app.register(crawlRoutes);
  await app.register(searchRoutes);
  await app.register(chatRoutes);
  await app.register(transcribeRoutes);
  await app.register(mapDiscoverRoutes);
  await app.register(tenantRoutes);
  await app.register(usageRoutes);
  await app.register(settingsRoutes);
  await app.register(integrationRoutes);
  await app.register(spiderRoutes);
  await app.register(workflowRoutes);
  await app.register(pathRoutes);
  await app.register(featureRequestRoutes);
  await app.register(surveyRoutes);
  await app.register(auditLogRoutes);

  // Serve demo page
  const demoHtml = readFileSync(resolve(__dirname, 'public/demo.html'), 'utf-8');
  app.get('/demo', (_req, reply) => reply.type('text/html').send(demoHtml));

  // Serve SDK bundle
  const sdkPaths = [
    resolve(__dirname, '../../sdk/dist/q.min.js'),    // monorepo
    resolve(__dirname, '../sdk_dist/q.min.js'),        // Docker
  ];
  let sdkBundle = '';
  for (const p of sdkPaths) {
    try { sdkBundle = readFileSync(p, 'utf-8'); break; } catch { /* try next */ }
  }
  if (sdkBundle) {
    app.get('/sdk/q.min.js', (_req, reply) =>
      reply.type('application/javascript').send(sdkBundle));
  }

  // Seed Q admin docs (non-blocking — runs in background after server starts)
  seedQAdminDocs().catch((err) => app.log.error({ err }, 'Failed to seed Q admin docs'));

  // Start server
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`Q backend listening on port ${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

bootstrap();
