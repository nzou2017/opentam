// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { hasFeature, type Feature, type Plan } from '@opentam/shared';
import type { AuthenticatedRequest } from './auth.js';
import { isFeatureLicensed } from '../license.js';

/**
 * A tenant's `plan` column is only trustworthy for gating if any Enterprise
 * grant behind it hasn't expired. `licenseExpiresAt` is only ever set when
 * `plan` was raised via a per-tenant license key (see routes/tenant.ts);
 * plans set directly (e.g. self-hosted setup wizard) have no expiry to check.
 */
function effectivePlan(tenant?: { plan: string; licenseExpiresAt?: string }): Plan {
  const plan = (tenant?.plan ?? 'hobbyist') as Plan;
  if (plan === 'enterprise' && tenant?.licenseExpiresAt && new Date(tenant.licenseExpiresAt) < new Date()) {
    return 'hobbyist';
  }
  return plan;
}

/**
 * Fastify preHandler that gates a route behind enterprise features.
 *
 * Access is granted if EITHER:
 * - The tenant plan meets the minimum requirement (and, if granted via a
 *   per-tenant license key, that key hasn't expired), OR
 * - The deployment-wide signed license key includes this feature
 *
 * In practice, self-hosted single-tenant installs rely on the deployment-wide
 * license key. Multi-tenant SaaS tenants are gated purely by their own
 * `plan` column, which per-tenant license activation updates directly
 * (routes/tenant.ts) — the deployment-wide license is never mutated by a
 * tenant's own key, so it can't leak Enterprise access across tenants.
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
    const plan = effectivePlan(req.tenant);

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
