// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getStore } from '../db/index.js';
import { createJwt, hashToken } from '../middleware/auth.js';
import { isFeatureLicensed } from '../license.js';

const GoogleSsoBody = z.object({
  idToken: z.string().min(1),
  tenantId: z.string().optional(),
});

// Google JWKS endpoint for verifying ID tokens
const googleJWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export async function ssoRoutes(app: FastifyInstance): Promise<void> {
  // Get SSO config — public endpoint
  app.get('/api/v1/auth/sso/config', async (_request, reply) => {
    const googleClientId = process.env.GOOGLE_CLIENT_ID ?? '';
    const enabled = Boolean(googleClientId);

    return reply.code(200).send({
      google: {
        enabled,
        clientId: enabled ? googleClientId : undefined,
      },
    });
  });

  // Google SSO login (gated behind enterprise license)
  app.post('/api/v1/auth/sso/google', async (request, reply) => {
    if (!isFeatureLicensed('sso')) {
      return reply.code(403).send({
        error: '"sso" is an Enterprise feature. To unlock it, please purchase an OpenTAM Enterprise license. Contact q.cue.2026@gmail.com for pricing and a license key.',
        feature: 'sso',
        requiredPlan: 'enterprise',
        licensed: false,
        contact: 'q.cue.2026@gmail.com',
      });
    }

    const store = getStore();
    const parsed = GoogleSsoBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body' });
    }

    const { idToken, tenantId: requestedTenantId } = parsed.data;
    const googleClientId = process.env.GOOGLE_CLIENT_ID;

    if (!googleClientId) {
      return reply.code(400).send({ error: 'Google SSO is not configured' });
    }

    // Verify the Google ID token
    let payload;
    try {
      const result = await jwtVerify(idToken, googleJWKS, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: googleClientId,
      });
      payload = result.payload;
    } catch (err) {
      return reply.code(401).send({ error: 'Invalid Google ID token' });
    }

    const email = payload.email as string;
    const name = (payload.name as string) ?? email.split('@')[0];
    const sub = payload.sub as string;

    if (!email) {
      return reply.code(400).send({ error: 'Google account has no email' });
    }

    // Check if user exists
    let user = await store.getUserByEmail(email);

    if (user) {
      // Existing user — update OAuth info if not set
      if (!user.oauthProvider) {
        await store.updateUser(user.id, {
          oauthProvider: 'google',
          oauthProviderId: sub,
        });
      }
    } else {
      // New user — create tenant + user
      const userId = randomUUID();
      const tenantId = requestedTenantId ?? `tenant-${randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();

      // Only create tenant if no tenantId was provided
      if (!requestedTenantId) {
        const { randomBytes } = await import('node:crypto');
        await store.createTenant({
          id: tenantId,
          name: `${name}'s Workspace`,
          sdkKey: `sdk_${randomBytes(24).toString('hex')}`,
          secretKey: `sk_${randomBytes(24).toString('hex')}`,
          plan: 'hobbyist',
        });
      }

      await store.createUser({
        id: userId,
        tenantId,
        email,
        passwordHash: 'OAUTH_NO_PASSWORD',
        name,
        role: 'owner',
        oauthProvider: 'google',
        oauthProviderId: sub,
        createdAt: now,
        updatedAt: now,
      });

      user = await store.getUserByEmail(email);
    }

    if (!user) {
      return reply.code(500).send({ error: 'Failed to create or retrieve user' });
    }

    // Create JWT and session
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

    return reply.code(200).send({
      token: jwt,
      user: { id: user.id, tenantId: user.tenantId, email: user.email, name: user.name, role: user.role },
    });
  });
}
