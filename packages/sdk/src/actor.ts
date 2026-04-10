// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { InterventionCommand, TourStep } from '@opentam/shared';
import { SurveyPanel } from './survey.js';
import type { Transport } from './transport.js';

const SPOTLIGHT_BACKDROP_ID = 'q-spotlight-backdrop';
const SPOTLIGHT_RING_ID = 'q-spotlight-ring';

// Module-level refs so any new spotlight can cancel the previous one's timers
let activeSpotlightCleanup: (() => void) | null = null;
let activeSetupTimer: ReturnType<typeof setTimeout> | null = null;

function clearSpotlightBackdrop(): void {
  document.getElementById(SPOTLIGHT_BACKDROP_ID)?.remove();
  document.getElementById(SPOTLIGHT_RING_ID)?.remove();
}

/**
 * Dim the page and spotlight a single element using a clip-path hole in a fixed backdrop.
 * Works regardless of the element's stacking context or parent overflow.
 */
/**
 * Navigate within an SPA by clicking a matching <a> element if possible (works
 * with Next.js Link, React Router, etc.), otherwise fall back to location.href.
 */
function spaNavigate(href: string): void {
  // Try to find an anchor with matching href and click it (SPA-friendly)
  const link = document.querySelector(`a[href="${CSS.escape(href)}"]`) as HTMLAnchorElement | null;
  if (link) {
    link.click();
    return;
  }
  // Also try partial match for relative paths
  const allLinks = document.querySelectorAll('a[href]');
  for (const a of allLinks) {
    const anchor = a as HTMLAnchorElement;
    if (anchor.pathname === href || anchor.getAttribute('href') === href) {
      anchor.click();
      return;
    }
  }
  // No matching link found — hard navigate
  window.location.href = href;
}

/** Safe querySelector that catches invalid selectors from LLM-generated content */
function safeQuerySelector(selector: string): HTMLElement | null {
  try {
    return document.querySelector(selector) as HTMLElement | null;
  } catch {
    console.warn('[Q] Invalid selector:', selector);
    return null;
  }
}

let spotlightChangeCallback: ((rect: SpotlightRect | null) => void) | null = null;

function spotlightElement(selector: string): HTMLElement | null {
  // Cancel any in-flight spotlight before starting a new one
  if (activeSetupTimer !== null) { clearTimeout(activeSetupTimer); activeSetupTimer = null; }
  if (activeSpotlightCleanup !== null) { activeSpotlightCleanup(); activeSpotlightCleanup = null; }
  clearSpotlightBackdrop();

  const el = safeQuerySelector(selector);
  if (!el) return null;

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Wait for scroll to settle before measuring position
  activeSetupTimer = setTimeout(() => {
    activeSetupTimer = null;

    const pad = 8;
    const rect = el.getBoundingClientRect();
    const t = Math.max(0, rect.top - pad);
    const l = Math.max(0, rect.left - pad);
    const b = Math.min(window.innerHeight, rect.bottom + pad);
    const r = Math.min(window.innerWidth, rect.right + pad);

    // Backdrop with a rectangular hole cut out over the target
    const backdrop = document.createElement('div');
    backdrop.id = SPOTLIGHT_BACKDROP_ID;
    backdrop.style.cssText = `
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.6);
      z-index: 2147483640;
      clip-path: polygon(
        0% 0%, 100% 0%, 100% 100%, 0% 100%,
        0% ${t}px,
        ${l}px ${t}px,
        ${l}px ${b}px,
        ${r}px ${b}px,
        ${r}px ${t}px,
        0% ${t}px
      );
      pointer-events: all;
    `;
    document.body.appendChild(backdrop);

    // Highlight ring positioned over the element
    const ring = document.createElement('div');
    ring.id = SPOTLIGHT_RING_ID;
    ring.style.cssText = `
      position: fixed;
      top: ${t}px; left: ${l}px;
      width: ${r - l}px; height: ${b - t}px;
      border: 2px solid #6366f1;
      border-radius: 6px;
      box-shadow: 0 0 0 4px rgba(99,102,241,0.35);
      z-index: 2147483641;
      pointer-events: none;
    `;
    document.body.appendChild(ring);

    // Notify about spotlight position for collision avoidance
    spotlightChangeCallback?.({ top: t, left: l, bottom: b, right: r });

    const cleanup = (): void => {
      if (activeSpotlightCleanup === cleanup) activeSpotlightCleanup = null;
      document.removeEventListener('click', cleanup, true);
      clearSpotlightBackdrop();
      spotlightChangeCallback?.(null);
    };

    activeSpotlightCleanup = cleanup;
    // Dismiss on any click anywhere on the page (capture phase so it fires before the target)
    setTimeout(() => document.addEventListener('click', cleanup, { capture: true, once: true }), 100);
  }, 250);

  return el;
}

