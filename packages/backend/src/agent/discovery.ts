// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { randomUUID } from 'node:crypto';
import type { CaseType, DiscoveryCase, ExtractedFact } from '@opentam/shared';
import type { Store } from '../db/store.js';
import { getPlaybook, evaluatePlaybook } from '../playbooks/index.js';
import type { PlaybookEvaluation } from '../playbooks/index.js';
import type { FactExtractor } from './factExtractor.js';

export interface DiscoveryStepResult {
  /** Case type after (possibly) reclassifying this turn. */
  intent: CaseType;
  /** Facts newly extracted this turn (shape persisted into extracted_facts). */
  factsExtracted: { field: string; value: string; confidence: number }[];
  /** Missing required fields before this turn's facts were merged. */
  missingBefore: string[];
  /** Missing required fields after merge. */
  missingAfter: string[];
  evaluation: PlaybookEvaluation | null;
  /**
   * Compact instruction appended to the responder's system prompt so it asks
   * the single highest-value next question (design doc §10/§24). Empty when
   * there is no active playbook or nothing required is missing.
   */
  directive: string;
}

// Human-readable prompts per field — keeps the question goal concrete for the
// responder without hard-coding the exact wording (design doc §10: plan the
// objective, let the LLM phrase it).
const FIELD_PROMPTS: Record<string, string> = {
  problem_statement: 'the underlying problem they are trying to solve (not the solution they proposed)',
  affected_persona: 'who is affected — the role or type of user',
  current_workflow: 'how they do this today, step by step',
  desired_outcome: 'what outcome they ultimately want',
  business_impact: 'the business impact — time lost, revenue, risk',
  example_scenario: 'a concrete recent example of when this came up',
  expected_behavior: 'what they expected to happen',
  actual_behavior: 'what actually happened instead',
  reproduction_steps: 'the exact steps to reproduce it',
  environment: 'their environment — platform, version, device',
  impact: 'how severely this impacts them and how often',
  frequency: 'how often this happens',
};

function buildDirective(evaluation: PlaybookEvaluation): string {
  if (!evaluation.nextGoal) return '';
  const goalPrompt = FIELD_PROMPTS[evaluation.nextGoal] ?? evaluation.nextGoal.replace(/_/g, ' ');
  const known = evaluation.present.length ? evaluation.present.join(', ') : 'nothing yet';
  return `

DISCOVERY CONTEXT (do not mention this block to the user):
You are gathering details for the team. Already known: ${known}.
Still needed (most important first): ${evaluation.missing.join(', ')}.
Your next goal is to learn ${goalPrompt}. Ask ONE natural, specific question toward that goal — do not interrogate with a checklist, and acknowledge what they already told you.`;
}

/**
 * Run one discovery turn over persisted case state (design doc §25):
 * extract facts → merge into the case → re-evaluate the playbook → produce the
 * next-question directive and the trace fields. Pure orchestration around the
 * injected `extractor` and the `store`; the responder LLM call happens after.
 */
export async function runDiscoveryStep(args: {
  store: Store;
  caseRow: DiscoveryCase;
  tenantId: string;
  message: string;
  userMessageId: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  extractor: FactExtractor;
}): Promise<DiscoveryStepResult> {
  const { store, caseRow, tenantId, message, userMessageId, history, extractor } = args;

  const existingFacts = await store.getFacts(caseRow.id, tenantId);

  // Missing-before baseline (against the case's current type).
  const beforePlaybook = getPlaybook(caseRow.type);
  const missingBefore = beforePlaybook ? evaluatePlaybook(beforePlaybook, existingFacts).missing : [];

  // 1. Extract structured facts + (re)classify intent.
  const { caseType, facts } = await extractor({ message, history, currentType: caseRow.type, tenantId });

  // 2. Reclassify the case when extraction is confident about a concrete type
  //    (design doc §9 — initial classification isn't permanent).
  let intent = caseRow.type;
  if (caseType !== 'unknown' && caseType !== caseRow.type) {
    intent = caseType;
    await store.updateCase(caseRow.id, tenantId, { type: caseType });
  } else if (caseType !== 'unknown') {
    intent = caseType;
  }

  // 3. Persist the newly stated facts (append-only, with provenance — §7).
  const now = new Date().toISOString();
  const persisted: ExtractedFact[] = [];
  for (const f of facts) {
    const fact: ExtractedFact = {
      id: randomUUID(),
      caseId: caseRow.id,
      tenantId,
      field: f.field,
      value: f.value,
      sourceType: 'customer',
      sourceMessageId: userMessageId,
      confidence: f.confidence,
      status: 'customer_stated',
      createdAt: now,
    };
    await store.addFact(fact);
    persisted.push(fact);
  }

  // 4. Re-evaluate against the (possibly new) active playbook.
  const playbook = getPlaybook(intent);
  if (!playbook) {
    return { intent, factsExtracted: facts, missingBefore, missingAfter: [], evaluation: null, directive: '' };
  }
  const evaluation = evaluatePlaybook(playbook, [...existingFacts, ...persisted]);

  return {
    intent,
    factsExtracted: facts,
    missingBefore,
    missingAfter: evaluation.missing,
    evaluation,
    directive: buildDirective(evaluation),
  };
}
