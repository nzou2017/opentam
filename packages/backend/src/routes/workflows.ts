// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Workflow, WorkflowStep, WorkflowStatus } from '@opentam/shared';
import { getStore } from '../db/index.js';
import { logAudit } from '../middleware/audit.js';

const WorkflowStepBody = z.object({
  id: z.string().min(1),
  urlPattern: z.string().min(1),
  selector: z.string().min(1),
  action: z.enum(['click', 'navigate', 'input', 'wait', 'verify']),
  contextHint: z.string().min(1),
  expectedSelectors: z.array(z.string()).optional(),
  mapEntryId: z.string().optional(),
});

const CreateWorkflowBody = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  source: z.enum(['manual', 'learned', 'imported']).optional(),
  tags: z.array(z.string()).optional(),
  steps: z.array(WorkflowStepBody).min(1),
});

const UpdateWorkflowBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
});

const UpdateStepsBody = z.object({
  steps: z.array(WorkflowStepBody).min(1),
});

async function getSecretKeyTenant(authHeader: string | undefined) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const key = authHeader.slice('Bearer '.length).trim();
  const store = getStore();
  return (await store.getTenantBySecretKey(key)) ?? null;
}

async function getSdkKeyTenant(authHeader: string | undefined) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const key = authHeader.slice('Bearer '.length).trim();
  const store = getStore();
  return (await store.getTenantBySdkKey(key)) ?? null;
}

