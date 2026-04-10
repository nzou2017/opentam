// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hash, verify } from '@node-rs/argon2';
import { randomUUID, randomBytes } from 'node:crypto';
import { SignJWT, type JWTPayload } from 'jose';
import { getStore } from '../db/index.js';
import { createJwt, hashToken, verifyJwt, type AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { isPasswordValid } from '@opentam/shared';

const passwordSchema = z.string().refine(isPasswordValid, {
  message: 'Password must be at least 12 characters with uppercase, lowercase, number, and special character',
});

const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

const RegisterBody = z.object({
  email: z.string().email(),
  password: passwordSchema,
  name: z.string().min(1),
  tenantName: z.string().min(1).optional(),
  inviteToken: z.string().optional(),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const InviteBody = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['admin', 'viewer']).default('viewer'),
});

function generateKey(prefix: string): string {
  return `${prefix}_${randomBytes(24).toString('hex')}`;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Register — creates tenant + owner, or joins via invite
  app.post('/api/v1/auth/register', async (request, reply) => {
    const store = getStore();
    const parsed = RegisterBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.format() });
    }

    const { email, password, name, tenantName } = parsed.data;

    // Check if email already exists
    const existing = await store.getUserByEmail(email);
    if (existing) {
      return reply.code(409).send({ error: 'Email already registered' });
    }

    const passwordHash = await hash(password);
    const userId = randomUUID();
    const now = new Date().toISOString();

    // Create new tenant + owner
    const tenantId = `tenant-${randomUUID().slice(0, 8)}`;
    await store.createTenant({
      id: tenantId,
      name: tenantName ?? `${name}'s Workspace`,
      sdkKey: generateKey('sdk'),
      secretKey: generateKey('sk'),
      plan: 'hobbyist',
    });

    await store.createUser({
      id: userId,
      tenantId,
      email,
      passwordHash,
      name,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    });

    // Create session
    const jwt = await createJwt({ userId, tenantId, email, role: 'owner' });
    const sessionId = randomUUID();
    await store.createSession({
      id: sessionId,
      userId,
      tokenHash: hashToken(jwt),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now,
    });

    // Audit: register creates user before auth context exists, so log directly
    await store.createAuditLog({
      id: randomUUID(),
      tenantId,
      userId,
      userEmail: email,
      action: 'user.register',
      resource: 'user',
      resourceId: userId,
      details: { email },
      ipAddress: request.ip,
      createdAt: new Date().toISOString(),
    });

    return reply.code(201).send({
      token: jwt,
      user: { id: userId, tenantId, email, name, role: 'owner' },
    });
  });

  // Login
  app.post('/api/v1/auth/login', async (request, reply) => {
    const store = getStore();
    const parsed = LoginBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body' });
    }

    const { email, password } = parsed.data;
    const user = await store.getUserByEmail(email);
    if (!user) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    // OAuth-only users cannot login with password
    if (user.passwordHash === 'OAUTH_NO_PASSWORD') {
      return reply.code(401).send({ error: 'This account uses SSO. Please sign in with Google.' });
    }

    const valid = await verify(user.passwordHash, password);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    // Check if 2FA is enabled
    if (user.totpEnabled) {
      // Create a short-lived temp JWT (5 min) for 2FA validation
      const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? 'q-dev-secret-change-me-in-production');
      const tempToken = await new SignJWT({
        userId: user.id,
        tenantId: user.tenantId,
        email: user.email,
        role: user.role,
        purpose: '2fa',
      } as unknown as JWTPayload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setIssuer('q-backend')
        .setExpirationTime('5m')
        .sign(JWT_SECRET);

      return reply.code(200).send({
        requires2FA: true,
        tempToken,
      });
    }

    const jwt = await createJwt({
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    });

    const sessionId = randomUUID();
    const now = new Date().toISOString();
    await store.createSession({
      id: sessionId,
      userId: user.id,
      tokenHash: hashToken(jwt),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now,
    });

    // Audit: login happens before auth context is set, log directly
    await store.createAuditLog({
      id: randomUUID(),
      tenantId: user.tenantId,
      userId: user.id,
      userEmail: user.email,
      action: 'user.login',
      resource: 'user',
      resourceId: user.id,
      details: { email: user.email },
      ipAddress: request.ip,
      createdAt: new Date().toISOString(),
    });

    return reply.code(200).send({
      token: jwt,
      user: { id: user.id, tenantId: user.tenantId, email: user.email, name: user.name, role: user.role },
      mustChangePassword: user.mustChangePassword ?? false,
    });
  });

  // Logout
  app.post('/api/v1/auth/logout', async (request, reply) => {
    const store = getStore();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(200).send({ ok: true });
    }
    const token = authHeader.slice(7).trim();
    const tokenHash = hashToken(token);
    const session = await store.getSessionByTokenHash(tokenHash);
    if (session) {
      await store.deleteSession(session.id);
    }
    await logAudit(request, 'user.logout', 'user');
    return reply.code(200).send({ ok: true });
  });

  // Get current user
  app.get('/api/v1/auth/me', async (request, reply) => {
    const req = request as AuthenticatedRequest;
    if (!req.user) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }
    const store = getStore();
    const user = await store.getUserById(req.user.userId);
    if (!user) {
      return reply.code(401).send({ error: 'User not found' });
    }
    const tenant = await store.getTenantById(user.tenantId);
    return reply.code(200).send({
      user: { id: user.id, tenantId: user.tenantId, email: user.email, name: user.name, role: user.role, avatar: user.avatar ?? null },
      tenant: tenant ? { id: tenant.id, name: tenant.name, plan: tenant.plan } : null,
    });
  });

  // Invite user (owner/admin only)
  app.post('/api/v1/auth/invite', async (request, reply) => {
    const req = request as AuthenticatedRequest;

    // Allow JWT auth (owner/admin) or secret key auth
    const tenantId = req.user?.tenantId ?? req.tenant?.id;
    if (!tenantId) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    if (req.user && req.user.role === 'viewer') {
      return reply.code(403).send({ error: 'Admin or owner role required' });
    }

    const store = getStore();
    const parsed = InviteBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.format() });
    }

    const { email, name, role } = parsed.data;

    // Check email not taken
    const existing = await store.getUserByEmail(email);
    if (existing) {
      return reply.code(409).send({ error: 'Email already registered' });
    }

    // Create user with a temporary password (user should change it)
    const tempPassword = randomBytes(16).toString('hex');
    const passwordHash = await hash(tempPassword);
    const userId = randomUUID();
    const now = new Date().toISOString();

    await store.createUser({
      id: userId,
      tenantId,
      email,
      passwordHash,
      name,
      role,
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
    });

    await logAudit(request, 'user.invite', 'user', userId, { email, role });

    return reply.code(201).send({
      user: { id: userId, email, name, role },
      tempPassword, // In production, send via email instead
    });
  });

  // Change password (requires current password)
  app.post('/api/v1/auth/change-password', async (request, reply) => {
    const req = request as AuthenticatedRequest;
    if (!req.user) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const store = getStore();
    const parsed = ChangePasswordBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.format() });
    }

    const { currentPassword, newPassword } = parsed.data;
    const user = await store.getUserById(req.user.userId);
    if (!user) {
      return reply.code(401).send({ error: 'User not found' });
    }

    // OAuth-only users cannot change password this way
    if (user.passwordHash === 'OAUTH_NO_PASSWORD') {
      return reply.code(400).send({ error: 'This account uses SSO and has no password to change.' });
    }

    const valid = await verify(user.passwordHash, currentPassword);
    if (!valid) {
      return reply.code(401).send({ error: 'Current password is incorrect' });
    }

    const passwordHash = await hash(newPassword);
    await store.updateUser(user.id, {
      passwordHash,
      mustChangePassword: false,
    });

    await logAudit(request, 'user.change_password', 'user', user.id);

    return reply.code(200).send({ ok: true, message: 'Password changed successfully.' });
  });

  // Update profile (name, email, avatar)
  const UpdateProfileBody = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    avatar: z.string().max(32).optional().nullable(),
  });

  app.put('/api/v1/auth/profile', async (request, reply) => {
    const req = request as AuthenticatedRequest;
    if (!req.user) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const store = getStore();
    const parsed = UpdateProfileBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.format() });
    }

    const patch: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.email !== undefined) {
      // Check email not taken by someone else
      const existing = await store.getUserByEmail(parsed.data.email);
      if (existing && existing.id !== req.user.userId) {
        return reply.code(409).send({ error: 'Email already in use' });
      }
      patch.email = parsed.data.email;
    }
    if (parsed.data.avatar !== undefined) patch.avatar = parsed.data.avatar;

    const updated = await store.updateUser(req.user.userId, patch);
    if (!updated) {
      return reply.code(404).send({ error: 'User not found' });
    }

    await logAudit(request, 'user.profile_update', 'user', updated.id, { name: updated.name, email: updated.email });

    return reply.code(200).send({
      user: { id: updated.id, tenantId: updated.tenantId, email: updated.email, name: updated.name, role: updated.role, avatar: updated.avatar ?? null },
    });
  });
}
