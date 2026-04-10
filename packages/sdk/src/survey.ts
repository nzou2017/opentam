// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { SurveyQuestion } from '@opentam/shared';
import type { Transport } from './transport.js';

const PANEL_ID = 'q-survey-panel';

export class SurveyPanel {
  private questions: SurveyQuestion[];
  private surveyId: string;
  private transport: Transport;
  private onComplete?: () => void;
  private panel: HTMLElement | null = null;
  private answers: Record<string, string | number | string[]> = {};

  constructor(
    questions: SurveyQuestion[],
    surveyId: string,
    transport: Transport,
    onComplete?: () => void,
  ) {
    this.questions = questions;
    this.surveyId = surveyId;
    this.transport = transport;
    this.onComplete = onComplete;
  }

  show(): void {
    this.hide(); // Remove any existing panel

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 360px;
      max-height: 80vh;
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
      z-index: 2147483646;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: q-survey-slide-up 0.3s ease-out;
    `;

    // Inject animation keyframe
    if (!document.getElementById('q-survey-keyframes')) {
      const style = document.createElement('style');
      style.id = 'q-survey-keyframes';
      style.textContent = `
        @keyframes q-survey-slide-up {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid #f1f5f9;
    `;

    const title = document.createElement('span');
    title.textContent = 'Quick Feedback';
    title.style.cssText = `
      font-size: 15px;
      font-weight: 600;
      color: #1e293b;
    `;

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      font-size: 22px;
      color: #94a3b8;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
      font-family: inherit;
    `;
    closeBtn.addEventListener('click', () => this.hide());

    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Body (scrollable)
    const body = document.createElement('div');
    body.style.cssText = `
      padding: 16px 20px;
      overflow-y: auto;
      flex: 1;
    `;

    for (const q of this.questions) {
      const questionEl = this.renderQuestion(q);
      body.appendChild(questionEl);
    }

    panel.appendChild(body);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 12px 20px;
      border-top: 1px solid #f1f5f9;
    `;

    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Submit';
    submitBtn.style.cssText = `
      width: 100%;
      padding: 10px 16px;
      background: #f59e0b;
      color: #ffffff;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.15s;
    `;
    submitBtn.addEventListener('mouseenter', () => { submitBtn.style.background = '#d97706'; });
    submitBtn.addEventListener('mouseleave', () => { submitBtn.style.background = '#f59e0b'; });
    submitBtn.addEventListener('click', () => this.submit());

    footer.appendChild(submitBtn);
    panel.appendChild(footer);

    // Click outside to dismiss
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2147483645;
    `;
    backdrop.addEventListener('click', () => this.hide());
    document.body.appendChild(backdrop);

    document.body.appendChild(panel);
    this.panel = panel;
  }

  hide(): void {
    document.getElementById(PANEL_ID)?.remove();
    // Remove backdrop if it exists (the invisible click-outside layer)
    const existing = document.querySelector('[style*="z-index: 2147483645"]');
    existing?.remove();
    this.panel = null;
  }

  private renderQuestion(q: SurveyQuestion): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-bottom: 20px;';

    const label = document.createElement('p');
    label.textContent = q.text + (q.required ? ' *' : '');
    label.style.cssText = `
      margin: 0 0 8px 0;
      font-size: 13px;
      font-weight: 500;
      color: #334155;
      line-height: 1.4;
    `;
    wrapper.appendChild(label);

    switch (q.type) {
      case 'rating':
        wrapper.appendChild(this.renderRating(q));
        break;
      case 'single_choice':
        wrapper.appendChild(this.renderSingleChoice(q));
        break;
      case 'multi_choice':
        wrapper.appendChild(this.renderMultiChoice(q));
        break;
      case 'text':
        wrapper.appendChild(this.renderText(q));
        break;
    }

    return wrapper;
  }

  private renderRating(q: SurveyQuestion): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 6px;';

    const max = q.max ?? 5;
    const style = q.ratingStyle ?? 'stars';
    const emojis = ['\u{1F61F}', '\u{1F615}', '\u{1F610}', '\u{1F642}', '\u{1F60A}'];