async function getAdminTenant(authHeader: string | undefined) {
  // Accept either secret key or SDK key for admin routes
  const tenant = await getSecretKeyTenant(authHeader);
  if (tenant) return tenant;
  return getSdkKeyTenant(authHeader);
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function workflowRoutes(app: FastifyInstance): Promise<void> {
  // List workflows
  app.get('/api/v1/workflows', async (request, reply) => {
    const tenant = await getAdminTenant(request.headers.authorization);
    if (!tenant) return reply.code(401).send({ error: 'Unauthorized' });

    const query = request.query as Record<string, string>;
    const status = query.status as WorkflowStatus | undefined;
    const includeReference = query.includeReference === 'true';
    const store = getStore();
    const workflows = await store.getWorkflowsByTenantId(tenant.id, status);

    if (includeReference && tenant.id !== 'tenant-q-admin') {
      const referenceWorkflows = await store.getWorkflowsByTenantId('tenant-q-admin', status);
      return reply.send({ workflows, referenceWorkflows });
    }

    return reply.send({ workflows });
  });

  // Get workflow with steps
  app.get('/api/v1/workflows/:id', async (request, reply) => {
    const tenant = await getAdminTenant(request.headers.authorization);
    if (!tenant) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const store = getStore();
    const workflow = await store.getWorkflowById(id, tenant.id);
    if (!workflow) return reply.code(404).send({ error: 'Workflow not found' });

    const steps = await store.getWorkflowSteps(workflow.id);
    return reply.send({ workflow, steps });
  });

  // Create workflow + steps
  app.post('/api/v1/workflows', async (request, reply) => {
    const tenant = await getAdminTenant(request.headers.authorization);
    if (!tenant) return reply.code(401).send({ error: 'Unauthorized' });

    const parsed = CreateWorkflowBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const { name, description, source, tags, steps: stepInputs } = parsed.data;
    const now = new Date().toISOString();
    const workflowId = generateId('wf');

    const workflow: Workflow = {
      id: workflowId,
      tenantId: tenant.id,
      name,
      description,
      status: 'draft',
      source: source ?? 'manual',
      tags,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const steps: WorkflowStep[] = stepInputs.map((s, i) => ({
      id: s.id,
      workflowId,
      stepIndex: i,
      urlPattern: s.urlPattern,
      selector: s.selector,
      action: s.action,
      contextHint: s.contextHint,
      expectedSelectors: s.expectedSelectors,
      mapEntryId: s.mapEntryId,
    }));

    const store = getStore();
    await store.createWorkflow(workflow, steps);

    await logAudit(request, 'workflow.create', 'workflow', workflowId, { name });

    return reply.code(201).send({ workflow, steps });
  });

  // Update workflow metadata
  app.put('/api/v1/workflows/:id', async (request, reply) => {
    const tenant = await getAdminTenant(request.headers.authorization);
    if (!tenant) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const parsed = UpdateWorkflowBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const store = getStore();
    const updated = await store.updateWorkflow(id, tenant.id, parsed.data);
    if (!updated) return reply.code(404).send({ error: 'Workflow not found' });

    await logAudit(request, 'workflow.update', 'workflow', id);

    return reply.send({ workflow: updated });
  });

  // Replace all steps
  app.put('/api/v1/workflows/:id/steps', async (request, reply) => {
    const tenant = await getAdminTenant(request.headers.authorization);
    if (!tenant) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const store = getStore();
    const workflow = await store.getWorkflowById(id, tenant.id);
    if (!workflow) return reply.code(404).send({ error: 'Workflow not found' });

    const parsed = UpdateStepsBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const steps: WorkflowStep[] = parsed.data.steps.map((s, i) => ({
      id: s.id,
      workflowId: id,
      stepIndex: i,
      urlPattern: s.urlPattern,
      selector: s.selector,
      action: s.action,
      contextHint: s.contextHint,
      expectedSelectors: s.expectedSelectors,
      mapEntryId: s.mapEntryId,
    }));

    await store.upsertWorkflowSteps(id, steps);

    // If published, re-index vectors
    if (workflow.status === 'published') {
      try {
        const { indexWorkflow } = await import('../ingestion/workflowIndexer.js');
        await indexWorkflow(tenant.id, workflow, steps);
      } catch { /* indexing is best-effort */ }
    }

    return reply.send({ steps });
  });

  // Delete workflow + steps
  app.delete('/api/v1/workflows/:id', async (request, reply) => {
    const tenant = await getAdminTenant(request.headers.authorization);
    if (!tenant) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const store = getStore();
    const deleted = await store.deleteWorkflow(id, tenant.id);
    if (!deleted) return reply.code(404).send({ error: 'Workflow not found' });

    await logAudit(request, 'workflow.delete', 'workflow', id);

    // Remove vectors
    try {
      const { deleteWorkflowVectors } = await import('../ingestion/workflowIndexer.js');
      await deleteWorkflowVectors(tenant.id, id);
    } catch { /* best-effort */ }

    return reply.send({ ok: true });
  });

  // Publish workflow
  app.post('/api/v1/workflows/:id/publish', async (request, reply) => {
    const tenant = await getAdminTenant(request.headers.authorization);
    if (!tenant) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const store = getStore();
    const updated = await store.updateWorkflow(id, tenant.id, { status: 'published' });
    if (!updated) return reply.code(404).send({ error: 'Workflow not found' });

    await logAudit(request, 'workflow.publish', 'workflow', id);

    // Index for vector search
    try {
      const steps = await store.getWorkflowSteps(id);
      const { indexWorkflow } = await import('../ingestion/workflowIndexer.js');
      await indexWorkflow(tenant.id, updated, steps);
    } catch { /* indexing is best-effort */ }

    return reply.send({ workflow: updated });
  });

  // Step progress reporting (SDK key auth)
  app.post('/api/v1/workflows/:id/progress', async (request, reply) => {
    const tenant = await getSdkKeyTenant(request.headers.authorization);
    if (!tenant) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const body = request.body as { sessionId: string; stepIndex: number; completed: boolean };
    if (!body.sessionId || body.stepIndex === undefined) {
      return reply.code(400).send({ error: 'Missing sessionId or stepIndex' });
    }

    // Log to intervention_logs for analytics
    const store = getStore();
    await store.addInterventionLog({
      id: generateId('log'),
      eventId: `wf-progress-${id}`,
      tenantId: tenant.id,
      sessionId: body.sessionId,
      url: undefined,
      action: 'tour',
      elementId: undefined,
      message: `Workflow ${id} step ${body.stepIndex} ${body.completed ? 'completed' : 'skipped'}`,
      confidence: 1,
      resolved: body.completed,
      createdAt: new Date().toISOString(),
    });

    return reply.send({ ok: true });
  });
}
