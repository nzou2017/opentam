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
import { config } from '../config.js';
import { verifyTenantLicenseKey } from '../license.js';
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

const InviteLinkBody = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'viewer']).default('viewer'),
});

const INVITE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function generateKey(prefix: string): string {
  return `${prefix}_${randomBytes(24).toString('hex')}`;
}

/**
 * Raised when SaaS-mode tenant provisioning against the license server fails.
 * The register route turns this into a 502 and aborts signup, so a tenant is
 * never created without a valid, recorded license.
 */
class LicenseProvisioningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LicenseProvisioningError';
  }
}

interface TenantLicense {
  licenseKey: string;
  licenseExpiresAt: string;
  licenseRefreshToken?: string;
}

/**
 * Register a newly-created tenant with the license server and return its
 * issued license key, expiry, and renewal token.
 *
 * Returns `null` when SaaS provisioning is disabled (self-hosted / community /
 * tests) so signup proceeds with no license. When it is enabled, any failure —
 * unreachable server, non-2xx response, or an unverifiable key — throws a
 * {@link LicenseProvisioningError}; the caller aborts signup rather than
 * creating an unlicensed, unrecorded tenant.
 *
 * Verification uses `verifyTenantLicenseKey` — never the deployment-wide cache
 * — so one tenant's key can never leak plan access to other tenants.
 */
