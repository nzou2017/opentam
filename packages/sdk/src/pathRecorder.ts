// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

export interface PathEvent {
  url: string;        // pathname only, no query params with PII
  selector: string;   // CSS selector of clicked element (stable selectors only)
  timestamp: number;  // relative to session start (not wall clock)
}

const MAX_EVENTS = 100;

export class PathRecorder {
  private events: PathEvent[] = [];
  private sessionStart: number = Date.now();
  private onFlush: (events: PathEvent[]) => void;

  constructor(onFlush: (events: PathEvent[]) => void) {
    this.onFlush = onFlush;
  }

  record(url: string, selector: string): void {
    // Deduplicate consecutive same-URL/same-selector events
    const last = this.events[this.events.length - 1];
    if (last && last.url === url && last.selector === selector) return;

    const event: PathEvent = {
      url,
      selector,
      timestamp: Date.now() - this.sessionStart,
    };

    if (this.events.length >= MAX_EVENTS) {
      // Ring buffer: drop oldest
      this.events.shift();
    }
    this.events.push(event);
  }

  flush(): void {
    if (this.events.length === 0) return;
    const events = [...this.events];
    this.events = [];
    this.sessionStart = Date.now();
    this.onFlush(events);
  }

  getEvents(): PathEvent[] {
    return [...this.events];
  }
}
