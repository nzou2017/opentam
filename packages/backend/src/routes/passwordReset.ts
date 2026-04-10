// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hash, verify } from '@node-rs/argon2';
import { randomBytes, createHash } from 'node:crypto';
import { getStore } from '../db/index.js';
import { isPasswordValid } from '@opentam/shared';

const ForgotPasswordBody = z.object({
  email: z.string().email(),
});

const ResetPasswordBody = z.object({
  token: z.string().min(1),
  newPassword: z.string().refine(isPasswordValid, {
    message: 'Password must be at least 12 characters with uppercase, lowercase, number, and special character',
  }),
});

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function passwordResetRoutes(app: FastifyInstance): Promise<void> {
  // Forgot password — generate reset token
  app.post('/api/v1/auth/forgot-password', async (request, reply) => {
    const store = getStore();
    const parsed = ForgotPasswordBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body' });
    }

    const { email } = parsed.data;
    const user = await store.getUserByEmail(email);

    // Always return success to prevent email enumeration
    if (!user) {
      return reply.code(200).send({ ok: true, message: 'If this email exists, a reset token has been generated.' });
    }

    // Don't allow password reset for OAuth-only users
    if (user.oauthProvider && user.passwordHash === 'OAUTH_NO_PASSWORD') {
      return reply.code(200).send({ ok: true, message: 'If this email exists, a reset token has been generated.' });
    }

    // Clean up expired tokens first
    await store.deleteExpiredPasswordResetTokens();

    // Generate 32-byte hex token
    const resetToken = randomBytes(32).toString('hex');
    const tokenHash = sha256(resetToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    await store.createPasswordResetToken(user.id, tokenHash, expiresAt);

    // In production, would send email. In dev, return the token.
    const isDev = process.env.NODE_ENV !== 'production';

    return reply.code(200).send({
      ok: true,
      message: 'If this email exists, a reset token has been generated.',
      ...(isDev ? { resetToken } : {}),
    });
  });

  // Reset password — validate token and set new password
  app.post('/api/v1/auth/reset-password', async (request, reply) => {
    const store = getStore();
    const parsed = ResetPasswordBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body' });
    }

    const { token, newPassword } = parsed.data;
    const tokenHash = sha256(token);

    const resetEntry = await store.getPasswordResetToken(tokenHash);
    if (!resetEntry) {
      return reply.code(400).send({ error: 'Invalid or expired reset token' });
    }

    // Check expiry
    if (new Date(resetEntry.expiresAt) < new Date()) {
      await store.deletePasswordResetToken(tokenHash);
      return reply.code(400).send({ error: 'Invalid or expired reset token' });
    }

    // Hash new password and update user
    const passwordHash = await hash(newPassword);
    await store.updateUser(resetEntry.userId, {
      passwordHash,
      mustChangePassword: false,
    });

    // Delete the used token
    await store.deletePasswordResetToken(tokenHash);

    // Invalidate all sessions for this user
    await store.deleteSessionsByUserId(resetEntry.userId);

    return reply.code(200).send({ ok: true, message: 'Password has been reset successfully.' });
  });
}
