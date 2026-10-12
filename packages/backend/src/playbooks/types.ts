// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { CaseType } from '@opentam/shared';

// A playbook is the authoritative, version-controlled definition of what a good
// discovery conversation must collect for one case type — the process rules the
// LLM used to carry in its prompt. The playbook engine evaluates these against
// persisted case state; the LLM only reasons and phrases (design doc §4.2, §8).
// Kept as typed TS config rather than YAML to avoid a parser dependency while
// staying structured, deterministic, and diff-reviewable.
export interface Playbook {
  type: CaseType;
  version: string;
  /** Fields a case must contain before it can be considered ready for handoff. */
  requiredFields: string[];
  /** Useful-but-not-blocking fields; collected opportunistically. */
  recommendedFields: string[];
  /**
   * Weight per field for the readiness score (design doc §16). Weights across
   * all scored fields should sum to 100. A field's weight also serves as its
   * importance for question prioritisation (§11) — the highest-weight missing
   * required field is asked next.
   */
  weights: Record<string, number>;
}

export type ReadinessStage =
  | 'discovery'
  | 'partially_defined'
  | 'pm_review_ready'
  | 'engineering_review_ready';

export interface PlaybookEvaluation {
  /** Required fields that have a value in the current case state. */
  present: string[];
  /** Required fields still missing a value. */
  missing: string[];
  /** 0–100 weighted completeness (design doc §16). */
  readiness: number;
  stage: ReadinessStage;
  /**
   * The single highest-value field to collect next, or null when nothing
   * required is missing. Drives the question planner (design doc §10/§11).
   */
  nextGoal: string | null;
}
