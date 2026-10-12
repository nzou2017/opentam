// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { Playbook } from './types.js';

// Feature-request discovery playbook (design doc §4.2, §6, §16). The required
// set deliberately separates problem_statement / desired_outcome from any
// proposed solution — the agent must discover the underlying need, not convert
// a suggested implementation straight into a requirement (design doc §6).
export const featureRequestPlaybook: Playbook = {
  type: 'feature_request',
  version: '1.0',
  requiredFields: [
    'problem_statement',
    'affected_persona',
    'current_workflow',
    'desired_outcome',
    'business_impact',
    'example_scenario',
  ],
  recommendedFields: ['frequency', 'workaround', 'priority'],
  // Sums to 100 (design doc §16).
  weights: {
    problem_statement: 20,
    desired_outcome: 20,
    current_workflow: 15,
    example_scenario: 15,
    business_impact: 10,
    affected_persona: 10,
    frequency: 5,
    workaround: 5,
  },
};
