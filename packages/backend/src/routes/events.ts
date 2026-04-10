// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { InterventionCommand, Platform } from '@opentam/shared';
import { getStore } from '../db/index.js';
import { scoreFrustration } from '../services/frustrationScorer.js';
import { getIntervention } from '../services/interventionService.js';
import { usageLimiter } from '../middleware/planLimits.js';
import { fireIntegrationEvent } from '../integrations/bus.js';

const PlatformSchema = z.enum(['web', 'ios', 'android']);

const DeviceInfoSchema = z.object({
  model: z.string(),
  os: z.string(),
  screenSize: z.string(),
});

const FrustrationSignalsSchema = z.object({
  rageClicks: z.number().min(0),
  deadEndLoops: z.number().min(0),
  dwellSeconds: z.number().min(0),
  cursorEntropy: z.number().min(0),
});

const FrustrationEventSchema = z.object({
  tenantId: z.string().optional(), // ignored — tenant resolved from SDK key
  sessionId: z.string().min(1),
  userId: z.string().optional(),
  currentUrl: z.string().min(1),
  signals: FrustrationSignalsSchema,
  domSnapshot: z.string(),
  timestamp: z.string().datetime(),
  // Mobile context fields (optional, backward compatible)
  platform: PlatformSchema.optional().default('web'),
  screenName: z.string().optional(),
  appVersion: z.string().optional(),
  deviceInfo: DeviceInfoSchema.optional(),
});

// Telemetry events — lightweight analytics from mobile SDKs
const TelemetryEventSchema = z.object({
  eventName: z.enum(['chatOpened', 'interventionDisplayed', 'interventionDismissed', 'screenView']),
  platform: PlatformSchema,
  screenName: z.string().optional(),
  appVersion: z.string().optional(),
  deviceInfo: DeviceInfoSchema.optional(),
  properties: z.record(z.unknown()).optional(),
});

// Discriminated union for event types
const EventBodySchema = z.discriminatedUnion('eventType', [
  z.object({ eventType: z.literal('frustration') }).merge(FrustrationEventSchema),
  z.object({ eventType: z.literal('telemetry') }).merge(TelemetryEventSchema),
]);

export async function eventsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/events', { preHandler: [usageLimiter('event')] }, async (request, reply) => {
    const store = getStore();

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing or invalid Authorization header' });
    }

    const sdkKey = authHeader.slice('Bearer '.length).trim();
    const tenant = await store.getTenantBySdkKey(sdkKey);
    if (!tenant) {
      return reply.code(401).send({ error: 'Invalid SDK key' });
    }

    // Support both legacy format (no eventType → frustration) and new discriminated format
    const body = request.body as Record<string, unknown>;
    const eventType = body.eventType ?? 'frustration';

    // ── Telemetry events (mobile SDK analytics) ──────────────────────────
    if (eventType === 'telemetry') {
      const parsed = TelemetryEventSchema.safeParse(body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid telemetry event', details: parsed.error.flatten() });
      }

      const telemetry = parsed.data;
      const id = `tel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      await store.addTelemetryEvent({
        id,
        tenantId: tenant.id,
        platform: telemetry.platform,
        eventName: telemetry.eventName,
        screenName: telemetry.screenName,
        appVersion: telemetry.appVersion,
        deviceInfo: telemetry.deviceInfo ? JSON.stringify(telemetry.deviceInfo) : undefined,
        properties: telemetry.properties ? JSON.stringify(telemetry.properties) : undefined,
        createdAt: new Date().toISOString(),
      });

      await store.recordUsage(tenant.id, 'event');

      app.log.info(
        { tenantId: tenant.id, platform: telemetry.platform, eventName: telemetry.eventName },
        'Telemetry event recorded',
      );

      return reply.code(200).send({ ok: true });
    }

    // ── Frustration events (web SDK) ─────────────────────────────────────
    const parseResult = FrustrationEventSchema.safeParse(body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Invalid request body',
        details: parseResult.error.flatten(),
      });
    }

    const event = { ...parseResult.data, tenantId: tenant.id }; // authoritative tenant from SDK key
    const platform = event.platform as Platform;

    const severity = scoreFrustration(event.signals);

    let intervention: InterventionCommand | null = null;

    if (severity === 'high') {
      intervention = await getIntervention(event, tenant, platform);

      const logId = `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const eventId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      await store.addInterventionLog({
        id: logId,
        eventId,
        tenantId: tenant.id,
        sessionId: event.sessionId,
        url: event.currentUrl,
        action: intervention.action,
        elementId: intervention.elementId,
        message: intervention.message,
        confidence: intervention.confidence,
        resolved: false,
        createdAt: new Date().toISOString(),
        platform,
      });

      app.log.info(
        { tenantId: tenant.id, sessionId: event.sessionId, severity, action: intervention.action, platform },
        'High frustration detected — intervention dispatched',
      );
    } else {
      app.log.info(
        { tenantId: tenant.id, sessionId: event.sessionId, severity, platform },
        'Frustration event received',
      );
    }

    // Attach survey if frustration is high and tenant is NOT q-admin
    if (intervention && severity === 'high' && tenant.id !== 'tenant-q-admin') {
      try {
        const surveys = await store.getSurveysByTenantId(tenant.id);
        const matchingSurvey = surveys.find(
          s => s.active && s.triggerOn === 'frustration_high',
        );
        if (matchingSurvey) {
          intervention.surveyId = matchingSurvey.id;
          intervention.surveyQuestions = matchingSurvey.questions;
        }
      } catch {
        // Non-critical — don't block the event response
      }
    }

    // Record usage
    await store.recordUsage(tenant.id, 'event');

    // Fire integration events
    if (intervention && severity === 'high') {
      fireIntegrationEvent('frustration_high', tenant.id, {
        sessionId: event.sessionId,
        url: event.currentUrl,
        message: intervention.message,
        severity,
        action: intervention.action,
        confidence: intervention.confidence,
      });
    }

    return reply.code(200).send({ intervention });
  });
}