async function registerTenantWithLicenseServer(params: {
  tenantId: string;
  tenantName: string;
  ownerName: string;
  ownerEmail: string;
  plan: string;
}): Promise<TenantLicense | null> {
  if (!config.registerTenantsWithLicenseServer) return null;

  let res: Response;
  try {
    res = await fetch(`${config.licenseServerUrl}/api/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': config.licenseServerApiKey,
      },
      body: JSON.stringify({
        name: params.ownerName,
        email: params.ownerEmail,
        company: params.tenantName,
        plan: params.plan,
        externalId: params.tenantId,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    console.warn(`[license] Tenant ${params.tenantId} registration error: ${err instanceof Error ? err.message : String(err)}`);
    throw new LicenseProvisioningError(
      timedOut
        ? 'The license server timed out. Please try again in a moment.'
        : 'Could not reach the license server. Please try again in a moment.',
    );
  }

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const errMsg = (errBody.error ?? errBody.message ?? `HTTP ${res.status}`) as string;
    console.warn(`[license] Tenant ${params.tenantId} registration failed: ${errMsg}`);
    throw new LicenseProvisioningError(`Could not create your workspace: ${errMsg}`);
  }

  const regData = (await res.json().catch(() => ({}))) as {
    licenseKey?: string;
    refreshToken?: string;
    expiresAt?: string;
  };
  if (!regData.licenseKey) {
    console.warn(`[license] Tenant ${params.tenantId} registration returned no license key`);
    throw new LicenseProvisioningError('The license server returned an incomplete response. Please try again.');
  }

  // Verify the key the server issued is authentic before recording it.
  let payload;
  try {
    payload = await verifyTenantLicenseKey(regData.licenseKey);
  } catch (err) {
    console.warn(`[license] Tenant ${params.tenantId} received an invalid license key: ${err instanceof Error ? err.message : String(err)}`);
    throw new LicenseProvisioningError('The license server returned an invalid license key. Please try again.');
  }

  return {
    licenseKey: regData.licenseKey,
    licenseExpiresAt: payload.expiresAt || regData.expiresAt || '',
    licenseRefreshToken: regData.refreshToken,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Public — lets the signup form warn "a workspace with this name already
  // exists, do you want an invite link instead?" before creating a
  // duplicate, disconnected tenant. Only ever returns a boolean — never
  // leaks which tenant, its id, members, etc.
  app.get('/api/v1/auth/check-tenant-name', async (request, reply) => {
    const { name } = request.query as { name?: string };
    if (!name || !name.trim()) {
      return reply.send({ exists: false });
    }
    const store = getStore();
    const tenant = await store.getTenantByName(name.trim());
    return reply.send({ exists: !!tenant });
  });

  // Register — creates tenant + owner, or joins via invite
  app.post('/api/v1/auth/register', async (request, reply) => {
    const store = getStore();
    const parsed = RegisterBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.format() });
    }

    const { email, password, name, tenantName, inviteToken } = parsed.data;

    // Check if email already exists
    const existing = await store.getUserByEmail(email);
    if (existing) {
      return reply.code(409).send({ error: 'Email already registered' });
    }

    // Resolve invite (join an existing tenant) before creating anything
    let invite: Awaited<ReturnType<typeof store.getTeamInviteByTokenHash>> | undefined;
    if (inviteToken) {
      invite = await store.getTeamInviteByTokenHash(hashToken(inviteToken));
      if (!invite || invite.acceptedAt || new Date(invite.expiresAt) < new Date()) {
        return reply.code(400).send({ error: 'This invite link is invalid or has expired.' });
      }
      if (invite.email.toLowerCase() !== email.toLowerCase()) {
        return reply.code(400).send({ error: 'This invite was issued for a different email address.' });
      }
    }

    const passwordHash = await hash(password);
    const userId = randomUUID();
    const now = new Date().toISOString();
    const role: 'owner' | 'admin' | 'viewer' = invite ? invite.role : 'owner';

    let tenantId: string;
    if (invite) {
      tenantId = invite.tenantId;
    } else {
      // Create new tenant + owner
      tenantId = `tenant-${randomUUID().slice(0, 8)}`;
      const resolvedTenantName = tenantName ?? `${name}'s Workspace`;

      // Register the new tenant with the license server (SaaS mode only) so it
      // is recorded there and issued its own license key. If provisioning is
      // enabled and fails, abort signup — never create an unlicensed tenant.
      let license: TenantLicense | null;
      try {
        license = await registerTenantWithLicenseServer({
          tenantId,
          tenantName: resolvedTenantName,
          ownerName: name,
          ownerEmail: email,
          plan: 'hobbyist',
        });
      } catch (err) {
        if (err instanceof LicenseProvisioningError) {
          return reply.code(502).send({ error: err.message });
        }
        throw err;
      }

      await store.createTenant({
        id: tenantId,
        name: resolvedTenantName,
        sdkKey: generateKey('sdk'),
        secretKey: generateKey('sk'),
        plan: 'hobbyist',
        licenseKey: license?.licenseKey,
        licenseExpiresAt: license?.licenseExpiresAt,
        licenseRefreshToken: license?.licenseRefreshToken,
      });
    }

    await store.createUser({
      id: userId,
      tenantId,
      email,
      passwordHash,
      name,
      role,
      createdAt: now,
      updatedAt: now,
    });

    if (invite) {
      await store.markTeamInviteAccepted(invite.id);
    }

    // Create session
    const jwt = await createJwt({ userId, tenantId, email, role });
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
      action: invite ? 'user.join_via_invite' : 'user.register',
      resource: 'user',
      resourceId: userId,
      details: { email },
      ipAddress: request.ip,
      createdAt: new Date().toISOString(),
    });

    return reply.code(201).send({
      token: jwt,
      user: { id: userId, tenantId, email, name, role },
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

  // Generate a shareable invite link — the invitee completes their own
  // signup at /register?invite=<token> and joins this tenant instead of
  // creating a new one. Complements /auth/invite (which creates the
  // account immediately with a temp password).
  app.post('/api/v1/auth/invite-link', async (request, reply) => {
    const req = request as AuthenticatedRequest;

    const tenantId = req.user?.tenantId ?? req.tenant?.id;
    if (!tenantId) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    if (req.user && req.user.role === 'viewer') {
      return reply.code(403).send({ error: 'Admin or owner role required' });
    }

    const store = getStore();
    const parsed = InviteLinkBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.format() });
    }
    const { email, role } = parsed.data;

    const existing = await store.getUserByEmail(email);
    if (existing) {
      return reply.code(409).send({ error: 'Email already registered' });
    }

    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_LINK_TTL_MS).toISOString();

    await store.createTeamInvite({
      id: randomUUID(),
      tenantId,
      email,
      role,
      tokenHash: hashToken(token),
      invitedBy: req.user?.userId ?? 'secret-key',
      expiresAt,
      createdAt: new Date().toISOString(),
    });

    await logAudit(request, 'user.invite_link_create', 'team_invite', tenantId, { email, role });

    return reply.code(201).send({ token, expiresAt });
  });

  // Public — lets the register page preview an invite link before signup
  app.get('/api/v1/auth/invite-preview/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const store = getStore();
    const invite = await store.getTeamInviteByTokenHash(hashToken(token));
    if (!invite || invite.acceptedAt || new Date(invite.expiresAt) < new Date()) {
      return reply.code(404).send({ error: 'This invite link is invalid or has expired.' });
    }
    const tenant = await store.getTenantById(invite.tenantId);
    return reply.send({ email: invite.email, role: invite.role, tenantName: tenant?.name ?? 'this workspace' });
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
