// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

// Evidence layer (design doc §14). Product claims the agent makes should be
// backed by retrieved evidence, and the confidence in a claim must NOT be raw
// vector similarity alone — it also factors how many distinct sources
// corroborate it. This module turns raw retrieval hits into an evidence bundle
// with a deterministic confidence and a behaviour tier.

export interface RetrievalHit {
  text: string;
  docId: string;
  score: number; // 0..1 similarity
}

export type EvidenceTier = 'strong' | 'partial' | 'weak' | 'none';

export interface Evidence {
  items: RetrievalHit[];
  /** 0..1 — blends top similarity with cross-source agreement (not similarity alone). */
  confidence: number;
  tier: EvidenceTier;
}

// A hit must clear this similarity to count as a corroborating source.
const CORROBORATION_MIN_SCORE = 0.5;
// How many distinct corroborating sources saturate the agreement term.
const AGREEMENT_SATURATION = 3;

/**
 * Build an evidence bundle from retrieval hits.
 *
 * confidence = 0.7 · topScore + 0.3 · agreementRatio, where agreementRatio is
 * the count of distinct docs scoring ≥ {@link CORROBORATION_MIN_SCORE},
 * saturating at {@link AGREEMENT_SATURATION}. Similarity alone can't reach the
 * "strong" tier without corroboration (design doc §14).
 */
export function buildEvidence(hits: RetrievalHit[]): Evidence {
  const items = [...hits].filter((h) => h.text.trim()).sort((a, b) => b.score - a.score);
  if (items.length === 0) return { items: [], confidence: 0, tier: 'none' };

  const topScore = Math.max(0, Math.min(1, items[0].score));

  const corroboratingDocs = new Set(
    items.filter((h) => h.score >= CORROBORATION_MIN_SCORE).map((h) => h.docId),
  );
  const agreementRatio = Math.min(1, corroboratingDocs.size / AGREEMENT_SATURATION);

  const confidence = Math.round((0.7 * topScore + 0.3 * agreementRatio) * 100) / 100;

  return { items, confidence, tier: tierFor(confidence) };
}

function tierFor(confidence: number): EvidenceTier {
  if (confidence >= 0.7) return 'strong';
  if (confidence >= 0.4) return 'partial';
  if (confidence > 0) return 'weak';
  return 'none';
}

/**
 * How the agent should treat a claim at this evidence tier (design doc §14):
 * strong → assert; partial → qualify; weak/none → don't assert, clarify/escalate.
 */
export function evidenceBehavior(tier: EvidenceTier): 'assert' | 'qualify' | 'withhold' {
  if (tier === 'strong') return 'assert';
  if (tier === 'partial') return 'qualify';
  return 'withhold';
}
