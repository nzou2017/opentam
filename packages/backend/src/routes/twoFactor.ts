// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verify } from '@node-rs/argon2';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { jwtVerify, type JWTPayload } from 'jose';
import * as OTPAuth from 'otpauth';
import { getStore } from '../db/index.js';
import { createJwt, hashToken, type AuthenticatedRequest } from '../middleware/auth.js';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? 'q-dev-secret-change-me-in-production');

const VerifyBody = z.object({
  code: z.string().min(6).max(6),
});

const DisableBody = z.object({
  password: z.string().min(1),
});

const ValidateBody = z.object({
  tempToken: z.string().min(1),
  code: z.string().min(1),
});

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 8; i++) {
    codes.push(randomBytes(4).toString('hex')); // 8-char alphanumeric
  }
  return codes;
}

export async function twoFactorRoutes(app: FastifyInstance): Promise<void> {
  // Setup 2FA — generate TOTP secret
  app.post('/api/v1/auth/2fa/setup', async (request, reply) => {
    const req = request as AuthenticatedRequest;
    if (!req.user) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const store = getStore();
    const user = await store.getUserById(req.user.userId);
    if (!user) {
      return reply.code(401).send({ error: 'User not found' });
    }

    if (user.totpEnabled) {
      return reply.code(400).send({ error: '2FA is already enabled' });
    }

    // Generate TOTP secret
    const totp = new OTPAuth.TOTP({
      issuer: 'Q',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });

    const secret = totp.secret.base32;

    // Store the secret (not yet enabled)
    await store.updateUser(user.id, { totpSecret: secret });

    return reply.code(200).send({
      secret,
      otpauthUrl: totp.toString(),
    });
  });

  // Verify 2FA setup — confirm the code and enable
  app.post('/api/v1/auth/2fa/verify', async (request, reply) => {
    const req = request as AuthenticatedRequest;
    if (!req.user) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const store = getStore();
    const parsed = VerifyBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body' });
    }

    const user = await store.getUserById(req.user.userId);
    if (!user || !user.totpSecret) {
      return reply.code(400).send({ error: 'No 2FA setup in progress. Call /2fa/setup first.' });
    }

    if (user.totpEnabled) {
      return reply.code(400).send({ error: '2FA is already enabled' });
    }

    // Verify the code
    const totp = new OTPAuth.TOTP({
      issuer: 'Q',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.totpSecret),
    });

    const delta = totp.validate({ token: parsed.data.code, window: 1 });
    if (delta === null) {
      return reply.code(400).send({ error: 'Invalid verification code' });
    }

    // Generate backup codes
    const backupCodes = generateBackupCodes();
    const hashedCodes = backupCodes.map(c => sha256(c));

    // Enable 2FA
    await store.updateUser(user.id, {
      totpEnabled: true,
      backupCodes: JSON.stringify(hashedCodes),
    });

    return reply.code(200).send({
      ok: true,
      backupCodes, // Return plaintext codes once — user must save them
    });
  });

  // Disable 2FA
  app.post('/api/v1/auth/2fa/disable', async (request, reply) => {
    const req = request as AuthenticatedRequest;
    if (!req.user) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const store = getStore();
    const parsed = DisableBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body' });
    }

    const user = await store.getUserById(req.user.userId);
    if (!user) {
      return reply.code(401).send({ error: 'User not found' });
    }

    if (!user.totpEnabled) {
      return reply.code(400).send({ error: '2FA is not enabled' });
    }

    // Verify password
    if (user.passwordHash === 'OAUTH_NO_PASSWORD') {
      return reply.code(400).send({ error: 'Cannot disable 2FA for OAuth-only accounts this way' });
    }

    const valid = await verify(user.passwordHash, parsed.data.password);
    if (!valid) {
      return reply.code(401).send({ error: 'Incorrect password' });
    }

    await store.updateUser(user.id, {
      totpEnabled: false,
      totpSecret: null,
      backupCodes: null,
    });

    return reply.code(200).send({ ok: true, message: '2FA has been disabled.' });
  });

  // Validate 2FA during login (public — uses tempToken)
  app.post('/api/v1/auth/2fa/validate', async (request, reply) => {
    const store = getStore();
    const parsed = ValidateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body' });
    }

    const { tempToken, code } = parsed.data;

    // Verify the temp token
    let payload;
    try {
      const result = await jwtVerify(tempToken, JWT_SECRET, { issuer: 'q-backend' });
      payload = result.payload;
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired temp token' });
    }

    if (payload.purpose !== '2fa') {
      return reply.code(401).send({ error: 'Invalid token purpose' });
    }

    const userId = payload.userId as string;
    const user = await store.getUserById(userId);
    if (!user || !user.totpEnabled || !user.totpSecret) {
      return reply.code(400).send({ error: 'User does not have 2FA enabled' });
    }

    // Try TOTP code first
    const totp = new OTPAuth.TOTP({
      issuer: 'Q',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.totpSecret),
    });

    const delta = totp.validate({ token: code, window: 1 });
    let isBackupCode = false;

    if (delta === null) {
      // Try backup code
      if (!user.backupCodes) {
        return reply.code(401).send({ error: 'Invalid 2FA code' });
      }

      const storedHashes: string[] = JSON.parse(user.backupCodes);
      const codeHash = sha256(code);
      const idx = storedHashes.indexOf(codeHash);

      if (idx === -1) {
        return reply.code(401).send({ error: 'Invalid 2FA code' });
      }

      // Remove used backup code
      storedHashes.splice(idx, 1);
      await store.updateUser(user.id, {
        backupCodes: JSON.stringify(storedHashes),
      });
      isBackupCode = true;
    }

    // Create full JWT session
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
      mustChangePassword: user.mustChangePassword ?? false,
      usedBackupCode: isBackupCode,
    });
  });
}
