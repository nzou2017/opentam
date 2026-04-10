// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FrustrationSignals } from '@opentam/shared';

export interface ObserverConfig {
  thresholds: {
    rageClicks: number;
    dwellSeconds: number;
    cursorEntropy: number;
  };
  cooldownMinutes?: number; // how long to suppress after triggering (default: 30)
  onThresholdCrossed: (signals: FrustrationSignals) => void;
  onClickRecorded?: (url: string, selector: string) => void;
  isDisabled?: () => boolean;
}

interface ClickRecord {
  target: EventTarget | null;
  time: number;
}

interface MouseVector {
  dx: number;
  dy: number;
}

// Rage click: same element clicked repeatedly (any element type)
const RAGE_CLICK_WINDOW_MS = 4000;   // 4-second window
const RAGE_CLICK_COUNT = 3;           // 3 clicks on same element

// Scatter click: many clicks across different elements — "I don't know where to go"
const SCATTER_CLICK_WINDOW_MS = 15000; // 15-second window
const SCATTER_CLICK_COUNT = 6;         // 6+ clicks on 4+ distinct elements

const DEAD_END_LOOP_COUNT = 3;
const DEAD_END_LOOP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MOUSE_SAMPLE_INTERVAL_MS = 500;
const SCORE_CHECK_INTERVAL_MS = 3000;

export class Observer {
  private config: ObserverConfig;

  // Rage click tracking (same element, any type)
  private recentClicks: ClickRecord[] = [];
  private rageClickCount = 0;

  // Scatter click tracking (many elements, short window)
  private scatterClicks: ClickRecord[] = [];
  private scatterClickTriggered = false;

  // Dead-end loop tracking
  private urlHistory: { url: string; time: number }[] = [];
  private deadEndLoopCount = 0;

  // Dwell tracking
  private dwellStart: number = Date.now();
  private dwellSeconds = 0;
  private dwellTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivityTime: number = Date.now();
  private tabVisible = true;

  // Cursor entropy tracking
  private lastMousePos: { x: number; y: number } | null = null;
  private mouseVectors: MouseVector[] = [];
  private mouseSampleTimer: ReturnType<typeof setInterval> | null = null;
  private pendingVector: MouseVector | null = null;
  private cursorEntropy = 0;

  // Score check
  private scoreCheckTimer: ReturnType<typeof setInterval> | null = null;

  // Suppress re-triggering after threshold fires
  private suppressedUntil = 0;

  private listeners: Array<{ type: string; handler: EventListenerOrEventListenerObject }> = [];

  constructor(config: ObserverConfig) {
    this.config = config;
  }

  start(): void {
    this.dwellStart = Date.now();
    this.lastActivityTime = Date.now();
    this.recordUrl(window.location.href);

    this.addListener('click', this.handleClick.bind(this));
    this.addListener('keydown', this.resetDwell.bind(this));
    this.addListener('scroll', this.resetDwell.bind(this));
    this.addListener('mousemove', this.handleMouseMove.bind(this));

    // Pause dwell + score checks when tab is hidden (prevents false positives)
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    // Track URL changes (SPA navigation)
    const originalPushState = history.pushState.bind(history);
    history.pushState = (...args) => {
      originalPushState(...args);
      this.recordUrl(window.location.href);
    };
    window.addEventListener('popstate', () => this.recordUrl(window.location.href));

    // Dwell timer: increment every second, soft-reset if mouse moved recently
    this.dwellTimer = setInterval(() => {
      if (!this.tabVisible) return; // background time never counts
      // Soft reset: if mouse moved in the last 10s, user is active — reset dwell
      if (Date.now() - this.lastActivityTime < 10_000) {
        this.dwellStart = Date.now();
      }
      this.dwellSeconds = Math.floor((Date.now() - this.dwellStart) / 1000);
    }, 1000);

    // Mouse entropy sampling
    this.mouseSampleTimer = setInterval(() => {
      if (this.pendingVector) {
        this.mouseVectors.push(this.pendingVector);
        this.pendingVector = null;
        // Keep last 20 vectors
        if (this.mouseVectors.length > 20) {
          this.mouseVectors.shift();
        }
        this.cursorEntropy = this.computeEntropy(this.mouseVectors);
      }
    }, MOUSE_SAMPLE_INTERVAL_MS);

    // Periodic score check
    this.scoreCheckTimer = setInterval(() => {
      if (!this.tabVisible) return; // skip checks while backgrounded
      this.checkThreshold();
    }, SCORE_CHECK_INTERVAL_MS);
  }