function clearHighlights(): void {
  if (activeSetupTimer !== null) { clearTimeout(activeSetupTimer); activeSetupTimer = null; }
  if (activeSpotlightCleanup !== null) { activeSpotlightCleanup(); activeSpotlightCleanup = null; }
  clearSpotlightBackdrop();
  spotlightChangeCallback?.(null);
}

export interface SpotlightRect {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface ActorConfig {
  tenantId: string;
  sdkKey?: string;
  cooldownHours: number;
  isDisabled?: () => boolean;
  onMessage: (message: string) => void;
  onStepCompleted?: (workflowId: string, stepIndex: number, completed: boolean) => void;
  onSpotlightChange?: (rect: SpotlightRect | null) => void;
  transport?: Transport;
}

function featureHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

export class Actor {
  private config: ActorConfig;
  private tourCleanup: (() => void) | null = null;

  constructor(config: ActorConfig) {
    this.config = config;
    if (config.onSpotlightChange) {
      spotlightChangeCallback = config.onSpotlightChange;
    }
  }

  isCoolingDown(command: InterventionCommand): boolean {
    const key = this.cooldownKey(command);
    const expiry = localStorage.getItem(key);
    if (!expiry) return false;
    return Date.now() < parseInt(expiry, 10);
  }

  setCooldown(command: InterventionCommand): void {
    const key = this.cooldownKey(command);
    const expiry = Date.now() + this.config.cooldownHours * 60 * 60 * 1000;
    localStorage.setItem(key, expiry.toString());
  }

  private cooldownKey(command: InterventionCommand): string {
    const featureStr = command.elementId ?? command.href ?? command.message;
    return `q_cooldown_${this.config.tenantId}_${featureHash(featureStr)}`;
  }

  execute(command: InterventionCommand): void {
    if (this.config.isDisabled?.()) return;
    if (this.isCoolingDown(command)) {
      console.info('[Q] Intervention suppressed — in cooldown period.');
      return;
    }

    switch (command.action) {
      case 'overlay_highlight':
        this.executeHighlight(command);
        break;
      case 'deep_link':
        this.executeDeepLink(command);
        break;
      case 'message_only':
        this.config.onMessage(command.message);
        break;
      case 'tour':
        this.executeTour(command);
        break;
      case 'survey':
        this.executeSurvey(command);
        break;
      default:
        console.warn('[Q] Unknown intervention action:', (command as InterventionCommand).action);
    }

    // If a survey was attached alongside a non-survey intervention, show it after a short delay
    if (command.action !== 'survey' && command.surveyId && command.surveyQuestions && this.config.transport) {
      if (this.config.sdkKey !== 'sdk_q_admin') {
        setTimeout(() => {
          const panel = new SurveyPanel(
            command.surveyQuestions!,
            command.surveyId!,
            this.config.transport!,
          );
          panel.show();
        }, 3000);
      }
    }
  }

  private executeHighlight(command: InterventionCommand): void {
    if (!command.elementId) {
      this.config.onMessage(command.message);
      return;
    }
    const el = spotlightElement(command.elementId);
    if (!el) {
      // Element not found — fall back to message only
      this.config.onMessage(command.message);
    }
  }

  private executeDeepLink(command: InterventionCommand): void {
    if (!command.href) return;
    spaNavigate(command.href);
  }

  private executeTour(command: InterventionCommand): void {
    const steps = command.steps ?? [];
    if (steps.length === 0) {
      this.config.onMessage(command.message);
      return;
    }

    const engine = new TourEngine(steps, () => {
      this.tourCleanup = null;
    }, command.workflowId, this.config.onStepCompleted);
    engine.start();

    this.tourCleanup = (): void => {
      engine.destroy();
    };
  }

  private executeSurvey(command: InterventionCommand): void {
    // Never show surveys for Q admin portal
    if (this.config.sdkKey === 'sdk_q_admin') return;

    if (!command.surveyId || !command.surveyQuestions || !this.config.transport) {
      this.config.onMessage(command.message);
      return;
    }

    const panel = new SurveyPanel(
      command.surveyQuestions,
      command.surveyId,
      this.config.transport,
    );
    panel.show();
  }

