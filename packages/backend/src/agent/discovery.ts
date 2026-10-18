// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { randomUUID } from 'node:crypto';
import type { CaseType, CaseStatus, DiscoveryCase, ExtractedFact, FeedbackType, Requirement } from '@opentam/shared';
import type { Store } from '../db/store.js';
import { getPlaybook, evaluatePlaybook } from '../playbooks/index.js';
import type { Playbook, PlaybookEvaluation } from '../playbooks/index.js';
import type { FactExtractor } from './factExtractor.js';
import { detectContradictions } from './contradiction.js';
import type { Contradiction, ContradictionJudge } from './contradiction.js';
import type { KnowledgeService } from '../services/knowledgeService.js';

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
   * the next question, presents the confirmation summary, or acknowledges the
   * handoff (design doc §10/§23/§24). Empty when there's nothing to steer.
   */
  directive: string;
  /** What the agent is doing this turn: ask | confirm | handoff | answer. */
  nextAction: string;
  /** Case status after this turn. */
  statusAfter: CaseStatus;
  /** The feature_requests row filed this turn, if any. */
  featureRequestId?: string;
  /** Customer beliefs this turn that the product KB contradicts (design doc §15). */
  contradictions: Contradiction[];
  /** Product claims searched against the KB this turn (for the trace, design doc §28). */
  retrievalQueries: string[];
}

