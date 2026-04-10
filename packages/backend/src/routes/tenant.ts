// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { getStore } from '../db/index.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { logAudit } from '../middleware/audit.js';
import { requirePlan } from '../middleware/planGate.js';
import { getLicense, getLicenseError, validateLicenseKey } from '../license.js';

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

function generateKey(prefix: string): string {
  return `${prefix}_${randomBytes(24).toString('hex')}`;
}

export async function tenantRoutes(app: FastifyInstance): Promise<void> {
  // Get tenant info
  app.get('/api/v1/tenant', { preHandler: [requireRole('viewer')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const store = getStore();
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const tenant = await store.getTenantById(tenantId);
    if (!tenant) return reply.code(404).send({ error: 'Tenant not found' });

    const limits = await store.getUsageLimits(tenantId);

    return reply.send({
      id: tenant.id,
      name: tenant.name,
      plan: tenant.plan,
      sdkKey: maskKey(tenant.sdkKey),
      secretKey: maskKey(tenant.secretKey),
      limits,
    });
  });

  // Update tenant name
  app.put('/api/v1/tenant', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const store = getStore();
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const body = z.object({ name: z.string().min(1) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid name' });

    const updated = await store.updateTenant(tenantId, { name: body.data.name });
    return reply.send({ tenant: updated });
  });

  // View keys (masked for non-owners)
  app.get('/api/v1/tenant/keys', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const store = getStore();
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const tenant = await store.getTenantById(tenantId);
    if (!tenant) return reply.code(404).send({ error: 'Tenant not found' });

    const isOwner = req.user?.role === 'owner' || req.authMethod === 'secret';
    return reply.send({
      sdkKey: isOwner ? tenant.sdkKey : maskKey(tenant.sdkKey),
      secretKey: isOwner ? tenant.secretKey : maskKey(tenant.secretKey),
    });
  });

  // Regenerate keys
  app.post('/api/v1/tenant/keys/regenerate', { preHandler: [requireRole('owner')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const store = getStore();
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const body = z.object({ keyType: z.enum(['sdk', 'secret']) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Specify keyType: sdk or secret' });

    const newKey = generateKey(body.data.keyType === 'sdk' ? 'sdk' : 'sk');
    const patch = body.data.keyType === 'sdk' ? { sdkKey: newKey } : { secretKey: newKey };
    await store.updateTenant(tenantId, patch);

    await logAudit(request, 'tenant.key_regenerate', 'tenant', tenantId, { keyType: body.data.keyType });

    return reply.send({ keyType: body.data.keyType, key: newKey });
  });

  // ── License info endpoint ──────────────────────────────────────────────────
  app.get('/api/v1/tenant/license', { preHandler: [requireRole('viewer')] }, async (request, reply) => {
    const license = getLicense();
    const error = getLicenseError();
    if (license) {
      return reply.send({
        licensed: true,
        plan: license.plan,
        features: license.features,
        expiresAt: license.expiresAt,
        error: null,
      });
    }
    return reply.send({
      licensed: false,
      plan: 'community',
      features: [],
      expiresAt: null,
      error,
    });
  });

  // Activate / update license key
  app.put('/api/v1/tenant/license', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const body = z.object({ licenseKey: z.string().min(1) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'licenseKey is required' });

    try {
      const license = await validateLicenseKey(body.data.licenseKey);
      return reply.send({
        licensed: true,
        plan: license.plan,
        features: license.features,
        expiresAt: license.expiresAt,
        error: null,
      });
    } catch (err) {
      return reply.code(400).send({
        licensed: false,
        error: err instanceof Error ? err.message : 'Invalid license key',
      });
    }
  });

  // List users
  app.get('/api/v1/tenant/users', { preHandler: [requireRole('admin'), requirePlan('team')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const store = getStore();
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Authentication required' });

    const users = await store.getUsersByTenantId(tenantId);
    return reply.send({
      users: users.map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role, avatar: u.avatar ?? null, createdAt: u.createdAt })),
    });
  });

  // Change user role
  app.put('/api/v1/tenant/users/:id', { preHandler: [requireRole('owner'), requirePlan('team')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const store = getStore();
    const { id } = request.params as { id: string };

    const body = z.object({ role: z.enum(['owner', 'admin', 'viewer']) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid role' });

    const user = await store.getUserById(id);
    if (!user || user.tenantId !== (req.tenant?.id ?? req.user?.tenantId)) {
      return reply.code(404).send({ error: 'User not found' });
    }

    const updated = await store.updateUser(id, { role: body.data.role });
    await logAudit(request, 'user.role_update', 'user', id, { newRole: body.data.role });
    return reply.send({ user: updated ? { id: updated.id, email: updated.email, name: updated.name, role: updated.role } : null });
  });

  // Remove user
  app.delete('/api/v1/tenant/users/:id', { preHandler: [requireRole('owner'), requirePlan('team')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const store = getStore();
    const { id } = request.params as { id: string };

    const user = await store.getUserById(id);
    if (!user || user.tenantId !== (req.tenant?.id ?? req.user?.tenantId)) {
      return reply.code(404).send({ error: 'User not found' });
    }

    if (user.role === 'owner') {
      return reply.code(400).send({ error: 'Cannot remove the owner' });
    }

    await store.deleteUser(id);
    await logAudit(request, 'user.delete', 'user', id, { email: user.email });
    return reply.code(204).send();
  });

  // Reset user password (admin/owner only)
  app.post('/api/v1/tenant/users/:id/reset-password', { preHandler: [requireRole('admin'), requirePlan('team')] }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const store = getStore();
    const { id } = request.params as { id: string };

    const user = await store.getUserById(id);
    if (!user || user.tenantId !== (req.tenant?.id ?? req.user?.tenantId)) {
      return reply.code(404).send({ error: 'User not found' });
    }

    // Only owner can reset another owner's password
    if (user.role === 'owner' && req.user?.role !== 'owner') {
      return reply.code(403).send({ error: 'Only the owner can reset another owner\'s password' });
    }

    const tempPassword = randomBytes(16).toString('hex');
    const passwordHash = await hash(tempPassword);
    await store.updateUser(id, { passwordHash, mustChangePassword: true });

    await logAudit(request, 'user.password_reset', 'user', id, { email: user.email });

    return reply.send({ tempPassword });
  });
}
