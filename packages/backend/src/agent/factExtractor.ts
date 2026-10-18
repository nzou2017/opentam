// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { CaseType } from '@opentam/shared';
import { allKnownFields } from '../playbooks/index.js';
import { callStructuredTool } from './structuredLlm.js';
import type { StructuredTool } from './structuredLlm.js';

export interface ExtractedFactInput {
  field: string;
  value: string;
  confidence: number;
}

// Whether the user's message affirms or rejects a summary the agent presented.
// Only consulted when the case is awaiting confirmation (design doc §23); the
// model reports 'none' otherwise.
export type ConfirmationSignal = 'affirm' | 'deny' | 'none';

export interface ExtractionResult {
  caseType: CaseType;
  facts: ExtractedFactInput[];
  confirmation: ConfirmationSignal;
  /**
   * Assertions the user made about what the product currently does or doesn't
   * do — checked against the KB for contradictions (design doc §15). Empty when
   * the user made no product-capability claims.
   */
  productClaims: string[];
}

const CONFIRMATIONS: ConfirmationSignal[] = ['affirm', 'deny', 'none'];

// Injected into the discovery orchestrator so it can be stubbed in tests
// (design doc §25 — extraction is step 1 of the turn pipeline).
export type FactExtractor = (args: {
  message: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  currentType: CaseType;
  tenantId: string;
}) => Promise<ExtractionResult>;

const CASE_TYPES: CaseType[] = ['feature_request', 'bug_report', 'positive_feedback', 'unknown'];

function buildExtractionTool(): StructuredTool {
  const fields = allKnownFields();
  return {
    name: 'record_discovery',
    description:
      'Classify the user\'s intent and extract any structured discovery facts stated in their message. ' +
      'Only record facts the user actually stated or clearly implied — never invent or infer beyond what was said. ' +
      `Use these field names when they apply: ${fields.join(', ')}. ` +
      'Separate the underlying problem (problem_statement) and desired outcome (desired_outcome) from any solution the user proposes — do not record a proposed implementation as the desired_outcome.',
    schema: {
      type: 'object' as const,
      properties: {
        case_type: {
          type: 'string',
          enum: CASE_TYPES,
          description:
            'feature_request (wants new/changed capability), bug_report (something is broken), positive_feedback (praise), or unknown if unclear.',
        },
        facts: {
          type: 'array',
          description: 'Discovery facts stated by the user this turn. Empty if none.',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', description: 'The field name this fact fills.' },
              value: { type: 'string', description: 'The value, in the user\'s own terms.' },
              confidence: { type: 'number', description: '0..1 — how clearly the user stated this.' },
            },
            required: ['field', 'value', 'confidence'],
          },
        },
        confirmation: {
          type: 'string',
          enum: CONFIRMATIONS,
          description:
            'If the agent previously asked the user to confirm a summary: affirm (they agreed it is accurate), deny (they said it is wrong or want changes), or none (not a confirmation reply).',
        },
        product_claims: {
          type: 'array',
          description:
            'Statements the user made asserting what the product currently DOES or DOES NOT do (e.g. "I can already configure templates per reason"). Empty if the user made no such capability claims.',
          items: { type: 'string' },
        },
      },
      required: ['case_type', 'facts', 'confirmation', 'product_claims'],
    },
  };
}

const SYSTEM = `You extract structured discovery information from a customer support conversation.
You do not answer the user. You classify their intent and pull out only the facts they actually stated.
Never fabricate facts. If the user proposed a solution, capture the underlying problem separately — do not treat the proposed solution as the desired outcome.`;

/**
 * Real fact extractor: one forced-tool LLM call so the response is structured
 * JSON, dispatched to whichever provider the tenant runs (Anthropic or any
 * OpenAI-compatible endpoint — see {@link callStructuredTool}).
 *
 * No-ops to `{ caseType: currentType, facts: [] }` when the provider has no API
 * key configured or the model returns nothing usable — extraction degrades to
 * empty rather than failing the turn.
 */
export const extractFacts: FactExtractor = async ({ message, history, currentType, tenantId }) => {
  const messages = [
    ...history.slice(-6).map((turn) => ({ role: turn.role, content: turn.content })),
    { role: 'user' as const, content: message },
  ];

  const input = await callStructuredTool({
    tenantId,
    system: SYSTEM,
    messages,
    tool: buildExtractionTool(),
    maxTokens: 1024,
  }) as { case_type?: string; facts?: ExtractedFactInput[]; confirmation?: string; product_claims?: unknown } | null;

  if (!input) {
    return { caseType: currentType, facts: [], confirmation: 'none', productClaims: [] };
  }

  const caseType = CASE_TYPES.includes(input.case_type as CaseType)
    ? (input.case_type as CaseType)
    : currentType;
  const facts = Array.isArray(input.facts)
    ? input.facts
        .filter((f) => f && typeof f.field === 'string' && typeof f.value === 'string' && f.value.trim())
        .map((f) => ({
          field: f.field,
          value: f.value,
          confidence: typeof f.confidence === 'number' ? Math.max(0, Math.min(1, f.confidence)) : 0.5,
        }))
    : [];
  const confirmation = CONFIRMATIONS.includes(input.confirmation as ConfirmationSignal)
    ? (input.confirmation as ConfirmationSignal)
    : 'none';
  const productClaims = Array.isArray(input.product_claims)
    ? input.product_claims.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    : [];
  return { caseType, facts, confirmation, productClaims };
};