function buildContradictionDirective(contradictions: Contradiction[]): string {
  const lines = contradictions
    .map((c) => `- They believe: "${c.customerClaim}" — but the docs indicate: "${c.kbClaim}".`)
    .join('\n');
  return `

DISCOVERY CONTEXT (do not mention this block to the user):
The user stated beliefs about the product that the documentation contradicts. Do NOT confirm these as working. Gently clarify each before proceeding:
${lines}`;
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

/** Latest non-empty value per field (append-only facts; most recent wins). */
function latestValues(facts: ExtractedFact[]): Map<string, string> {
  const sorted = [...facts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const map = new Map<string, string>();
  for (const f of sorted) if (f.value && f.value.trim()) map.set(f.field, f.value);
  return map;
}

function buildNextQuestionDirective(evaluation: PlaybookEvaluation): string {
  if (!evaluation.nextGoal) return '';
  const goalPrompt = FIELD_PROMPTS[evaluation.nextGoal] ?? evaluation.nextGoal.replace(/_/g, ' ');
  const known = evaluation.present.length ? evaluation.present.join(', ') : 'nothing yet';
  return `

DISCOVERY CONTEXT (do not mention this block to the user):
You are gathering details for the team. Already known: ${known}.
Still needed (most important first): ${evaluation.missing.join(', ')}.
Your next goal is to learn ${goalPrompt}. Ask ONE natural, specific question toward that goal — do not interrogate with a checklist, and acknowledge what they already told you.`;
}

function buildConfirmationDirective(values: Map<string, string>, playbook: Playbook): string {
  const lines = [...playbook.requiredFields, ...playbook.recommendedFields]
    .filter((f) => values.has(f))
    .map((f) => `- ${f.replace(/_/g, ' ')}: ${values.get(f)}`)
    .join('\n');
  return `

DISCOVERY CONTEXT (do not mention this block to the user):
You now have all the key details. Give the user a short, structured recap of your understanding (current situation, problem, desired outcome, impact, example as applicable), then ask: "Is this an accurate description of what you're requesting?" Do not ask for anything new.
Details to summarize:
${lines}`;
}

function buildFiledDirective(intent: CaseType): string {
  const label = intent === 'bug_report' ? 'bug report' : 'feature request';
  return `

DISCOVERY CONTEXT (do not mention this block to the user):
The user confirmed. Tell them their ${label} has been recorded and shared with the product team. Keep it brief and warm; do not ask anything further.`;
}

function buildCorrectionDirective(): string {
  return `

DISCOVERY CONTEXT (do not mention this block to the user):
The user says the summary isn't quite right. Ask them, in one sentence, what to correct or add.`;
}

/** Synthesize the first-class requirement statement from confirmed facts (§21). */
function buildRequirementStatement(intent: CaseType, v: Map<string, string>): string {
  if (intent === 'bug_report') {
    const expected = v.get('expected_behavior') ?? 'behave correctly';
    const actual = v.get('actual_behavior');
    return actual
      ? `The product shall ${expected}; currently it ${actual}.`
      : `The product shall ${expected}.`;
  }
  const outcome = v.get('desired_outcome') ?? v.get('problem_statement') ?? 'address the reported need';
  return `The product shall ${outcome}.`;
}

/** Build the engineering-facing handoff title + description from facts (§19/§27). */
function buildHandoff(intent: CaseType, v: Map<string, string>): { title: string; description: string } {
  const section = (label: string, field: string) => (v.has(field) ? `${label}:\n${v.get(field)}` : null);
  let title: string;
  let parts: (string | null)[];
  if (intent === 'bug_report') {
    title = v.get('actual_behavior') ?? v.get('expected_behavior') ?? 'Bug report';
    parts = [
      section('Expected behavior', 'expected_behavior'),
      section('Actual behavior', 'actual_behavior'),
      section('Reproduction steps', 'reproduction_steps'),
      section('Environment', 'environment'),
      section('Impact', 'impact'),
      section('Frequency', 'frequency'),
      section('First observed', 'first_observed'),
      section('Workaround', 'workaround'),
    ];
  } else {
    title = v.get('problem_statement') ?? v.get('desired_outcome') ?? 'Feature request';
    parts = [
      section('Problem', 'problem_statement'),
      section('Affected users', 'affected_persona'),
      section('Current workflow', 'current_workflow'),
      section('Desired outcome', 'desired_outcome'),
      section('Business impact', 'business_impact'),
      section('Example', 'example_scenario'),
      section('Frequency', 'frequency'),
      section('Workaround', 'workaround'),
    ];
  }
  return { title: title.slice(0, 100), description: parts.filter(Boolean).join('\n\n') };
}

/**
 * File a confirmed case: create the handoff feature_requests row, synthesize a
 * first-class requirement linked to it, and mark the case filed. Returns the new
 * feature_requests id.
 */
async function finalizeCase(args: {
  store: Store;
  caseRow: DiscoveryCase;
  tenantId: string;
  intent: CaseType;
  facts: ExtractedFact[];
}): Promise<string> {
  const { store, caseRow, tenantId, intent, facts } = args;
  const v = latestValues(facts);
  const now = new Date().toISOString();

  const feedbackType: FeedbackType = intent === 'bug_report' ? 'bug_report' : 'feature_request';
  const { title, description } = buildHandoff(intent, v);
  const featureRequestId = `fr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await store.createFeatureRequest({
    id: featureRequestId,
    tenantId,
    type: feedbackType,
    title,
    description: `${description}\n\n— Captured by Q discovery agent (customer-confirmed).`,
    status: 'new',
    votes: 0,
    submittedBy: 'q-discovery-agent',
    createdAt: now,
    updatedAt: now,
  });

  const requirement: Requirement = {
    id: randomUUID(),
    caseId: caseRow.id,
    tenantId,
    statement: buildRequirementStatement(intent, v),
    type: intent === 'bug_report' ? 'bug_fix' : 'functional',
    status: 'confirmed',
    customerConfirmed: true,
    sourceFactIds: facts.map((f) => f.id),
    featureRequestId,
    createdAt: now,
    updatedAt: now,
  };
  await store.createRequirement(requirement);

  await store.updateCase(caseRow.id, tenantId, { status: 'filed', featureRequestId });
  return featureRequestId;
}

/**
 * Run one discovery turn over persisted case state (design doc §25):
 * extract → merge → evaluate → drive the lifecycle (collect → confirm → file).
 * Pure orchestration around the injected `extractor` and the `store`; the
 * responder LLM call happens after, steered by the returned directive.
 */
export async function runDiscoveryStep(args: {
  store: Store;
  caseRow: DiscoveryCase;
  tenantId: string;
  message: string;
  userMessageId: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  extractor: FactExtractor;
  // Optional — when both are provided, the user's product claims are checked
  // against the KB for contradictions (design doc §15). Omitted in tests/non-
  // Anthropic deployments, where contradiction detection simply doesn't run.
  knowledge?: KnowledgeService;
  judge?: ContradictionJudge;
}): Promise<DiscoveryStepResult> {
  const { store, caseRow, tenantId, message, userMessageId, history, extractor, knowledge, judge } = args;

  const existingFacts = await store.getFacts(caseRow.id, tenantId);
  const beforePlaybook = getPlaybook(caseRow.type);
  const missingBefore = beforePlaybook ? evaluatePlaybook(beforePlaybook, existingFacts).missing : [];

  // 1. Extract facts + (re)classify intent + detect confirmation + product claims.
  const { caseType, facts, confirmation, productClaims } = await extractor({ message, history, currentType: caseRow.type, tenantId });

  // Contradiction detection (§15): check the user's product-capability claims
  // against the KB. Independent of the collection lifecycle below.
  let contradictions: Contradiction[] = [];
  if (productClaims.length > 0 && knowledge && judge) {
    contradictions = await detectContradictions({ claims: productClaims, tenantId, knowledge, judge });
  }

  // 2. Reclassify when extraction is confident about a concrete type (§9).
  let intent = caseRow.type;
  if (caseType !== 'unknown') {
    intent = caseType;
    if (caseType !== caseRow.type) await store.updateCase(caseRow.id, tenantId, { type: caseType });
  }

  // 3. Persist newly stated facts (append-only, with provenance — §7).
  const now = new Date().toISOString();
  const persisted: ExtractedFact[] = [];
  for (const f of facts) {
    const fact: ExtractedFact = {
      id: randomUUID(), caseId: caseRow.id, tenantId,
      field: f.field, value: f.value,
      sourceType: 'customer', sourceMessageId: userMessageId,
      confidence: f.confidence, status: 'customer_stated', createdAt: now,
    };
    await store.addFact(fact);
    persisted.push(fact);
  }
  const allFacts = [...existingFacts, ...persisted];

  // Every lifecycle branch carries the contradiction fields; the contradiction
  // directive is prepended once, after the branch decides its own directive.
  const base = { intent, factsExtracted: facts, missingBefore, contradictions, retrievalQueries: productClaims };

  const decided: DiscoveryStepResult = await (async (): Promise<DiscoveryStepResult> => {
  const playbook = getPlaybook(intent);
  if (!playbook) {
    // No discovery playbook (unknown / positive_feedback) — nothing to collect.
    return { ...base, missingAfter: [], evaluation: null, directive: '', nextAction: 'answer', statusAfter: caseRow.status };
  }

  const evaluation = evaluatePlaybook(playbook, allFacts);
  const complete = evaluation.missing.length === 0;
  const values = latestValues(allFacts);

  // Already handed off — keep answering, don't re-file.
  if (caseRow.status === 'filed') {
    return { ...base, missingAfter: evaluation.missing, evaluation, directive: '', nextAction: 'answer', statusAfter: 'filed' };
  }

  // Awaiting the customer's confirmation of the summary (§23).
  if (caseRow.status === 'awaiting_confirmation') {
    if (confirmation === 'affirm' && complete) {
      const featureRequestId = await finalizeCase({ store, caseRow, tenantId, intent, facts: allFacts });
      return { ...base, missingAfter: [], evaluation, directive: buildFiledDirective(intent), nextAction: 'handoff', statusAfter: 'filed', featureRequestId };
    }
    if (confirmation === 'deny') {
      await store.updateCase(caseRow.id, tenantId, { status: 'open' });
      return { ...base, missingAfter: evaluation.missing, evaluation, directive: buildCorrectionDirective(), nextAction: 'ask', statusAfter: 'open' };
    }
    if (complete) {
      // Unclear reply but still complete — re-present the summary.
      return { ...base, missingAfter: [], evaluation, directive: buildConfirmationDirective(values, playbook), nextAction: 'confirm', statusAfter: 'awaiting_confirmation' };
    }
    // New info opened a gap — go back to collecting.
    await store.updateCase(caseRow.id, tenantId, { status: 'open' });
    return { ...base, missingAfter: evaluation.missing, evaluation, directive: buildNextQuestionDirective(evaluation), nextAction: 'ask', statusAfter: 'open' };
  }

  // Open case that just became complete — present the confirmation summary (§23).
  if (complete && caseRow.status === 'open') {
    await store.updateCase(caseRow.id, tenantId, { status: 'awaiting_confirmation' });
    return { ...base, missingAfter: [], evaluation, directive: buildConfirmationDirective(values, playbook), nextAction: 'confirm', statusAfter: 'awaiting_confirmation' };
  }

  // Still collecting.
  return {
    ...base,
    missingAfter: evaluation.missing,
    evaluation,
    directive: buildNextQuestionDirective(evaluation),
    nextAction: evaluation.missing.length ? 'ask' : 'answer',
    statusAfter: caseRow.status,
  };
  })();

  // Surface contradictions regardless of lifecycle stage by prepending the
  // warning to whatever directive the branch produced.
  const prefix = contradictions.length > 0 ? buildContradictionDirective(contradictions) : '';
  return { ...decided, directive: prefix + decided.directive };
}
