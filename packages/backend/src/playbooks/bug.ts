// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { Playbook } from './types.js';

// Bug-investigation playbook (design doc §18, §19). Mirrors the engineering-
// ready bug package: expected vs actual, reproduction, environment, impact.
export const bugPlaybook: Playbook = {
  type: 'bug_report',
  version: '1.0',
  requiredFields: [
    'expected_behavior',
    'actual_behavior',
    'reproduction_steps',
    'environment',
    'impact',
  ],
  recommendedFields: ['frequency', 'first_observed', 'workaround'],
  // Sums to 100 (design doc §16). Reproduction carries the most weight — a bug
  // engineering can't reproduce is the least actionable.
  weights: {
    reproduction_steps: 25,
    expected_behavior: 15,
    actual_behavior: 15,
    environment: 15,
    impact: 15,
    frequency: 5,
    first_observed: 5,
    workaround: 5,
  },
};
