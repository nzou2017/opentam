// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { createHash } from 'node:crypto';
import { getStore } from '../db/index.js';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? 'q-dev-secret-change-me-in-production');
const JWT_ISSUER = 'q-backend';
const JWT_EXPIRY = '7d';

export interface JwtUser {
  userId: string;
  tenantId: string;
  email: string;
  role: 'owner' | 'admin' | 'viewer';
}

export interface AuthenticatedRequest extends FastifyRequest {
  tenant?: { id: string; name: string; plan: string };
  user?: JwtUser;
  authMethod?: 'sdk' | 'secret' | 'jwt';
}

// Routes that skip auth entirely
const PUBLIC_PREFIXES = [
  '/health',
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/logout',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/sso/',
  '/api/v1/auth/2fa/validate',
  '/api/v1/setup',
  '/demo',
  '/sdk/',
];

function isPublicRoute(url: string): boolean {
  return PUBLIC_PREFIXES.some(p => url.startsWith(p));
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createJwt(payload: JwtUser): Promise<string> {
  return new SignJWT({ ...payload } as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setExpirationTime(JWT_EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifyJwt(token: string): Promise<JwtUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { issuer: JWT_ISSUER });
    return {
      userId: payload.userId as string,
      tenantId: payload.tenantId as string,
      email: payload.email as string,
      role: payload.role as JwtUser['role'],
    };
  } catch {
    return null;
  }
}

export function registerAuthHook(app: FastifyInstance): void {
  app.addHook('onRequest', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    if (isPublicRoute(request.url)) return;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      // Allow requests without auth to pass through — individual routes can enforce
      return;
    }

    const token = authHeader.slice(7).trim();
    const store = getStore();

    // SDK key auth
    if (token.startsWith('sdk_')) {
      const tenant = await store.getTenantBySdkKey(token);
      if (tenant) {
        request.tenant = { id: tenant.id, name: tenant.name, plan: tenant.plan };
        request.authMethod = 'sdk';
      }
      return;
    }

    // Secret key auth
    if (token.startsWith('sk_')) {
      const tenant = await store.getTenantBySecretKey(token);
      if (tenant) {
        request.tenant = { id: tenant.id, name: tenant.name, plan: tenant.plan };
        request.authMethod = 'secret';
      }
      return;
    }

    // JWT auth
    if (token.startsWith('eyJ')) {
      const user = await verifyJwt(token);
      if (user) {
        // Verify session still exists
        const tokenHash = hashToken(token);
        const session = await store.getSessionByTokenHash(tokenHash);
        if (session && new Date(session.expiresAt) > new Date()) {
          request.user = user;
          request.tenant = { id: user.tenantId, name: '', plan: '' };
          request.authMethod = 'jwt';
          // Fill tenant info
          const tenant = await store.getTenantById(user.tenantId);
          if (tenant) {
            request.tenant = { id: tenant.id, name: tenant.name, plan: tenant.plan };
          }
        }
      }
      return;
    }

    // Legacy: try both key types
    const tenant = (await store.getTenantBySdkKey(token)) ?? (await store.getTenantBySecretKey(token));
    if (tenant) {
      request.tenant = { id: tenant.id, name: tenant.name, plan: tenant.plan };
      request.authMethod = token.startsWith('sdk') ? 'sdk' : 'secret';
    }
  });
}
