// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from 'vitest';
import type { ExtractedFact } from '@opentam/shared';
import { evaluatePlaybook, featureRequestPlaybook, bugPlaybook, getPlaybook } from '../playbooks/index.js';

let seq = 0;
function fact(field: string, value: string, createdAt?: string): ExtractedFact {
  return {
    id: `f-${seq++}`,
    caseId: 'c1',
    tenantId: 't1',
    field,
    value,
    sourceType: 'customer',
    confidence: 0.9,
    status: 'customer_stated',
    createdAt: createdAt ?? new Date(2026, 0, 1, 0, 0, seq).toISOString(),
  };
}

describe('evaluatePlaybook — feature request', () => {
  it('empty facts: everything missing, readiness 0, discovery stage, highest-weight next goal', () => {
    const e = evaluatePlaybook(featureRequestPlaybook, []);
    expect(e.present).toEqual([]);
    expect(e.missing).toEqual(featureRequestPlaybook.requiredFields);
    expect(e.readiness).toBe(0);
    expect(e.stage).toBe('discovery');
    // problem_statement and desired_outcome both weigh 20; ties break by order.
    expect(e.nextGoal).toBe('problem_statement');
  });

  it('partial facts: weighted readiness and next goal skip present fields', () => {
    const e = evaluatePlaybook(featureRequestPlaybook, [
      fact('problem_statement', 'cannot see dispute reason'),
      fact('affected_persona', 'AP analyst'),
    ]);
    expect(e.present.sort()).toEqual(['affected_persona', 'problem_statement']);
    expect(e.readiness).toBe(30); // 20 + 10
    expect(e.stage).toBe('discovery');
    expect(e.nextGoal).toBe('desired_outcome'); // highest-weight (20) still missing
  });

  it('all required present: readiness 90, engineering-ready, no next goal', () => {
    const facts = featureRequestPlaybook.requiredFields.map((f) => fact(f, `v-${f}`));
    const e = evaluatePlaybook(featureRequestPlaybook, facts);
    expect(e.missing).toEqual([]);
    expect(e.readiness).toBe(90); // required weights sum to 90; recommended add the rest
    expect(e.stage).toBe('engineering_review_ready');
    expect(e.nextGoal).toBeNull();
  });

  it('recommended fields push readiness to 100', () => {
    const facts = [
      ...featureRequestPlaybook.requiredFields.map((f) => fact(f, `v-${f}`)),
      fact('frequency', 'weekly'),
      fact('workaround', 'manual spreadsheet'),
    ];
    expect(evaluatePlaybook(featureRequestPlaybook, facts).readiness).toBe(100);
  });

  it('latest value per field wins; blank values are ignored', () => {
    const facts = [
      fact('problem_statement', 'first', new Date(2026, 0, 1).toISOString()),
      fact('problem_statement', 'second', new Date(2026, 0, 2).toISOString()),
      fact('affected_persona', '   '), // blank → not counted as present
    ];
    const e = evaluatePlaybook(featureRequestPlaybook, facts);
    expect(e.present).toEqual(['problem_statement']);
    expect(e.missing).toContain('affected_persona');
  });
});

describe('evaluatePlaybook — bug', () => {
  it('prioritises reproduction_steps (highest weight) as next goal', () => {
    const e = evaluatePlaybook(bugPlaybook, []);
    expect(e.nextGoal).toBe('reproduction_steps');
  });

  it('crossing 75 reaches pm_review_ready', () => {
    // reproduction_steps 25 + expected 15 + actual 15 + environment 15 + impact 15 = 85
    const facts = ['reproduction_steps', 'expected_behavior', 'actual_behavior', 'environment', 'impact'].map((f) => fact(f, `v-${f}`));
    const e = evaluatePlaybook(bugPlaybook, facts);
    expect(e.readiness).toBe(85);
    expect(e.stage).toBe('pm_review_ready');
  });
});

describe('getPlaybook', () => {
  it('returns playbooks for discovery types and undefined otherwise', () => {
    expect(getPlaybook('feature_request')).toBe(featureRequestPlaybook);
    expect(getPlaybook('bug_report')).toBe(bugPlaybook);
    expect(getPlaybook('positive_feedback')).toBeUndefined();
    expect(getPlaybook('unknown')).toBeUndefined();
  });
});
