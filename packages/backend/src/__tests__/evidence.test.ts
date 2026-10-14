// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from 'vitest';
import { buildEvidence, evidenceBehavior } from '../agent/evidence.js';

describe('buildEvidence', () => {
  it('no hits → none tier, zero confidence', () => {
    const e = buildEvidence([]);
    expect(e.tier).toBe('none');
    expect(e.confidence).toBe(0);
    expect(e.items).toEqual([]);
  });

  it('blank-text hits are dropped', () => {
    const e = buildEvidence([{ text: '   ', docId: 'd1', score: 0.9 }]);
    expect(e.tier).toBe('none');
  });

  it('single high-similarity hit reaches strong via the agreement floor', () => {
    const e = buildEvidence([{ text: 'a', docId: 'd1', score: 0.9 }]);
    // 0.7*0.9 + 0.3*(1/3) = 0.63 + 0.1 = 0.73
    expect(e.confidence).toBe(0.73);
    expect(e.tier).toBe('strong');
  });

  it('corroboration across distinct docs raises confidence', () => {
    const e = buildEvidence([
      { text: 'a', docId: 'd1', score: 0.8 },
      { text: 'b', docId: 'd2', score: 0.8 },
      { text: 'c', docId: 'd3', score: 0.8 },
    ]);
    // 0.7*0.8 + 0.3*1 = 0.56 + 0.3 = 0.86
    expect(e.confidence).toBe(0.86);
    expect(e.tier).toBe('strong');
    expect(e.items[0].score).toBe(0.8); // sorted desc
  });

  it('low similarity (below corroboration floor) stays weak — similarity alone is not enough', () => {
    const e = buildEvidence([{ text: 'a', docId: 'd1', score: 0.3 }]);
    // corroborating docs = 0 → 0.7*0.3 = 0.21
    expect(e.confidence).toBe(0.21);
    expect(e.tier).toBe('weak');
  });

  it('mid similarity single source → partial', () => {
    const e = buildEvidence([{ text: 'a', docId: 'd1', score: 0.5 }]);
    // 0.7*0.5 + 0.3*(1/3) = 0.35 + 0.1 = 0.45
    expect(e.confidence).toBe(0.45);
    expect(e.tier).toBe('partial');
  });

  it('duplicate docId does not double-count agreement', () => {
    const e = buildEvidence([
      { text: 'a', docId: 'd1', score: 0.8 },
      { text: 'b', docId: 'd1', score: 0.8 },
    ]);
    // one distinct corroborating doc → 0.7*0.8 + 0.3*(1/3) = 0.56 + 0.1 = 0.66
    expect(e.confidence).toBe(0.66);
    expect(e.tier).toBe('partial');
  });
});

describe('evidenceBehavior', () => {
  it('maps tiers to assert / qualify / withhold', () => {
    expect(evidenceBehavior('strong')).toBe('assert');
    expect(evidenceBehavior('partial')).toBe('qualify');
    expect(evidenceBehavior('weak')).toBe('withhold');
    expect(evidenceBehavior('none')).toBe('withhold');
  });
});
