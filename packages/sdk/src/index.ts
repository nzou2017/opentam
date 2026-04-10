// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { InterventionCommand, FrustrationSignals } from '@opentam/shared';
import { Observer } from './observer.js';
import { Transport } from './transport.js';
import { Actor } from './actor.js';
import { QUI } from './ui.js';
import { DOMMapper } from './mapper.js';
import { PathRecorder } from './pathRecorder.js';
import { QState } from './state.js';

const DEFAULT_BACKEND_URL = 'https://api.useq.dev';
const DEFAULT_COOLDOWN_HOURS = 24;

export interface QOptions {
  userId?: string;
  backendUrl?: string;
  cooldownHours?: number;
  layout?: 'popup' | 'panel';
  thresholds?: Partial<{
    rageClicks: number;
    dwellSeconds: number;
    cursorEntropy: number;
  }>;
}

function generateSessionId(): string {
  const stored = sessionStorage.getItem('q_session_id');
  if (stored) return stored;
  const id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem('q_session_id', id);
  return id;
}

/**
 * Resolve tenant ID from SDK key.
 * The backend is authoritative — it resolves the real tenant from the SDK key.
 * The client-side tenantId is only used for local grouping; the backend ignores it.
 */
function resolveTenantId(sdkKey: string): string {
  return sdkKey;
}

let initialized = false;
let observer: Observer | null = null;
let transport: Transport | null = null;
let actor: Actor | null = null;
let ui: QUI | null = null;
let mapper: DOMMapper | null = null;
let pathRecorder: PathRecorder | null = null;
let state: QState | null = null;

const Q = {
  init(sdkKey: string, options: QOptions = {}): void {
    if (initialized) {
      console.warn('[Q] Already initialized.');
      return;
    }
    initialized = true;

    const backendUrl = options.backendUrl ?? DEFAULT_BACKEND_URL;
    const cooldownHours = options.cooldownHours ?? DEFAULT_COOLDOWN_HOURS;
    const layout = options.layout ?? 'popup';
    const tenantId = resolveTenantId(sdkKey);
    const sessionId = generateSessionId();

    const thresholds = {
      rageClicks: options.thresholds?.rageClicks ?? 3,
      dwellSeconds: options.thresholds?.dwellSeconds ?? 120,
      cursorEntropy: options.thresholds?.cursorEntropy ?? 7,
    };

    state = new QState(tenantId);

    transport = new Transport({
      sdkKey,
      tenantId,
      sessionId,
      userId: options.userId,
      backendUrl,
    });

    actor = new Actor({
      tenantId,
      sdkKey,
      cooldownHours,
      transport,
      isDisabled: () => state!.disabled,
      onMessage: () => { /* messages live in chat widget now */ },
      onStepCompleted: (workflowId: string, stepIndex: number, completed: boolean) => {
        transport!.reportStepCompletion(workflowId, stepIndex, completed);
      },
      onSpotlightChange: (rect) => {
        ui?.adjustForSpotlight(rect);
      },
    });

    ui = new QUI({
      layout,
      state,
      onAction: (command: InterventionCommand) => {
        actor!.execute(command);
      },
      onSendMessage: (text: string, history: { role: 'user' | 'assistant'; content: string }[]) => {
        return transport!.sendChat(text, history);
      },
      onTranscribe: (audioBase64: string, mimeType: string) => {
        return transport!.sendTranscribe(audioBase64, mimeType);
      },
    });

    pathRecorder = new PathRecorder((events) => {
      transport!.sendSessionPath(events);
    });

    observer = new Observer({
      thresholds,
      isDisabled: () => state!.disabled,
      onThresholdCrossed: (_signals: FrustrationSignals) => {
        ui!.showGreeting();
      },
      onClickRecorded: (url: string, selector: string) => {
        pathRecorder!.record(url, selector);
      },
    });

    // Wire state changes to observer/ui
    state.onChange((disabled) => {
      if (disabled) {
        observer?.stop();
      } else {
        observer?.start();
      }
      ui?.setDisabledAppearance(disabled);
    });

    mapper = new DOMMapper({ backendUrl, sdkKey, tenantId, sessionId });
    mapper.watchRouteChanges();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        ui!.mount();
        if (!state!.disabled) {
          observer!.start();
        }
        ui!.setDisabledAppearance(state!.disabled);
        mapper!.scan();
      });
    } else {
      ui.mount();
      if (!state.disabled) {
        observer.start();
      }
      ui.setDisabledAppearance(state.disabled);
      mapper.scan();
    }

    // Flush path data on session end
    window.addEventListener('beforeunload', () => {
      pathRecorder?.flush();
    });

    (window as unknown as Record<string, unknown>)['__q_observer__'] = observer;

    console.info(`[Q] Initialized. tenant=${tenantId} session=${sessionId}`);
  },

  simulate(): void {
    if (!observer) {
      console.warn('[Q] Not initialized. Call Q.init() first.');
      return;
    }
    observer.simulateFrustration();
  },
};

// Explicitly assign to window so minification can't shadow the global name
(window as unknown as Record<string, unknown>)['Q'] = Q;

export default Q;