  private handleVisibilityChange(): void {
    if (document.hidden) {
      this.tabVisible = false;
    } else {
      this.tabVisible = true;
      // Reset dwell on return so background time doesn't count
      this.dwellStart = Date.now();
      this.dwellSeconds = 0;
    }
  }

  stop(): void {
    this.listeners.forEach(({ type, handler }) => {
      document.removeEventListener(type, handler);
    });
    this.listeners = [];

    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    if (this.dwellTimer) clearInterval(this.dwellTimer);
    if (this.mouseSampleTimer) clearInterval(this.mouseSampleTimer);
    if (this.scoreCheckTimer) clearInterval(this.scoreCheckTimer);
  }

  private addListener(type: string, handler: EventListenerOrEventListenerObject): void {
    document.addEventListener(type, handler, true);
    this.listeners.push({ type, handler });
  }

  private handleClick(e: Event): void {
    this.resetDwell();
    const target = (e as MouseEvent).target;
    const now = Date.now();

    if (!(target instanceof Element)) return;

    // --- Rage click: same element 3+ times in 4 seconds (any element type) ---
    this.recentClicks = this.recentClicks.filter((c) => now - c.time <= RAGE_CLICK_WINDOW_MS);
    this.recentClicks.push({ target, time: now });
    const sameTargetClicks = this.recentClicks.filter((c) => c.target === target).length;
    if (sameTargetClicks >= RAGE_CLICK_COUNT) {
      this.rageClickCount = Math.max(this.rageClickCount, sameTargetClicks);
    }

    // --- Path recording: emit stable selector for the clicked element ---
    if (this.config.onClickRecorded) {
      const stableSelector = this.buildStableSelector(target);
      if (stableSelector) {
        this.config.onClickRecorded(window.location.pathname, stableSelector);
      }
    }

    // --- Scatter click: 6+ clicks across 4+ distinct elements in 15 seconds ---
    this.scatterClicks = this.scatterClicks.filter((c) => now - c.time <= SCATTER_CLICK_WINDOW_MS);
    this.scatterClicks.push({ target, time: now });
    if (!this.scatterClickTriggered && this.scatterClicks.length >= SCATTER_CLICK_COUNT) {
      const distinctTargets = new Set(this.scatterClicks.map((c) => c.target)).size;
      if (distinctTargets >= 4) {
        this.scatterClickTriggered = true;
        // Treat as equivalent to a rage click threshold hit
        this.rageClickCount = Math.max(this.rageClickCount, this.config.thresholds.rageClicks);
      }
    }
  }

  private resetDwell(): void {
    this.dwellStart = Date.now();
    this.dwellSeconds = 0;
  }

  private handleMouseMove(e: Event): void {
    const mouse = e as MouseEvent;
    this.lastActivityTime = Date.now();
    if (this.lastMousePos) {
      this.pendingVector = {
        dx: mouse.clientX - this.lastMousePos.x,
        dy: mouse.clientY - this.lastMousePos.y,
      };
    }
    this.lastMousePos = { x: mouse.clientX, y: mouse.clientY };
  }

