// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

interface DiscoveredEntry {
  feature: string;
  url: string;
  selector: string;
}

export interface MapperConfig {
  backendUrl: string;
  sdkKey: string;
  tenantId: string;
  sessionId: string;
}

export class DOMMapper {
  private config: MapperConfig;
  private reported = new Set<string>(); // selectors already sent this session

  constructor(config: MapperConfig) {
    this.config = config;
  }

  /** Scan current DOM and report new entries to backend. Call after each navigation. */
  scan(): void {
    const entries = this.discover();
    const fresh = entries.filter((e) => !this.reported.has(e.selector));
    if (fresh.length === 0) return;
    fresh.forEach((e) => this.reported.add(e.selector));
    this.report(fresh);
  }

  /** Patch history.pushState + popstate so SPA navigations trigger a re-scan. */
  watchRouteChanges(): void {
    const orig = history.pushState.bind(history);
    history.pushState = (...args) => {
      orig(...args);
      // Wait one tick for the framework to render new DOM
      setTimeout(() => this.scan(), 150);
    };
    window.addEventListener('popstate', () => setTimeout(() => this.scan(), 150));
  }

  private discover(): DiscoveredEntry[] {
    const seen = new Set<string>();
    const entries: DiscoveredEntry[] = [];
    const currentUrl = window.location.pathname + window.location.search;

    const addEntry = (feature: string, selector: string): void => {
      if (seen.has(selector)) return;
      seen.add(selector);
      entries.push({ feature, url: currentUrl, selector });
    };

    // 1. Internal anchor links (nav items, sidebar, breadcrumbs)
    document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((el) => {
      const href = el.getAttribute('href') ?? '';
      if (!href || href.startsWith('http') || href.startsWith('//') || href === '#') return;
      const text = el.textContent?.trim() ?? '';
      if (!text) return;
      // Use href-based selector so it matches on any page (sidebar links are always in DOM)
      addEntry(text, `a[href="${href}"]`);
    });

    // 2. Tab elements — ARIA [role="tab"], [role="tablist"] buttons, and CSS-class-based tabs
    const tabSelectors = [
      '[role="tab"]',
      '[role="tablist"] button',
      '[class*="tab" i] > button',           // buttons inside a tab container (.agent-tabs, .nav-tabs, etc.)
      'button[class*="tab" i]',              // buttons with "tab" in their class (.agent-tab, .tab-item, etc.)
    ];
    const tabEls = new Set<HTMLElement>();
    for (const sel of tabSelectors) {
      try { document.querySelectorAll<HTMLElement>(sel).forEach((el) => tabEls.add(el)); } catch { /* invalid selector in old browsers */ }
    }
    tabEls.forEach((el) => {
      const text = el.textContent?.trim().replace(/\s+/g, ' ') ?? '';
      if (!text || text.length <= 1) return;
      const selector = this.buildStableSelector(el);
      if (selector) addEntry(`${text} tab`, selector);
    });

    // 3. Significant buttons on the current page (skip generic labels)
    const SKIP_LABELS = new Set(['ok', 'cancel', 'close', 'save', 'submit', 'yes', 'no', 'delete', 'remove', 'edit', 'back', 'next', 'done', 'confirm']);
    document.querySelectorAll<HTMLButtonElement>('button').forEach((el) => {
      const text = el.textContent?.trim() ?? '';
      // Only include buttons with meaningful labels (>2 chars, not in skip list)
      if (!text || text.length <= 2 || SKIP_LABELS.has(text.toLowerCase())) return;
      // Skip buttons already covered by tab discovery above
      if (el.closest('[role="tablist"]') || tabEls.has(el)) return;
      const selector = this.buildStableSelector(el);
      if (selector) addEntry(text, selector);
    });

    return entries;
  }

  /**
   * Build a stable CSS selector for an element, preferring id > data-* > aria-label > text match.
   * Returns null if no stable selector can be derived.
   */
  private buildStableSelector(el: HTMLElement): string | null {
    if (el.id) return `#${CSS.escape(el.id)}`;

    // data-* attributes are often stable identifiers
    for (const attr of ['data-tab', 'data-testid', 'data-id', 'data-key', 'data-value']) {
      const val = el.getAttribute(attr);
      if (val) return `${el.tagName.toLowerCase()}[${attr}="${CSS.escape(val)}"]`;
    }

    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(ariaLabel)}"]`;

    const text = el.textContent?.trim() ?? '';
    if (!text) return null;

    // For role=tab, match by role + text content via :has (not universally supported) — fall back to nth-of-type
    const role = el.getAttribute('role');
    if (role) {
      if (el.classList.length > 0) {
        const cls = Array.from(el.classList).find((c) => c.length > 2 && !c.match(/^(active|selected|current|hover|focus|disabled)$/i));
        if (cls) return `[role="${role}"].${CSS.escape(cls)}`;
      }
    }

    // Fallback: meaningful CSS class + nth-child for positional stability (tabs, toolbar buttons, etc.)
    if (el.classList.length > 0 && el.parentElement) {
      const cls = Array.from(el.classList).find((c) => c.length > 2 && !c.match(/^(active|selected|current|hover|focus|disabled|open|show|hidden)$/i));
      if (cls) {
        const siblings = Array.from(el.parentElement.children);
        const idx = siblings.indexOf(el) + 1;
        const parentCls = Array.from(el.parentElement.classList).find((c) => c.length > 2);
        if (parentCls) {
          return `.${CSS.escape(parentCls)} > .${CSS.escape(cls)}:nth-child(${idx})`;
        }
      }
    }

    return null;
  }

  private async report(entries: DiscoveredEntry[]): Promise<void> {
    try {
      await fetch(`${this.config.backendUrl}/api/v1/map/discover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.sdkKey}`,
        },
        body: JSON.stringify({
          tenantId: this.config.tenantId,
          entries,
        }),
      });
    } catch {
      // Best-effort — never block the host app
    }
  }
}
