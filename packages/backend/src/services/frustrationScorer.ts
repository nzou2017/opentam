// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FrustrationSignals } from '@opentam/shared';

export type FrustrationSeverity = 'low' | 'medium' | 'high';

export function scoreFrustration(signals: FrustrationSignals): FrustrationSeverity {
  const { rageClicks, deadEndLoops, dwellSeconds } = signals;

  // High severity conditions
  if (
    rageClicks >= 3 ||
    (deadEndLoops >= 3 && dwellSeconds >= 60) ||
    dwellSeconds >= 120
  ) {
    return 'high';
  }

  // Low severity: all signals near zero
  if (rageClicks === 0 && deadEndLoops === 0 && dwellSeconds < 15 && signals.cursorEntropy < 1) {
    return 'low';
  }

  // Everything else is medium
  return 'medium';
}
