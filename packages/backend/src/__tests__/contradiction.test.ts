// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi } from 'vitest';
import { detectContradictions } from '../agent/contradiction.js';
import type { ContradictionJudge } from '../agent/contradiction.js';
import type { KnowledgeService } from '../services/knowledgeService.js';
import type { RetrievalHit } from '../agent/evidence.js';

function knowledgeReturning(hits: RetrievalHit[]): KnowledgeService {
  return { searchProduct: vi.fn(async () => hits) };
}

const strongHits: RetrievalHit[] = [
  { text: 'The standard notification uses one global template.', docId: 'd1', score: 0.9 },
  { text: 'Templates are not configurable per dispute reason.', docId: 'd2', score: 0.8 },
];

describe('detectContradictions', () => {
  it('records a conflict when the judge flags one against strong evidence', async () => {
    const judge: ContradictionJudge = vi.fn(async () => ({ conflict: true, kbClaim: 'one global template only' }));
    const out = await detectContradictions({
      claims: ['templates can be configured per dispute reason'],
      tenantId: 't1',
      knowledge: knowledgeReturning(strongHits),
      judge,
    });
    expect(out).toHaveLength(1);
    expect(out[0].kbClaim).toBe('one global template only');
    expect(out[0].status).toBe('unresolved');
    expect(out[0].confidence).toBeGreaterThan(0.7); // strong evidence
  });

  it('does not call the judge when evidence is weak/absent', async () => {
    const judge = vi.fn(async () => ({ conflict: true, kbClaim: 'x' }));
    const out = await detectContradictions({
      claims: ['some niche belief'],
      tenantId: 't1',
      knowledge: knowledgeReturning([{ text: 'barely related', docId: 'd1', score: 0.2 }]),
      judge,
    });
    expect(out).toHaveLength(0);
    expect(judge).not.toHaveBeenCalled();
  });

  it('no conflict when the judge says the docs are compatible', async () => {
    const judge: ContradictionJudge = vi.fn(async () => ({ conflict: false, kbClaim: '' }));
    const out = await detectContradictions({
      claims: ['the product supports SSO'],
      tenantId: 't1',
      knowledge: knowledgeReturning(strongHits),
      judge,
    });
    expect(out).toHaveLength(0);
    expect(judge).toHaveBeenCalledOnce();
  });

  it('blank claims and knowledge failures are skipped without throwing', async () => {
    const judge = vi.fn(async () => ({ conflict: true, kbClaim: 'x' }));
    const flaky: KnowledgeService = { searchProduct: vi.fn(async () => { throw new Error('chroma down'); }) };
    const out = await detectContradictions({ claims: ['   ', 'real claim'], tenantId: 't1', knowledge: flaky, judge });
    expect(out).toHaveLength(0);
  });
});