  private recordUrl(url: string): void {
    const now = Date.now();

    // Remove entries outside the 5-minute window
    this.urlHistory = this.urlHistory.filter((e) => now - e.time <= DEAD_END_LOOP_WINDOW_MS);
    this.urlHistory.push({ url, time: now });

    // Count visits to this URL
    const visitCount = this.urlHistory.filter((e) => e.url === url).length;
    if (visitCount >= DEAD_END_LOOP_COUNT) {
      this.deadEndLoopCount = Math.max(this.deadEndLoopCount, visitCount);
    }
  }

  private computeEntropy(vectors: MouseVector[]): number {
    if (vectors.length < 2) return 0;

    // Compute variance of movement magnitudes as a proxy for entropy
    const magnitudes = vectors.map((v) => Math.sqrt(v.dx * v.dx + v.dy * v.dy));
    const mean = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
    const variance =
      magnitudes.reduce((sum, m) => sum + (m - mean) ** 2, 0) / magnitudes.length;

    // Normalize to a 0-10 scale (variance > 2500 = max entropy)
    return Math.min(10, variance / 250);
  }

  private checkThreshold(): void {
    if (Date.now() < this.suppressedUntil) return;
    if (this.config.isDisabled?.()) return;

    const signals: FrustrationSignals = {
      rageClicks: this.rageClickCount,
      deadEndLoops: this.deadEndLoopCount,
      dwellSeconds: this.dwellSeconds,
      cursorEntropy: parseFloat(this.cursorEntropy.toFixed(2)),
    };

    const total = this.computeScore(signals);
    if (total >= this.getThresholdScore()) {
      // Reset all signals so the same frustration burst doesn't re-trigger
      this.rageClickCount = 0;
      this.deadEndLoopCount = 0;
      this.recentClicks = [];
      this.scatterClicks = [];
      this.scatterClickTriggered = false;
      this.urlHistory = [];
      this.resetDwell();

      // Suppress for cooldown period (default 30 min)
      const cooldownMs = (this.config.cooldownMinutes ?? 30) * 60 * 1000;
      this.suppressedUntil = Date.now() + cooldownMs;

      this.config.onThresholdCrossed(signals);
    }
  }

  private computeScore(signals: FrustrationSignals): number {
    // Score each signal 0-10, sum them
    const rageScore = Math.min(10, (signals.rageClicks / this.config.thresholds.rageClicks) * 10);
    const dwellScore = Math.min(
      10,
      (signals.dwellSeconds / this.config.thresholds.dwellSeconds) * 10,
    ) * 0.5; // Dwell alone (max 5 points) can never trigger threshold — must combine with another signal
    const entropyScore = Math.min(
      10,
      (signals.cursorEntropy / this.config.thresholds.cursorEntropy) * 10,
    );
    const loopScore = Math.min(10, signals.deadEndLoops * 3.33);

    return rageScore + dwellScore + entropyScore + loopScore;
  }

  private getThresholdScore(): number {
    // Fire when any single signal is at threshold (score of 10 on any dimension)
    return 10;
  }

  private buildStableSelector(el: Element): string | null {
    if (el.id) return `#${el.id}`;
    for (const attr of ['data-testid', 'data-id', 'data-key', 'data-tab']) {
      const val = el.getAttribute(attr);
      if (val) return `${el.tagName.toLowerCase()}[${attr}="${val}"]`;
    }
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return `${el.tagName.toLowerCase()}[aria-label="${ariaLabel}"]`;
    return null;
  }

  getCurrentSignals(): FrustrationSignals {
    return {
      rageClicks: this.rageClickCount,
      deadEndLoops: this.deadEndLoopCount,
      dwellSeconds: this.dwellSeconds,
      cursorEntropy: parseFloat(this.cursorEntropy.toFixed(2)),
    };
  }

  simulateFrustration(): void {
    const signals: FrustrationSignals = {
      rageClicks: 5,
      deadEndLoops: 3,
      dwellSeconds: 120,
      cursorEntropy: 8,
    };
    this.config.onThresholdCrossed(signals);
  }
}
