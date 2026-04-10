// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FrustrationEvent, FrustrationSignals, InterventionCommand } from '@opentam/shared';

const DEBOUNCE_MS = 500;

export interface TransportConfig {
  sdkKey: string;
  tenantId: string;
  sessionId: string;
  userId?: string;
  backendUrl: string;
}

function captureDomSnapshot(): string {
  // Privacy-safe snapshot: only IDs, classes, aria-labels, and data-* attributes
  // No text content captured
  const elements = document.querySelectorAll('[id], [class], [aria-label], [data-*]');
  const snapEntries: string[] = [];

  // Walk all elements and collect metadata
  const allElements = document.querySelectorAll('*');
  let count = 0;
  allElements.forEach((el) => {
    if (count >= 200) return; // Cap at 200 elements for payload size
    const attrs: Record<string, string> = {};

    if (el.id) attrs['id'] = el.id;
    if (el.className && typeof el.className === 'string' && el.className.trim()) {
      attrs['class'] = el.className.trim().split(/\s+/).slice(0, 5).join(' ');
    }
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) attrs['aria-label'] = ariaLabel;

    // Collect data-* attributes
    Array.from(el.attributes).forEach((attr) => {
      if (attr.name.startsWith('data-')) {
        attrs[attr.name] = attr.value;
      }
    });

    if (Object.keys(attrs).length > 0) {
      const tag = el.tagName.toLowerCase();
      const attrStr = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      snapEntries.push(`<${tag} ${attrStr}>`);
      count++;
    }
  });

  return snapEntries.join('\n');
}

export class Transport {
  private config: TransportConfig;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: TransportConfig) {
    this.config = config;
  }

  scheduleEvent(signals: FrustrationSignals): void {
    // Debounce: cancel any pending send and reschedule
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.sendEvent(signals).catch((err) => {
        console.warn('[Q] Failed to send frustration event:', err);
      });
    }, DEBOUNCE_MS);
  }

  private async sendEvent(signals: FrustrationSignals): Promise<InterventionCommand | null> {
    const event: FrustrationEvent = {
      tenantId: this.config.tenantId,
      sessionId: this.config.sessionId,
      userId: this.config.userId,
      currentUrl: window.location.href,
      signals,
      domSnapshot: captureDomSnapshot(),
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(`${this.config.backendUrl}/api/v1/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.sdkKey}`,
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      throw new Error(`Q backend returned ${response.status}`);
    }

    const data = (await response.json()) as { intervention: InterventionCommand | null };
    return data.intervention;
  }

  async sendAndGetIntervention(signals: FrustrationSignals): Promise<InterventionCommand | null> {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    try {
      return await this.sendEvent(signals);
    } catch (err) {
      console.warn('[Q] Failed to send frustration event:', err);
      return null;
    }
  }

  async sendTranscribe(audioBase64: string, mimeType: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.config.backendUrl}/api/v1/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.sdkKey}`,
        },
        body: JSON.stringify({ audio: audioBase64, mimeType }),
      });
      if (!response.ok) throw new Error(`Transcribe API returned ${response.status}`);
      const data = (await response.json()) as { text: string };
      return data.text ?? null;
    } catch (err) {
      console.warn('[Q] Transcription request failed:', err);
      return null;
    }
  }

  async sendSessionPath(events: Array<{ url: string; selector: string; timestamp: number }>): Promise<void> {
    try {
      await fetch(`${this.config.backendUrl}/api/v1/paths`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.sdkKey}`,
        },
        body: JSON.stringify({
          sessionId: this.config.sessionId,
          events,
        }),
      });
    } catch {
      // Best-effort — never block the host app
    }
  }

  async reportStepCompletion(workflowId: string, stepIndex: number, completed: boolean): Promise<void> {
    try {
      await fetch(`${this.config.backendUrl}/api/v1/workflows/${workflowId}/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.sdkKey}`,
        },
        body: JSON.stringify({
          sessionId: this.config.sessionId,
          stepIndex,
          completed,
        }),
      });
    } catch {
      // Best-effort
    }
  }

  async submitSurveyResponse(surveyId: string, answers: Record<string, unknown>): Promise<void> {
    try {
      await fetch(`${this.config.backendUrl}/api/v1/surveys/${surveyId}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.sdkKey}`,
        },
        body: JSON.stringify({
          sessionId: this.config.sessionId,
          answers,
        }),
      });
    } catch {
      // Best-effort — never block the host app
    }
  }

  async sendChat(
    message: string,
    history?: { role: 'user' | 'assistant'; content: string }[],
  ): Promise<{ reply: string; intervention?: InterventionCommand } | null> {
    try {
      const response = await fetch(`${this.config.backendUrl}/api/v1/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.sdkKey}`,
        },
        body: JSON.stringify({
          tenantId: this.config.tenantId,
          sessionId: this.config.sessionId,
          message,
          currentUrl: window.location.href,
          history,
        }),
      });
      if (!response.ok) throw new Error(`Chat API returned ${response.status}`);
      return (await response.json()) as { reply: string; intervention?: InterventionCommand };
    } catch (err) {
      console.warn('[Q] Chat request failed:', err);
      return null;
    }
  }
}
