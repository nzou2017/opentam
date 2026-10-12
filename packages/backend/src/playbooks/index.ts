// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { CaseType } from '@opentam/shared';
import type { Playbook } from './types.js';
import { featureRequestPlaybook } from './featureRequest.js';
import { bugPlaybook } from './bug.js';

export type { Playbook, PlaybookEvaluation, ReadinessStage } from './types.js';
export { evaluatePlaybook } from './evaluator.js';
export { featureRequestPlaybook } from './featureRequest.js';
export { bugPlaybook } from './bug.js';

const PLAYBOOKS: Partial<Record<CaseType, Playbook>> = {
  feature_request: featureRequestPlaybook,
  bug_report: bugPlaybook,
};

/**
 * Resolve the playbook for a case type. `unknown` and `positive_feedback` have
 * no discovery playbook (nothing structured to collect) and return undefined —
 * callers skip evaluation for those.
 */
export function getPlaybook(type: CaseType): Playbook | undefined {
  return PLAYBOOKS[type];
}

/** All known field names across every playbook — used to constrain extraction. */
export function allKnownFields(): string[] {
  const set = new Set<string>();
  for (const pb of Object.values(PLAYBOOKS)) {
    if (!pb) continue;
    pb.requiredFields.forEach((f) => set.add(f));
    pb.recommendedFields.forEach((f) => set.add(f));
  }
  return [...set];
}
