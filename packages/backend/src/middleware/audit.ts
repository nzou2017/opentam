// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { getStore } from '../db/index.js';
import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { AuthenticatedRequest } from './auth.js';

export async function logAudit(
  request: FastifyRequest,
  action: string,
  resource: string,
  resourceId?: string,
  details?: Record<string, unknown>,
): Promise<void> {
  const req = request as AuthenticatedRequest;
  const userId = req.user?.userId ?? 'system';
  const userEmail = req.user?.email ?? 'system';
  const tenantId = req.user?.tenantId ?? req.tenant?.id ?? 'unknown';
  const ipAddress = request.ip;

  try {
    await getStore().createAuditLog({
      id: randomUUID(),
      tenantId,
      userId,
      userEmail,
      action,
      resource,
      resourceId,
      details,
      ipAddress,
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Audit logging is best-effort — never block the request
  }
}
