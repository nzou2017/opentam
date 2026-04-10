// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { hasFeature, type Feature, type Plan } from '@opentam/shared';
import type { AuthenticatedRequest } from './auth.js';
import { isFeatureLicensed } from '../license.js';

/**
 * Fastify preHandler that gates a route behind enterprise features.
 *
 * Access is granted if EITHER:
 * - The tenant plan meets the minimum requirement, OR
 * - A valid license key includes this feature
 *
 * In practice, self-hosted users need a signed license key.
 * SaaS users with an enterprise plan in the DB also pass.
 *
 * Returns 403 with diagnostic info if neither check passes.
 */
export function requirePlan(feature: Feature) {
  return function (
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ): void {
    const req = request as AuthenticatedRequest;
    const plan = (req.tenant?.plan ?? 'hobbyist') as Plan;

    const planOk = hasFeature(plan, feature);
    const licensed = isFeatureLicensed(feature);

    if (!planOk && !licensed) {
      reply.code(403).send({
        error: `"${feature}" is an Enterprise feature. To unlock it, please purchase an OpenTAM Enterprise license. Contact q.cue.2026@gmail.com for pricing and a license key.`,
        feature,
        requiredPlan: 'enterprise',
        currentPlan: plan,
        licensed,
        contact: 'q.cue.2026@gmail.com',
      });
      return;
    }

    done();
  };
}
