// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { ExtractedFact } from '@opentam/shared';
import type { Playbook, PlaybookEvaluation, ReadinessStage } from './types.js';

// Readiness stage thresholds (design doc §16). Derived from the weighted score
// by explicit rules — never an LLM-guessed percentage.
function stageFor(readiness: number): ReadinessStage {
  if (readiness >= 90) return 'engineering_review_ready';
  if (readiness >= 75) return 'pm_review_ready';
  if (readiness >= 50) return 'partially_defined';
  return 'discovery';
}

/**
 * Reduce a fact list to the latest non-empty value per field. Facts are
 * append-only (design doc §7), so when the same field is extracted more than
 * once the most recent statement wins.
 */
function latestValues(facts: ExtractedFact[]): Map<string, string> {
  const sorted = [...facts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const map = new Map<string, string>();
  for (const f of sorted) {
    if (f.value && f.value.trim()) map.set(f.field, f.value);
  }
  return map;
}

/**
 * Deterministically evaluate a case's facts against a playbook: which required
 * fields are present/missing, the weighted readiness score and stage, and the
 * single highest-value field to collect next (design doc §8, §11, §16).
 *
 * Pure — no LLM, no I/O. This is what moves "what's still missing / what to ask
 * next / is it ready" out of the prompt and into testable code.
 */
export function evaluatePlaybook(playbook: Playbook, facts: ExtractedFact[]): PlaybookEvaluation {
  const values = latestValues(facts);

  const present = playbook.requiredFields.filter((f) => values.has(f));
  const missing = playbook.requiredFields.filter((f) => !values.has(f));

  // Weighted completeness across every scored field that's present.
  let readiness = 0;
  for (const [field, weight] of Object.entries(playbook.weights)) {
    if (values.has(field)) readiness += weight;
  }
  readiness = Math.min(100, Math.round(readiness));

  // Next question goal: the missing *required* field with the highest weight
  // (importance). Ties broken by playbook order for determinism.
  let nextGoal: string | null = null;
  let bestWeight = -1;
  for (const field of missing) {
    const w = playbook.weights[field] ?? 0;
    if (w > bestWeight) {
      bestWeight = w;
      nextGoal = field;
    }
  }

  return { present, missing, readiness, stage: stageFor(readiness), nextGoal };
}
