// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SurveyDefinition, SurveyResponse, SurveyQuestion } from '@opentam/shared';
import { getStore } from '../db/index.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { requirePlan } from '../middleware/planGate.js';

const SurveyQuestionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['rating', 'single_choice', 'multi_choice', 'text']),
  text: z.string().min(1),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  ratingStyle: z.enum(['stars', 'emoji']).optional(),
});

const CreateSurveyBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  questions: z.array(SurveyQuestionSchema).min(1),
  triggerOn: z.string().optional(),
  active: z.boolean().optional(),
});

const UpdateSurveyBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  questions: z.array(SurveyQuestionSchema).optional(),
  triggerOn: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

const SubmitResponseBody = z.object({
  sessionId: z.string().min(1),
  answers: z.record(z.union([z.string(), z.number(), z.array(z.string())])),
});

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function surveyRoutes(app: FastifyInstance): Promise<void> {
  // All survey routes require enterprise plan + license
  app.addHook('preHandler', requirePlan('surveys'));

  // List surveys for tenant (JWT admin+)
  app.get('/api/v1/surveys', async (request: AuthenticatedRequest, reply) => {
    if (!request.tenant) return reply.code(401).send({ error: 'Unauthorized' });
    if (!request.user && request.authMethod !== 'secret') {
      return reply.code(403).send({ error: 'Admin access required' });
    }

    const store = getStore();
    const surveys = await store.getSurveysByTenantId(request.tenant.id);

    // Attach response counts
    const surveysWithCounts = await Promise.all(
      surveys.map(async (s) => {
        const responses = await store.getSurveyResponses(s.id, request.tenant!.id);
        return { ...s, responseCount: responses.length };
      }),
    );

    return reply.send({ surveys: surveysWithCounts });
  });

  // Create survey (JWT admin+)
  app.post('/api/v1/surveys', async (request: AuthenticatedRequest, reply) => {
    if (!request.tenant) return reply.code(401).send({ error: 'Unauthorized' });
    if (!request.user && request.authMethod !== 'secret') {
      return reply.code(403).send({ error: 'Admin access required' });
    }

    const parsed = CreateSurveyBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const now = new Date().toISOString();
    const survey: SurveyDefinition = {
      id: generateId('srv'),
      tenantId: request.tenant.id,
      name: parsed.data.name,
      description: parsed.data.description,
      questions: parsed.data.questions as SurveyQuestion[],
      triggerOn: parsed.data.triggerOn,
      active: parsed.data.active ?? false,
      createdAt: now,
      updatedAt: now,
    };

    const store = getStore();
    await store.createSurvey(survey);
    return reply.code(201).send({ survey });
  });

  // Get single survey (JWT or SDK — SDK needs it to render)
  app.get('/api/v1/surveys/:id', async (request: AuthenticatedRequest, reply) => {
    if (!request.tenant) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const store = getStore();
    const survey = await store.getSurveyById(id, request.tenant.id);
    if (!survey) return reply.code(404).send({ error: 'Survey not found' });

    return reply.send({ survey });
  });

  // Update survey (JWT admin+)
  app.put('/api/v1/surveys/:id', async (request: AuthenticatedRequest, reply) => {
    if (!request.tenant) return reply.code(401).send({ error: 'Unauthorized' });
    if (!request.user && request.authMethod !== 'secret') {
      return reply.code(403).send({ error: 'Admin access required' });
    }

    const { id } = request.params as { id: string };
    const parsed = UpdateSurveyBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const store = getStore();
    const patch: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.description !== undefined) patch.description = parsed.data.description;
    if (parsed.data.questions !== undefined) patch.questions = parsed.data.questions;
    if (parsed.data.triggerOn !== undefined) patch.triggerOn = parsed.data.triggerOn;
    if (parsed.data.active !== undefined) patch.active = parsed.data.active;

    const updated = await store.updateSurvey(id, request.tenant.id, patch as any);
    if (!updated) return reply.code(404).send({ error: 'Survey not found' });

    return reply.send({ survey: updated });
  });

  // Delete survey (JWT admin+)
  app.delete('/api/v1/surveys/:id', async (request: AuthenticatedRequest, reply) => {
    if (!request.tenant) return reply.code(401).send({ error: 'Unauthorized' });
    if (!request.user && request.authMethod !== 'secret') {
      return reply.code(403).send({ error: 'Admin access required' });
    }

    const { id } = request.params as { id: string };
    const store = getStore();
    const deleted = await store.deleteSurvey(id, request.tenant.id);
    if (!deleted) return reply.code(404).send({ error: 'Survey not found' });

    return reply.send({ ok: true });
  });

  // Submit survey response (SDK key auth — from end users)
  app.post('/api/v1/surveys/:id/responses', async (request: AuthenticatedRequest, reply) => {
    if (!request.tenant) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const parsed = SubmitResponseBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const store = getStore();
    // Verify survey exists
    const survey = await store.getSurveyById(id, request.tenant.id);
    if (!survey) return reply.code(404).send({ error: 'Survey not found' });

    const response: SurveyResponse = {
      id: generateId('sres'),
      surveyId: id,
      tenantId: request.tenant.id,
      sessionId: parsed.data.sessionId,
      answers: parsed.data.answers,
      createdAt: new Date().toISOString(),
    };

    await store.createSurveyResponse(response);
    return reply.code(201).send({ response });
  });

  // Get all responses (JWT admin+)
  app.get('/api/v1/surveys/:id/responses', async (request: AuthenticatedRequest, reply) => {
    if (!request.tenant) return reply.code(401).send({ error: 'Unauthorized' });
    if (!request.user && request.authMethod !== 'secret') {
      return reply.code(403).send({ error: 'Admin access required' });
    }

    const { id } = request.params as { id: string };
    const store = getStore();
    const responses = await store.getSurveyResponses(id, request.tenant.id);
    return reply.send({ responses });
  });

  // Get aggregated statistics (JWT admin+)
  app.get('/api/v1/surveys/:id/stats', async (request: AuthenticatedRequest, reply) => {
    if (!request.tenant) return reply.code(401).send({ error: 'Unauthorized' });
    if (!request.user && request.authMethod !== 'secret') {
      return reply.code(403).send({ error: 'Admin access required' });
    }

    const { id } = request.params as { id: string };
    const store = getStore();
    const stats = await store.getSurveyResponseStats(id, request.tenant.id);
    return reply.send(stats);
  });

  // Trigger survey for active sessions (JWT admin+)
  app.post('/api/v1/surveys/:id/trigger', async (request: AuthenticatedRequest, reply) => {
    if (!request.tenant) return reply.code(401).send({ error: 'Unauthorized' });
    if (!request.user && request.authMethod !== 'secret') {
      return reply.code(403).send({ error: 'Admin access required' });
    }

    const { id } = request.params as { id: string };
    const store = getStore();
    const survey = await store.getSurveyById(id, request.tenant.id);
    if (!survey) return reply.code(404).send({ error: 'Survey not found' });

    // Mark the survey as active
    await store.updateSurvey(id, request.tenant.id, { active: true });

    return reply.send({ ok: true, message: 'Survey marked as active and will be shown to sessions' });
  });
}