  clearHighlights(): void {
    clearSpotlightBackdrop();
    if (this.tourCleanup) {
      this.tourCleanup();
      this.tourCleanup = null;
    }
  }
}

// ---------------------------------------------------------------------------
// TourEngine — spotlight tour with backdrop, tooltip, and step navigation
// ---------------------------------------------------------------------------

const TOUR_BACKDROP_ID = 'q-tour-backdrop';
const TOUR_RING_ID = 'q-tour-ring';
const TOUR_TOOLTIP_ID = 'q-tour-tooltip';

class TourEngine {
  private steps: TourStep[];
  private stepIndex = 0;
  private backdrop: HTMLElement | null = null;
  private ring: HTMLElement | null = null;
  private tooltip: HTMLElement | null = null;
  private onDone: () => void;
  private keyHandler: (e: KeyboardEvent) => void;
  private workflowId?: string;
  private onStepCompleted?: (workflowId: string, stepIndex: number, completed: boolean) => void;
  private targetClickCleanup: (() => void) | null = null;

  constructor(
    steps: TourStep[],
    onDone: () => void,
    workflowId?: string,
    onStepCompleted?: (workflowId: string, stepIndex: number, completed: boolean) => void,
  ) {
    this.steps = steps;
    this.onDone = onDone;
    this.workflowId = workflowId;
    this.onStepCompleted = onStepCompleted;
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.destroy();
    };
  }

  start(): void {
    this.createBackdrop();
    document.addEventListener('keydown', this.keyHandler);
    this.showStep(0);
  }

  private createBackdrop(): void {
    if (document.getElementById(TOUR_BACKDROP_ID)) return;
    const backdrop = document.createElement('div');
    backdrop.id = TOUR_BACKDROP_ID;
    backdrop.style.cssText = `
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.6);
      z-index: 2147483640;
      pointer-events: all;
    `;
    document.body.appendChild(backdrop);
    this.backdrop = backdrop;
  }

  private showStep(index: number): void {
    // Report completion of previous step
    if (index > 0 && this.workflowId && this.onStepCompleted) {
      this.onStepCompleted(this.workflowId, index - 1, true);
    }

    this.stepIndex = index;
    const step = this.steps[index];
    const total = this.steps.length;

    // URL-aware: navigate if step requires a different URL
    if (step.urlPattern && !this.urlMatchesCurrent(step.urlPattern)) {
      spaNavigate(step.urlPattern);
    }

    // Build action-specific message
    const actionHint = this.getActionHint(step);
    const displayMessage = actionHint ? `${actionHint} ${step.message}` : step.message;

    // Don't show tooltip until element is found and positioned — avoids a flash in the center
    this.removeTooltip();
    const target = safeQuerySelector(step.selector);

    if (target) {
      this.spotlightTarget(target, index, total);
    } else {
      // Element not in DOM yet — wait up to 3 s (e.g. tab after navigation)
      this.waitForElement(step.selector, 3000, (el) => {
        if (this.stepIndex !== index) return;
        if (el) {
          this.spotlightTarget(el, index, total);
        } else {
          // Element never appeared — show centered fallback tooltip
          const tooltip = this.buildTooltip(displayMessage, index, total, null);
          document.body.appendChild(tooltip);
          this.tooltip = tooltip;
        }
      });
    }
  }

  private urlMatchesCurrent(pattern: string): boolean {
    const current = window.location.pathname;
    if (pattern === current) return true;
    // Simple wildcard: /settings/* matches /settings/api
    if (pattern.endsWith('*')) {
      return current.startsWith(pattern.slice(0, -1));
    }
    return false;
  }

  private getActionHint(step: TourStep): string {
    switch (step.action) {
      case 'click': return 'Click this button.';
      case 'navigate': return 'Go to this page.';
      case 'input': return 'Enter your value here.';
      case 'wait': return 'Wait for this to appear.';
      case 'verify': return 'Verify this is correct.';
      default: return '';
    }
  }

  /** Returns true if the step action means the user should click the element to advance */
  private isClickToAdvance(step: TourStep): boolean {
    return step.action === 'click' || step.action === 'navigate' || !step.action;
  }