    for (let i = 1; i <= max; i++) {
      const btn = document.createElement('button');
      btn.style.cssText = `
        background: none;
        border: none;
        font-size: ${style === 'emoji' ? '24px' : '22px'};
        cursor: pointer;
        padding: 4px;
        opacity: 0.4;
        transition: opacity 0.15s, transform 0.15s;
      `;

      if (style === 'emoji') {
        btn.textContent = emojis[i - 1] ?? emojis[emojis.length - 1];
      } else {
        // Star SVG
        btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style="color: #f59e0b;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
      }

      btn.addEventListener('click', () => {
        this.answers[q.id] = i;
        // Update visual state
        const siblings = container.querySelectorAll('button');
        siblings.forEach((s, idx) => {
          s.style.opacity = idx < i ? '1' : '0.4';
          s.style.transform = idx < i ? 'scale(1.1)' : 'scale(1)';
        });
      });

      btn.addEventListener('mouseenter', () => {
        const siblings = container.querySelectorAll('button');
        siblings.forEach((s, idx) => {
          s.style.opacity = idx <= (i - 1) ? '0.8' : '0.4';
        });
      });

      btn.addEventListener('mouseleave', () => {
        const selected = (this.answers[q.id] as number) ?? 0;
        const siblings = container.querySelectorAll('button');
        siblings.forEach((s, idx) => {
          s.style.opacity = idx < selected ? '1' : '0.4';
        });
      });

      container.appendChild(btn);
    }

    return container;
  }

  private renderSingleChoice(q: SurveyQuestion): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';

    const name = `q-survey-sc-${q.id}`;

    for (const opt of (q.options ?? [])) {
      const label = document.createElement('label');
      label.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        cursor: pointer;
        font-size: 13px;
        color: #334155;
        transition: border-color 0.15s;
      `;

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = name;
      radio.value = opt;
      radio.style.cssText = 'accent-color: #f59e0b;';
      radio.addEventListener('change', () => {
        this.answers[q.id] = opt;
        // Highlight selected
        container.querySelectorAll('label').forEach(l => {
          l.style.borderColor = '#e2e8f0';
          l.style.background = 'transparent';
        });
        label.style.borderColor = '#f59e0b';
        label.style.background = 'rgba(245,158,11,0.06)';
      });

      const text = document.createElement('span');
      text.textContent = opt;

      label.appendChild(radio);
      label.appendChild(text);
      container.appendChild(label);
    }

    return container;
  }

  private renderMultiChoice(q: SurveyQuestion): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';

    this.answers[q.id] = [];

    for (const opt of (q.options ?? [])) {
      const label = document.createElement('label');
      label.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        cursor: pointer;
        font-size: 13px;
        color: #334155;
        transition: border-color 0.15s;
      `;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = opt;
      checkbox.style.cssText = 'accent-color: #f59e0b;';
      checkbox.addEventListener('change', () => {
        const current = (this.answers[q.id] as string[]) ?? [];
        if (checkbox.checked) {
          this.answers[q.id] = [...current, opt];
          label.style.borderColor = '#f59e0b';
          label.style.background = 'rgba(245,158,11,0.06)';
        } else {
          this.answers[q.id] = current.filter(v => v !== opt);
          label.style.borderColor = '#e2e8f0';
          label.style.background = 'transparent';
        }
      });

      const text = document.createElement('span');
      text.textContent = opt;

      label.appendChild(checkbox);
      label.appendChild(text);
      container.appendChild(label);
    }

    return container;
  }

  private renderText(q: SurveyQuestion): HTMLElement {
    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Your feedback...';
    textarea.style.cssText = `
      width: 100%;
      min-height: 70px;
      padding: 10px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 13px;
      font-family: inherit;
      color: #334155;
      resize: vertical;
      box-sizing: border-box;
      outline: none;
      transition: border-color 0.15s;
    `;
    textarea.addEventListener('focus', () => { textarea.style.borderColor = '#f59e0b'; });
    textarea.addEventListener('blur', () => { textarea.style.borderColor = '#e2e8f0'; });
    textarea.addEventListener('input', () => {
      this.answers[q.id] = textarea.value;
    });
    return textarea;
  }

  private submit(): void {
    this.transport.submitSurveyResponse(this.surveyId, this.answers);
    this.hide();
    this.onComplete?.();
  }
}
