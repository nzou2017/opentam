// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuthenticatedRequest } from './auth.js';

const ROLE_LEVEL: Record<string, number> = {
  owner: 2,
  admin: 1,
  viewer: 0,
};

export function requireRole(minRole: 'viewer' | 'admin' | 'owner') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as AuthenticatedRequest;

    // SDK key / secret key auth bypasses RBAC (machine-to-machine)
    if (req.authMethod === 'sdk' || req.authMethod === 'secret') {
      return;
    }

    if (!req.user) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const userLevel = ROLE_LEVEL[req.user.role] ?? -1;
    const requiredLevel = ROLE_LEVEL[minRole] ?? 0;

    if (userLevel < requiredLevel) {
      return reply.code(403).send({ error: `Requires ${minRole} role or higher` });
    }
  };
}