  /** Scroll → wait for scroll to settle → clip-path hole + ring + re-anchor tooltip */
  private spotlightTarget(target: HTMLElement, index: number, total: number): void {
    // Clean up any previous target click listener
    if (this.targetClickCleanup) { this.targetClickCleanup(); this.targetClickCleanup = null; }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      if (this.stepIndex !== index) return;
      const pad = 8;
      const rect = target.getBoundingClientRect();
      const t = Math.max(0, rect.top - pad);
      const l = Math.max(0, rect.left - pad);
      const b = Math.min(window.innerHeight, rect.bottom + pad);
      const r = Math.min(window.innerWidth, rect.right + pad);

      // Clip-path hole in backdrop (avoids overflow:hidden clipping issues)
      if (this.backdrop) {
        this.backdrop.style.clipPath = `polygon(
          0% 0%, 100% 0%, 100% 100%, 0% 100%,
          0% ${t}px, ${l}px ${t}px, ${l}px ${b}px,
          ${r}px ${b}px, ${r}px ${t}px, 0% ${t}px
        )`;
      }

      // Highlight ring — allow pointer events through so user can click the target
      if (!this.ring) {
        this.ring = document.createElement('div');
        this.ring.id = TOUR_RING_ID;
        document.body.appendChild(this.ring);
      }
      this.ring.style.cssText = `
        position: fixed;
        top: ${t}px; left: ${l}px;
        width: ${r - l}px; height: ${b - t}px;
        border: 2px solid #6366f1;
        border-radius: 6px;
        box-shadow: 0 0 0 4px rgba(99,102,241,0.35);
        z-index: 2147483641;
        pointer-events: none;
      `;

      // Make the target element clickable above the backdrop
      const step = this.steps[index];
      if (this.isClickToAdvance(step)) {
        target.style.position = target.style.position || 'relative';
        target.style.zIndex = '2147483642';
        target.style.pointerEvents = 'auto';

        const handler = (): void => {
          target.removeEventListener('click', handler);
          // Reset z-index
          target.style.zIndex = '';
          this.targetClickCleanup = null;

          const isLast = index === total - 1;
          if (isLast) {
            if (this.workflowId && this.onStepCompleted) {
              this.onStepCompleted(this.workflowId, index, true);
            }
            this.destroy();
          } else {
            // Wait briefly for navigation/render before advancing
            setTimeout(() => this.showStep(index + 1), 400);
          }
        };
        target.addEventListener('click', handler);
        this.targetClickCleanup = () => {
          target.removeEventListener('click', handler);
          target.style.zIndex = '';
        };
      }

      // Notify about spotlight position for collision avoidance
      spotlightChangeCallback?.({ top: t, left: l, bottom: b, right: r });

      // Show tooltip anchored to the target element
      this.removeTooltip();
      const currentStep = this.steps[index];
      const hint = this.getActionHint(currentStep);
      const displayMsg = hint ? `${hint} ${currentStep.message}` : currentStep.message;
      const tooltip = this.buildTooltip(displayMsg, index, total, target);
      document.body.appendChild(tooltip);
      this.tooltip = tooltip;
    }, 280);
  }

  private clearSpotlight(): void {
    if (this.backdrop) {
      this.backdrop.style.clipPath = 'none';
    }
    if (this.ring && this.ring.parentNode) {
      this.ring.parentNode.removeChild(this.ring);
      this.ring = null;
    }
  }

  private waitForElement(selector: string, timeoutMs: number, cb: (el: HTMLElement | null) => void): void {
    const observer = new MutationObserver(() => {
      const el = safeQuerySelector(selector);
      if (el) { observer.disconnect(); cb(el); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); cb(null); }, timeoutMs);
  }

  private buildTooltip(
    message: string,
    index: number,
    total: number,
    target: HTMLElement | null,
  ): HTMLElement {
    const tooltip = document.createElement('div');
    tooltip.id = TOUR_TOOLTIP_ID;

    // Positioning
    let top = 0;
    let left = 0;
    const TOOLTIP_WIDTH = 280;
    const OFFSET = 12;

    if (target) {
      const rect = target.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const tooltipHeight = 130; // approximate
      if (spaceBelow >= tooltipHeight + OFFSET) {
        top = rect.bottom + window.scrollY + OFFSET;
      } else {
        top = rect.top + window.scrollY - tooltipHeight - OFFSET;
      }
      left = Math.max(
        8,
        Math.min(
          rect.left + window.scrollX,
          window.innerWidth - TOOLTIP_WIDTH - 8,
        ),
      );
    } else {
      top = window.innerHeight / 2 + window.scrollY - 65;
      left = window.innerWidth / 2 - TOOLTIP_WIDTH / 2;
    }

    tooltip.style.cssText = `
      position: absolute;
      top: ${top}px;
      left: ${left}px;
      width: ${TOOLTIP_WIDTH}px;
      background: #ffffff;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      pointer-events: all;
    `;

    // Step counter
    const counter = document.createElement('p');
    counter.textContent = `Step ${index + 1} of ${total}`;
    counter.style.cssText = `
      margin: 0 0 6px 0;
      font-size: 11px;
      font-weight: 600;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    `;

    // Message
    const msg = document.createElement('p');
    msg.textContent = message;
    msg.style.cssText = `
      margin: 0 0 14px 0;
      font-size: 13px;
      color: #1e293b;
      line-height: 1.5;
    `;

    // Button row
    const btnRow = document.createElement('div');
    btnRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const skipBtn = document.createElement('button');
    skipBtn.textContent = 'Skip tour';
    skipBtn.style.cssText = `
      background: transparent;
      border: none;
      font-size: 12px;
      color: #94a3b8;
      cursor: pointer;
      padding: 6px 0;
      font-family: inherit;
    `;
    skipBtn.addEventListener('mouseenter', () => {
      skipBtn.style.color = '#64748b';
    });
    skipBtn.addEventListener('mouseleave', () => {
      skipBtn.style.color = '#94a3b8';
    });
    skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.destroy();
    });

    const isLast = index === total - 1;
    const step = this.steps[index];
    const clickAdvance = this.isClickToAdvance(step) && target !== null;

    btnRow.appendChild(skipBtn);

    if (clickAdvance || isLast) {
      // No Next/Done button — user clicks the element or anywhere to advance/dismiss
      const hint = document.createElement('span');
      hint.textContent = isLast ? 'Click anywhere to dismiss' : 'Click the highlighted element';
      hint.style.cssText = `
        font-size: 11px;
        color: #94a3b8;
        font-style: italic;
        font-family: inherit;
      `;
      btnRow.appendChild(hint);

      // For last step: dismiss on any click anywhere
      if (isLast) {
        setTimeout(() => {
          const dismissHandler = (): void => {
            document.removeEventListener('click', dismissHandler, true);
            if (this.workflowId && this.onStepCompleted) {
              this.onStepCompleted(this.workflowId, index, true);
            }
            this.destroy();
          };
          document.addEventListener('click', dismissHandler, { capture: true, once: true });
        }, 300);
      }
    } else {
      // Show Next button for non-clickable steps (input, wait, verify)
      const nextBtn = document.createElement('button');
      nextBtn.textContent = 'Next \u2192';
      nextBtn.style.cssText = `
        background: #6366f1;
        color: #ffffff;
        border: none;
        border-radius: 8px;
        padding: 7px 16px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
        transition: background 0.15s;
      `;
      nextBtn.addEventListener('mouseenter', () => {
        nextBtn.style.background = '#4f46e5';
      });
      nextBtn.addEventListener('mouseleave', () => {
        nextBtn.style.background = '#6366f1';
      });
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showStep(this.stepIndex + 1);
      });
      btnRow.appendChild(nextBtn);
    }

    tooltip.appendChild(counter);
    tooltip.appendChild(msg);
    tooltip.appendChild(btnRow);

    return tooltip;
  }

  // clearSpotlight is defined above near spotlightTarget

  private removeTooltip(): void {
    if (this.tooltip && this.tooltip.parentNode) {
      this.tooltip.parentNode.removeChild(this.tooltip);
    }
    this.tooltip = null;
  }

  destroy(): void {
    if (this.targetClickCleanup) { this.targetClickCleanup(); this.targetClickCleanup = null; }
    this.clearSpotlight();
    this.removeTooltip();

    if (this.backdrop && this.backdrop.parentNode) {
      this.backdrop.parentNode.removeChild(this.backdrop);
    }
    this.backdrop = null;
    if (this.ring && this.ring.parentNode) {
      this.ring.parentNode.removeChild(this.ring);
    }
    this.ring = null;

    spotlightChangeCallback?.(null);
    document.removeEventListener('keydown', this.keyHandler);
    this.onDone();
  }
}
