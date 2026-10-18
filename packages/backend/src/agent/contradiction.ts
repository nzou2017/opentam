// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { buildEvidence } from './evidence.js';
import { callStructuredTool } from './structuredLlm.js';
import type { StructuredTool } from './structuredLlm.js';
import type { KnowledgeService } from '../services/knowledgeService.js';

// Contradiction detection (design doc §15): when a customer asserts something
// about what the product does, check it against the product KB and flag genuine
// conflicts so the agent clarifies rather than silently going with one version.

export interface Contradiction {
  /** What the customer believes/claimed about the product. */
  customerClaim: string;
  /** What the KB evidence actually says. */
  kbClaim: string;
  /** 0..1 — product-evidence confidence behind the KB side of the conflict. */
  confidence: number;
  status: 'unresolved';
}

// Decides whether a customer claim conflicts with retrieved evidence. Injected
// so it can be stubbed in tests; the default calls Anthropic.
export type ContradictionJudge = (args: {
  customerClaim: string;
  evidenceText: string;
  tenantId: string;
}) => Promise<{ conflict: boolean; kbClaim: string }>;

/**
 * For each customer product-claim, retrieve supporting evidence and ask the
 * judge whether it contradicts. Only claims with non-trivial evidence are
 * judged (no evidence → nothing to contradict). Each lookup/decision is
 * independent; one failure doesn't abort the rest.
 */
export async function detectContradictions(args: {
  claims: string[];
  tenantId: string;
  knowledge: KnowledgeService;
  judge: ContradictionJudge;
}): Promise<Contradiction[]> {
  const { claims, tenantId, knowledge, judge } = args;
  const out: Contradiction[] = [];

  for (const claim of claims) {
    if (!claim.trim()) continue;
    let hits;
    try {
      hits = await knowledge.searchProduct(tenantId, claim);
    } catch {
      continue;
    }
    const evidence = buildEvidence(hits);
    // Need at least partial evidence to assert a contradiction (§14/§15).
    if (evidence.tier === 'none' || evidence.tier === 'weak') continue;

    const evidenceText = evidence.items.slice(0, 3).map((i) => i.text).join('\n---\n');
    try {
      const { conflict, kbClaim } = await judge({ customerClaim: claim, evidenceText, tenantId });
      if (conflict) {
        out.push({ customerClaim: claim, kbClaim, confidence: evidence.confidence, status: 'unresolved' });
      }
    } catch {
      continue;
    }
  }

  return out;
}

const JUDGE_SYSTEM = `You compare a customer's belief about a product against excerpts from the product's documentation.
Decide only whether the documentation directly CONTRADICTS the customer's belief (says something incompatible with it).
Not finding confirmation is NOT a contradiction — only flag a conflict when the docs state something incompatible.`;

function buildJudgeTool(): StructuredTool {
  return {
    name: 'record_contradiction_check',
    description: 'Report whether the documentation contradicts the customer belief.',
    schema: {
      type: 'object' as const,
      properties: {
        conflict: { type: 'boolean', description: 'True only if the docs state something incompatible with the belief.' },
        kb_claim: { type: 'string', description: 'What the documentation actually says on this point (empty if no conflict).' },
      },
      required: ['conflict', 'kb_claim'],
    },
  };
}

/**
 * Default judge: one forced-tool LLM call, dispatched to whichever provider the
 * tenant runs (Anthropic or any OpenAI-compatible endpoint — see
 * {@link callStructuredTool}). No-ops to "no conflict" when the provider isn't
 * configured or returns nothing usable (same degrade-to-safe policy as the
 * fact extractor).
 */
export const defaultContradictionJudge: ContradictionJudge = async ({ customerClaim, evidenceText, tenantId }) => {
  const input = await callStructuredTool({
    tenantId,
    system: JUDGE_SYSTEM,
    messages: [{
      role: 'user',
      content: `Customer belief: ${customerClaim}\n\nDocumentation excerpts:\n${evidenceText}`,
    }],
    tool: buildJudgeTool(),
  }) as { conflict?: boolean; kb_claim?: string } | null;

  if (!input) return { conflict: false, kbClaim: '' };
  return { conflict: Boolean(input.conflict), kbClaim: typeof input.kb_claim === 'string' ? input.kb_claim : '' };
};
