// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { InterventionCommand } from '@opentam/shared';
import type { QState } from './state.js';
import type { SpotlightRect } from './actor.js';

export interface UICallbacks {
  layout?: 'popup' | 'panel';
  state?: QState;
  onAction: (command: InterventionCommand) => void;
  onSendMessage: (text: string, history: { role: 'user' | 'assistant'; content: string }[]) => Promise<{ reply: string; intervention?: InterventionCommand } | null>;
  onTranscribe: (audioBase64: string, mimeType: string) => Promise<string | null>;
}

const ROOT_ID = 'q-chat-root';

/** Minimal markdown → safe HTML (no external deps, no XSS risk via textContent escaping first). */
function renderMarkdown(text: string): string {
  // Escape HTML first so user/LLM content can't inject tags
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    // Bold: **text**
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic: *text* or _text_  (not inside words)
    .replace(/(?<![a-zA-Z])\*([^*\n]+)\*(?![a-zA-Z])/g, '<em>$1</em>')
    .replace(/(?<![a-zA-Z])_([^_\n]+)_(?![a-zA-Z])/g, '<em>$1</em>')
    // Inline code: `text`
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    // Bullet list items (lines starting with - or •)
    .replace(/^[\-•] (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/(<li>.*<\/li>(\n|$))+/gs, (match) => `<ul>${match}</ul>`)
    // Line breaks
    .replace(/\n/g, '<br>');
}

type MessageRole = 'assistant' | 'user';

interface ChatMessage {
  role: MessageRole;
  text: string;
  intervention?: InterventionCommand;
}

const CSS = `
  /* ── Design tokens (light mode defaults) ── */
  #q-chat-root {
    --q-accent:        #6366f1;
    --q-accent-dark:   #4f46e5;
    --q-accent-muted:  rgba(99,102,241,0.15);
    --q-accent-text:   #5b21b6;
    --q-panel-bg:      #ffffff;
    --q-panel-border:  rgba(0,0,0,0.06);
    --q-panel-shadow:  0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
    --q-msg-ai-bg:     #f1f5f9;
    --q-msg-ai-color:  #1e293b;
    --q-code-bg:       #e2e8f0;
    --q-input-bg:      #f8fafc;
    --q-input-border:  #e2e8f0;
    --q-input-color:   #1e293b;
    --q-divider:       #f1f5f9;
    --q-scrollbar:     #e2e8f0;
    --q-placeholder:   #94a3b8;
  }

  /* Dark mode: applied via JS by setting data-q-theme="dark" on #q-chat-root */
  #q-chat-root[data-q-theme="dark"] {
    --q-panel-bg:      #1e293b;
    --q-panel-border:  rgba(255,255,255,0.08);
    --q-panel-shadow:  0 8px 40px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3);
    --q-msg-ai-bg:     #0f172a;
    --q-msg-ai-color:  #e2e8f0;
    --q-code-bg:       #1e293b;
    --q-input-bg:      #0f172a;
    --q-input-border:  #334155;
    --q-input-color:   #e2e8f0;
    --q-divider:       #1e293b;
    --q-scrollbar:     #334155;
    --q-placeholder:   #64748b;
    --q-accent-muted:  rgba(99,102,241,0.25);
    --q-accent-text:   #a5b4fc;
  }

  #q-chat-root * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }

  /* iOS 26 Liquid Glass — animate the conic-gradient start angle directly via @property */
  @property --q-angle {
    syntax: '<angle>';
    inherits: false;
    initial-value: 0deg;
  }
  @keyframes q-border-spin {
    to { --q-angle: 360deg; }
  }
  @keyframes q-pulse {
    0%   { box-shadow: 0 0 0 0 rgba(167,139,250,0.7); }
    100% { box-shadow: 0 0 0 18px rgba(167,139,250,0); }
  }

  /* iOS 26 Liquid Glass colors: iridescent prism on deep navy */
  #q-bubble {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    color: #fff;
    font-size: 20px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 2147483645;
    user-select: none;
    transition: transform 0.15s;
    outline: none;
    /* 3px transparent border creates the gap padding-box/border-box renders into */
    border: 3px solid transparent;
    --q-angle: 0deg;
    animation: q-border-spin 4s linear infinite;
    background:
      linear-gradient(#0a0a1a, #0a0a1a) padding-box,
      conic-gradient(
        from var(--q-angle),
        #c4b5fd 0deg, #818cf8 60deg, #38bdf8 120deg,
        #34d399 180deg, #fb923c 240deg, #f472b6 300deg, #c4b5fd 360deg
      ) border-box;
  }
  #q-bubble:hover { transform: scale(1.08); }
  /* Glow bloom */
  #q-bubble::after {
    content: '';
    position: absolute;
    inset: -6px;
    border-radius: 50%;
    background: conic-gradient(
      from var(--q-angle),
      #c4b5fd40 0deg, #818cf840 60deg, #38bdf840 120deg,
      #34d39940 180deg, #fb923c40 240deg, #f472b640 300deg, #c4b5fd40 360deg
    );
    filter: blur(10px);
    z-index: -1;
    pointer-events: none;
  }
  /* Pulse ring on frustration trigger */
  #q-bubble.pulse {
    animation: q-border-spin 4s linear infinite, q-pulse 1.4s ease-out 3;
  }

  /* Panel outer wrapper — @property animated gradient border, no element rotation */
  #q-panel-outer {
    position: fixed;
    bottom: 86px;
    right: 24px;
    border-radius: 18px;
    z-index: 2147483646;
    --q-angle: 0deg;
    /* 2px transparent border is the visible gap the gradient shows through */
    border: 2px solid transparent;
    background:
      linear-gradient(var(--q-panel-bg), var(--q-panel-bg)) padding-box,
      conic-gradient(
        from var(--q-angle),
        #c4b5fd 0deg, #818cf8 60deg, #38bdf8 120deg,
        #34d399 180deg, #fb923c 240deg, #f472b6 300deg, #c4b5fd 360deg
      ) border-box;
    animation: q-border-spin 4s linear infinite, q-panel-in 0.22s cubic-bezier(0.34,1.56,0.64,1);
    transform-origin: bottom right;
    box-shadow: 0 0 28px 6px rgba(167,139,250,0.25), 0 8px 40px rgba(0,0,0,0.22);
  }
  #q-panel {
    width: 360px;
    height: 520px;
    background: var(--q-panel-bg);
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  @keyframes q-panel-in {
    from { transform: scale(0.85); opacity: 0; }
    to   { transform: scale(1);    opacity: 1; }
  }

  #q-header {
    background: linear-gradient(135deg, var(--q-accent), var(--q-accent-dark));
    color: #fff;
    padding: 14px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
  #q-header-icon {
    width: 32px; height: 32px;
    background: rgba(255,255,255,0.2);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; font-weight: 800;
    flex-shrink: 0;
  }
  #q-header-text { flex: 1; }
  #q-header-title { font-size: 14px; font-weight: 700; }
  #q-header-sub { font-size: 11px; opacity: 0.75; margin-top: 1px; }
  #q-close-btn {
    background: rgba(255,255,255,0.15);
    border: none;
    color: #fff;
    width: 28px; height: 28px;
    border-radius: 50%;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px;
    transition: background 0.15s;
    flex-shrink: 0;
  }
  #q-close-btn:hover { background: rgba(255,255,255,0.25); }

  #q-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    scroll-behavior: smooth;
    background: var(--q-panel-bg);
  }
  #q-messages::-webkit-scrollbar { width: 4px; }
  #q-messages::-webkit-scrollbar-track { background: transparent; }
  #q-messages::-webkit-scrollbar-thumb { background: var(--q-scrollbar); border-radius: 2px; }

  .q-msg {
    max-width: 85%;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .q-msg.assistant { align-self: flex-start; }
  .q-msg.user      { align-self: flex-end; }

  .q-bubble-text {
    padding: 10px 13px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.5;
  }
  .q-msg.assistant .q-bubble-text {
    background: var(--q-msg-ai-bg);
    color: var(--q-msg-ai-color);
    border-bottom-left-radius: 4px;
  }
  .q-msg.assistant .q-bubble-text code {
    background: var(--q-code-bg);
    color: var(--q-accent);
    border-radius: 3px;
    padding: 1px 4px;
    font-size: 12px;
    font-family: ui-monospace, monospace;
  }
  .q-msg.assistant .q-bubble-text ul {
    margin: 4px 0 0 0;
    padding-left: 16px;
  }
  .q-msg.assistant .q-bubble-text li { margin-bottom: 3px; }
  .q-msg.assistant .q-bubble-text br + br { display: none; }
  .q-msg.user .q-bubble-text {
    background: linear-gradient(135deg, var(--q-accent), var(--q-accent-dark));
    color: #fff;
    border-bottom-right-radius: 4px;
  }

  .q-action-btn {
    align-self: flex-start;
    margin-top: 4px;
    background: var(--q-accent-muted);
    color: var(--q-accent-text);
    border: none;
    border-radius: 7px;
    padding: 5px 11px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .q-action-btn:hover { opacity: 0.8; }

  .q-typing {
    align-self: flex-start;
    background: var(--q-msg-ai-bg);
    border-radius: 12px;
    border-bottom-left-radius: 4px;
    padding: 10px 14px;
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .q-typing span {
    width: 6px; height: 6px;
    background: var(--q-placeholder);
    border-radius: 50%;
    animation: q-dot 1.2s infinite;
  }
  .q-typing span:nth-child(2) { animation-delay: 0.2s; }
  .q-typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes q-dot {
    0%, 80%, 100% { transform: scale(0.7); opacity: 0.5; }
    40%            { transform: scale(1);   opacity: 1; }
  }

  #q-input-area {
    border-top: 1px solid var(--q-divider);
    padding: 12px;
    display: flex;
    gap: 8px;
    align-items: flex-end;
    flex-shrink: 0;
    background: var(--q-panel-bg);
  }
  #q-input {
    flex: 1;
    border: 1px solid var(--q-input-border);
    border-radius: 10px;
    padding: 9px 12px;
    font-size: 13px;
    color: var(--q-input-color);
    resize: none;
    outline: none;
    min-height: 38px;
    max-height: 90px;
    line-height: 1.4;
    background: var(--q-input-bg);
    transition: border-color 0.15s, background 0.15s;
  }
  #q-input:focus { border-color: var(--q-accent); background: var(--q-panel-bg); }
  #q-input::placeholder { color: var(--q-placeholder); }
  #q-send-btn {
    width: 36px; height: 36px;
    background: linear-gradient(135deg, var(--q-accent), var(--q-accent-dark));
    color: #fff;
    border: none;
    border-radius: 9px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
    transition: transform 0.1s, opacity 0.15s;
  }
  #q-send-btn:hover { transform: scale(1.05); }
  #q-send-btn:disabled { opacity: 0.4; cursor: default; transform: none; }

  /* Disable toggle in header */
  #q-toggle-btn {
    background: rgba(255,255,255,0.15);
    border: none;
    color: #fff;
    width: 28px; height: 28px;
    border-radius: 50%;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
    transition: background 0.15s;
    flex-shrink: 0;
  }
  #q-toggle-btn:hover { background: rgba(255,255,255,0.25); }

  /* Layout toggle in header */
  #q-layout-btn {
    background: rgba(255,255,255,0.15);
    border: none;
    color: #fff;
    width: 28px; height: 28px;
    border-radius: 50%;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
    transition: background 0.15s;
    flex-shrink: 0;
  }
  #q-layout-btn:hover { background: rgba(255,255,255,0.25); }

  /* Disabled bubble state */
  #q-bubble.disabled {
    opacity: 0.5;
    border: 3px solid #6b7280;
    background: linear-gradient(#0a0a1a, #0a0a1a) padding-box, linear-gradient(#6b7280, #6b7280) border-box;
    animation: none;
  }
  #q-bubble.disabled::after {
    display: none;
  }

  /* Panel layout mode */
  #q-panel-outer.panel-mode {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 380px;
    height: 100vh;
    border-radius: 0;
    animation: none;
    box-shadow: -4px 0 20px rgba(0,0,0,0.15);
    border: none;
    background: var(--q-panel-bg);
  }
  #q-panel-outer.panel-mode #q-panel {
    width: 100%;
    height: 100%;
    border-radius: 0;
  }

  /* Mic button */
  #q-mic-btn {
    width: 36px; height: 36px;
    background: transparent;
    border: 1.5px solid var(--q-input-border);
    border-radius: 9px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s, border-color 0.15s, transform 0.1s;
    color: var(--q-placeholder);
    padding: 0;
  }
  #q-mic-btn:hover { border-color: var(--q-accent); color: var(--q-accent); transform: scale(1.05); }
  #q-mic-btn.recording {
    background: #ef4444;
    border-color: #ef4444;
    color: #fff;
    animation: q-mic-pulse 1s ease-in-out infinite;
  }
  #q-mic-btn.transcribing {
    background: var(--q-accent-muted);
    border-color: var(--q-accent);
    color: var(--q-accent);
    cursor: default;
  }
  @keyframes q-mic-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
    50%       { box-shadow: 0 0 0 5px rgba(239,68,68,0); }
  }
`;

const MIC_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>`;
const STOP_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`;

// Web Speech API shim — Chrome/Edge use the prefixed version
type SpeechRecognitionCtor = typeof SpeechRecognition;
const SpeechRecognitionAPI: SpeechRecognitionCtor | null =
  (typeof window !== 'undefined' &&
    ((window as unknown as Record<string, unknown>)['SpeechRecognition'] as SpeechRecognitionCtor ??
     (window as unknown as Record<string, unknown>)['webkitSpeechRecognition'] as SpeechRecognitionCtor)) ||
  null;

/** Read the host app's current theme. Returns true if dark. */
function detectDark(): boolean {
  const html = document.documentElement;
  // 1. Explicit mode attribute (most reliable — set by apps like OpenClaw)
  const mode = html.getAttribute('data-theme-mode') ?? html.getAttribute('data-mode') ?? '';
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  // 2. Common class-based dark mode (Tailwind, etc.)
  if (html.classList.contains('dark')) return true;
  if (html.classList.contains('light')) return false;
  // 3. data-theme named "dark"
  const theme = (html.getAttribute('data-theme') ?? '').toLowerCase();
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  // 4. Fall back to system preference only if app gives no signal
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

const PAUSE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;
const PLAY_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>`;
// Layout icons: "sidebar dock" = panel mode, "floating window" = popup mode
const PANEL_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>`;
const POPUP_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="14" height="12" rx="2"/><path d="M18 8h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-2"/></svg>`;

export class QUI {
  private root: HTMLElement | null = null;
  private panelOuter: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private bubble: HTMLButtonElement | null = null;
  private messagesEl: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private sendBtn: HTMLButtonElement | null = null;
  private micBtn: HTMLButtonElement | null = null;
  private toggleBtn: HTMLButtonElement | null = null;
  private layoutBtn: HTMLButtonElement | null = null;
  private callbacks: UICallbacks;
  private chatHistory: { role: 'user' | 'assistant'; content: string }[] = [];
  private isOpen = false;
  private isSending = false;
  private themeObserver: MutationObserver | null = null;
  private layout: 'popup' | 'panel';
  private state: QState | null;
  private defaultPanelPosition = true; // true = right side, false = shifted
  // Voice recording state
  private recognition: SpeechRecognition | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: BlobPart[] = [];
  private isRecording = false;
  private speechWatchdog: ReturnType<typeof setTimeout> | null = null;

  constructor(callbacks: UICallbacks) {
    this.callbacks = callbacks;
    this.layout = callbacks.layout ?? 'popup';
    this.state = callbacks.state ?? null;
  }

  mount(): void {
    if (document.getElementById(ROOT_ID)) return;

    const root = document.createElement('div');
    root.id = ROOT_ID;
    document.body.appendChild(root);
    this.root = root;

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.applyTheme();
    this.watchTheme();

    this.bubble = this.buildBubble();
    root.appendChild(this.bubble);
  }

  private applyTheme(): void {
    if (!this.root) return;
    this.root.setAttribute('data-q-theme', detectDark() ? 'dark' : 'light');
  }

  private watchTheme(): void {
    this.themeObserver = new MutationObserver(() => this.applyTheme());
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-theme-mode', 'data-mode', 'class'],
    });
    // Also watch system preference changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyTheme());
  }

  private buildBubble(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'q-bubble';
    btn.textContent = 'Q';
    btn.title = 'Q Assistant';
    btn.addEventListener('click', () => this.togglePanel());
    return btn;
  }

  private buildPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'q-panel';

    // Header
    const header = document.createElement('div');
    header.id = 'q-header';
    header.innerHTML = `
      <div id="q-header-icon">Q</div>
      <div id="q-header-text">
        <div id="q-header-title">Q Assistant</div>
        <div id="q-header-sub">Powered by Claude + your docs</div>
      </div>
    `;
    // Toggle disable button (between title and close)
    if (this.state) {
      const toggleBtn = document.createElement('button');
      toggleBtn.id = 'q-toggle-btn';
      toggleBtn.innerHTML = this.state.disabled ? PLAY_ICON : PAUSE_ICON;
      toggleBtn.title = this.state.disabled ? 'Resume Q' : 'Pause Q';
      toggleBtn.addEventListener('click', () => {
        this.state?.toggle();
        toggleBtn.innerHTML = this.state?.disabled ? PLAY_ICON : PAUSE_ICON;
        toggleBtn.title = this.state?.disabled ? 'Resume Q' : 'Pause Q';
      });
      header.appendChild(toggleBtn);
      this.toggleBtn = toggleBtn;
    }

    // Layout toggle button (popup ↔ panel)
    const layoutBtn = document.createElement('button');
    layoutBtn.id = 'q-layout-btn';
    layoutBtn.innerHTML = this.layout === 'popup' ? PANEL_ICON : POPUP_ICON;
    layoutBtn.title = this.layout === 'popup' ? 'Switch to side panel' : 'Switch to popup';
    layoutBtn.addEventListener('click', () => this.switchLayout());
    header.appendChild(layoutBtn);
    this.layoutBtn = layoutBtn;

    const closeBtn = document.createElement('button');
    closeBtn.id = 'q-close-btn';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.closePanel());
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Messages
    const msgs = document.createElement('div');
    msgs.id = 'q-messages';
    panel.appendChild(msgs);
    this.messagesEl = msgs;

    // Input area
    const inputArea = document.createElement('div');
    inputArea.id = 'q-input-area';

    const input = document.createElement('textarea');
    input.id = 'q-input';
    input.placeholder = 'Ask me anything…';
    input.rows = 1;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 90) + 'px';
    });
    this.inputEl = input;

    const sendBtn = document.createElement('button');
    sendBtn.id = 'q-send-btn';
    sendBtn.innerHTML = '&#8593;';
    sendBtn.title = 'Send';
    sendBtn.addEventListener('click', () => this.sendMessage());
    this.sendBtn = sendBtn;

    const micBtn = document.createElement('button');
    micBtn.id = 'q-mic-btn';
    micBtn.title = 'Voice input';
    micBtn.innerHTML = MIC_ICON;
    micBtn.addEventListener('click', () => this.toggleRecording());
    this.micBtn = micBtn;

    inputArea.appendChild(input);
    inputArea.appendChild(micBtn);
    inputArea.appendChild(sendBtn);
    panel.appendChild(inputArea);

    return panel;
  }

  private togglePanel(): void {
    if (this.isOpen) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  private openPanel(): void {
    if (this.isOpen || !this.root) return;
    this.isOpen = true;
    this.panel = this.buildPanel();
    const outer = document.createElement('div');
    outer.id = 'q-panel-outer';
    if (this.layout === 'panel') {
      outer.classList.add('panel-mode');
    }
    outer.appendChild(this.panel);
    this.panelOuter = outer;
    this.root.insertBefore(outer, this.bubble);

    // Panel mode: add body class + CSS variable for host page layout adjustment
    if (this.layout === 'panel') {
      document.body.classList.add('q-panel-active');
      document.body.style.setProperty('--q-panel-width', '380px');
      // Hide bubble while panel is open in panel mode
      if (this.bubble) this.bubble.style.display = 'none';
      // Auto-inject margin rule if not already present
      if (!document.getElementById('q-panel-style')) {
        const style = document.createElement('style');
        style.id = 'q-panel-style';
        style.textContent = 'body.q-panel-active { margin-right: 380px; transition: margin-right 0.3s; }';
        document.head.appendChild(style);
      }
    }

    this.inputEl?.focus();
  }

  private closePanel(): void {
    if (!this.isOpen) return;
    this.stopRecording();
    this.isOpen = false;
    if (this.panelOuter && this.panelOuter.parentNode) {
      this.panelOuter.parentNode.removeChild(this.panelOuter);
    }
    this.panelOuter = null;
    this.panel = null;
    this.messagesEl = null;
    this.inputEl = null;
    this.sendBtn = null;
    this.micBtn = null;
    this.toggleBtn = null;
    this.layoutBtn = null;

    // Panel mode cleanup
    if (this.layout === 'panel') {
      document.body.classList.remove('q-panel-active');
      document.body.style.removeProperty('--q-panel-width');
      if (this.bubble) this.bubble.style.display = '';
    }

    // Reset panel position after spotlight shift
    this.defaultPanelPosition = true;
  }

  /** Switch between popup and panel layout without losing chat history */
  private switchLayout(): void {
    // Save current chat history before tearing down
    const savedHistory = [...this.chatHistory];

    // Close current panel (cleans up DOM + panel-mode body classes)
    this.closePanel();

    // Toggle layout
    this.layout = this.layout === 'popup' ? 'panel' : 'popup';

    // Re-open with new layout
    this.openPanel();

    // Restore chat messages
    this.chatHistory = savedHistory;
    for (const msg of savedHistory) {
      this.appendMessage({ role: msg.role as 'user' | 'assistant', text: msg.content });
    }

    // Update layout button icon/title
    if (this.layoutBtn) {
      this.layoutBtn.innerHTML = this.layout === 'popup' ? PANEL_ICON : POPUP_ICON;
      this.layoutBtn.title = this.layout === 'popup' ? 'Switch to side panel' : 'Switch to popup';
    }
  }

  /** Called when frustration is detected — opens panel and asks if user needs help */
  showGreeting(): void {
    if (this.state?.disabled) return;
    if (this.isOpen) return;
    this.openPanel();
    this.bubble?.classList.add('pulse');
    setTimeout(() => this.bubble?.classList.remove('pulse'), 4200);
    this.appendMessage({
      role: 'assistant',
      text: "Hey! Looks like you might be stuck — is there anything I can help you with?",
    });
  }

  /** Called with a specific intervention command (kept for direct use if needed) */
  showIntervention(command: InterventionCommand): void {
    if (this.state?.disabled) return;
    if (!this.isOpen) this.openPanel();
    this.appendMessage({
      role: 'assistant',
      text: command.message,
      intervention: command.action !== 'message_only' ? command : undefined,
    });
  }

  /** Update bubble appearance when Q is disabled/enabled */
  setDisabledAppearance(disabled: boolean): void {
    if (!this.bubble) return;
    if (disabled) {
      this.bubble.classList.add('disabled');
      this.bubble.classList.remove('pulse');
    } else {
      this.bubble.classList.remove('disabled');
    }
    // Update toggle button if panel is open
    if (this.toggleBtn) {
      this.toggleBtn.innerHTML = disabled ? PLAY_ICON : PAUSE_ICON;
      this.toggleBtn.title = disabled ? 'Resume Q' : 'Pause Q';
    }
  }

  /** Shift chat panel to avoid overlapping a spotlight element (7C) */
  adjustForSpotlight(rect: SpotlightRect | null): void {
    if (!this.panelOuter || this.layout === 'panel') return;

    if (!rect) {
      // Reset to default position
      if (!this.defaultPanelPosition) {
        this.panelOuter.style.right = '24px';
        this.panelOuter.style.left = '';
        this.defaultPanelPosition = true;
      }
      return;
    }

    // Panel bounds at default position (bottom-right)
    const panelLeft = window.innerWidth - 384;
    const panelRight = window.innerWidth - 24;
    const panelTop = window.innerHeight - 606;
    const panelBottom = window.innerHeight - 86;

    // Check overlap
    const overlaps = !(
      rect.right < panelLeft ||
      rect.left > panelRight ||
      rect.bottom < panelTop ||
      rect.top > panelBottom
    );

    if (overlaps) {
      // Shift panel to left side
      this.panelOuter.style.right = 'auto';
      this.panelOuter.style.left = '24px';
      this.defaultPanelPosition = false;
    } else if (!this.defaultPanelPosition) {
      // No overlap, reset to default
      this.panelOuter.style.right = '24px';
      this.panelOuter.style.left = '';
      this.defaultPanelPosition = true;
    }
  }

  private appendMessage(msg: ChatMessage): void {
    if (!this.messagesEl) return;

    const wrapper = document.createElement('div');
    wrapper.className = `q-msg ${msg.role}`;

    const bubble = document.createElement('div');
    bubble.className = 'q-bubble-text';
    if (msg.role === 'assistant') {
      bubble.innerHTML = renderMarkdown(msg.text);
    } else {
      bubble.textContent = msg.text;
    }
    wrapper.appendChild(bubble);

    if (msg.intervention) {
      if (msg.intervention.action === 'overlay_highlight') {
        // Execute immediately — no button needed
        this.callbacks.onAction(msg.intervention);
      } else {
        // deep_link / tour: user confirms before navigating
        const btn = document.createElement('button');
        btn.className = 'q-action-btn';
        btn.textContent = this.actionLabel(msg.intervention);
        btn.addEventListener('click', () => {
          this.callbacks.onAction(msg.intervention!);
          btn.textContent = '✓ Done';
          btn.disabled = true;
        });
        wrapper.appendChild(btn);
      }
    }

    this.messagesEl.appendChild(wrapper);
    this.scrollToBottom();
  }

  private actionLabel(cmd: InterventionCommand): string {
    if (cmd.action === 'deep_link') return `→ Take me there`;
    if (cmd.action === 'overlay_highlight') return `⬤ Highlight it`;
    if (cmd.action === 'tour') return `▶ Start tour`;
    return `Show me`;
  }

  private showTyping(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'q-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    this.messagesEl?.appendChild(el);
    this.scrollToBottom();
    return el;
  }

  private scrollToBottom(): void {
    if (this.messagesEl) {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
  }

  private async sendMessage(): Promise<void> {
    const text = this.inputEl?.value.trim();
    if (!text || this.isSending) return;

    this.isSending = true;
    if (this.sendBtn) this.sendBtn.disabled = true;
    if (this.inputEl) { this.inputEl.value = ''; this.inputEl.style.height = 'auto'; }

    this.appendMessage({ role: 'user', text });
    this.chatHistory.push({ role: 'user', content: text });
    const typing = this.showTyping();

    const result = await this.callbacks.onSendMessage(text, this.chatHistory.slice(0, -1));

    if (typing.parentNode) typing.parentNode.removeChild(typing);

    if (result) {
      this.appendMessage({
        role: 'assistant',
        text: result.reply,
        intervention: result.intervention,
      });
      this.chatHistory.push({ role: 'assistant', content: result.reply });
    } else {
      this.appendMessage({
        role: 'assistant',
        text: 'Sorry, something went wrong. Please try again.',
      });
    }

    this.isSending = false;
    if (this.sendBtn) this.sendBtn.disabled = false;
    this.inputEl?.focus();
  }

  private toggleRecording(): void {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      // Fire-and-forget — must be called synchronously from click handler
      this.startRecording().catch(() => {});
    }
  }

  private async startRecording(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.showMicError('Mic not available in this browser');
      return;
    }

    this.isRecording = true;
    this.setMicState('recording');
    if (this.inputEl) { this.inputEl.value = ''; this.inputEl.placeholder = 'Listening…'; }

    // Acquire mic permission immediately in the user-gesture context.
    // Chrome blocks getUserMedia if called later in a timer or async callback.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.isRecording = false;
      this.setMicState('idle');
      this.showMicError('Mic access denied — check browser permissions');
      return;
    }

    // Try Web Speech API first (instant results in Safari; needs Google for Chrome)
    if (SpeechRecognitionAPI) {
      let gotResult = false;

      const clearWatchdog = (): void => {
        if (this.speechWatchdog) { clearTimeout(this.speechWatchdog); this.speechWatchdog = null; }
      };

      const rec = new SpeechRecognitionAPI();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = navigator.language || 'en-US';

      rec.onresult = (event: SpeechRecognitionEvent) => {
        gotResult = true;
        clearWatchdog();
        let interim = '', final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) final += t; else interim += t;
        }
        if (this.inputEl) {
          this.inputEl.value = final || interim;
          this.inputEl.style.height = 'auto';
          this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 90) + 'px';
        }
      };

      rec.onend = () => {
        clearWatchdog();
        this.recognition = null;
        if (!gotResult) {
          // No result from Web Speech API — use MediaRecorder with the stream we already hold
          this.runMediaRecorder(stream);
          return;
        }
        stream.getTracks().forEach((t) => t.stop());
        this.isRecording = false;
        this.setMicState('idle');
        if (this.inputEl) this.inputEl.placeholder = 'Ask me anything…';
        const text = this.inputEl?.value.trim();
        if (text) this.sendMessage();
      };

      rec.onerror = () => {
        clearWatchdog();
        this.recognition = null;
        this.runMediaRecorder(stream);
      };

      rec.start();
      this.recognition = rec;

      // 4s watchdog for when Chrome hangs connecting to Google STT
      this.speechWatchdog = setTimeout(() => {
        this.speechWatchdog = null;
        if (this.recognition && !gotResult) {
          this.recognition.abort();
          this.recognition = null;
          this.runMediaRecorder(stream);
        }
      }, 4000);
      return;
    }

    // No Web Speech API at all — use MediaRecorder directly
    this.runMediaRecorder(stream);
  }

  private runMediaRecorder(stream: MediaStream): void {
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      .find((t) => MediaRecorder.isTypeSupported(t)) ?? 'audio/webm';
    this.audioChunks = [];
    const mr = new MediaRecorder(stream, { mimeType });
    mr.ondataavailable = (e) => { if (e.data.size > 0) this.audioChunks.push(e.data); };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      this.handleMediaRecorderStop(mimeType.split(';')[0]);
    };
    mr.start();
    this.mediaRecorder = mr;
    this.isRecording = true;
    this.setMicState('recording');
    if (this.inputEl) this.inputEl.placeholder = 'Recording… click ■ to stop';
  }

  private async handleMediaRecorderStop(mimeType: string): Promise<void> {
    this.setMicState('transcribing');
    if (this.inputEl) this.inputEl.placeholder = 'Transcribing…';

    const blob = new Blob(this.audioChunks, { type: mimeType });
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const text = await this.callbacks.onTranscribe(base64, mimeType);

    this.isRecording = false;
    this.setMicState('idle');
    if (this.inputEl) this.inputEl.placeholder = 'Ask me anything…';

    if (text && this.inputEl) {
      this.inputEl.value = text;
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 90) + 'px';
      this.sendMessage();
    }
  }

  private setMicState(state: 'idle' | 'recording' | 'transcribing'): void {
    if (!this.micBtn) return;
    this.micBtn.classList.remove('recording', 'transcribing');
    if (state === 'recording') {
      this.micBtn.classList.add('recording');
      this.micBtn.innerHTML = STOP_ICON;
      this.micBtn.title = 'Stop recording';
      this.micBtn.disabled = false;
    } else if (state === 'transcribing') {
      this.micBtn.classList.add('transcribing');
      this.micBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
      this.micBtn.title = 'Transcribing…';
      this.micBtn.disabled = true;
    } else {
      this.micBtn.innerHTML = MIC_ICON;
      this.micBtn.title = 'Voice input';
      this.micBtn.disabled = false;
    }
  }

  private stopRecording(): void {
    if (this.speechWatchdog) { clearTimeout(this.speechWatchdog); this.speechWatchdog = null; }
    if (this.recognition) { this.recognition.stop(); this.recognition = null; }
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop(); // onstop will fire → handleMediaRecorderStop
    } else {
      this.isRecording = false;
      this.setMicState('idle');
      if (this.inputEl) this.inputEl.placeholder = 'Ask me anything…';
    }
    this.mediaRecorder = null;
  }

  private showMicError(msg: string): void {
    if (this.inputEl) {
      this.inputEl.placeholder = msg;
      setTimeout(() => { if (this.inputEl) this.inputEl.placeholder = 'Ask me anything…'; }, 4000);
    }
  }

  // Legacy compat: called by actor if message needs updating
  updateMessage(_message: string): void { /* no-op in chat widget */ }
  removeCard(): void { /* no-op in chat widget */ }

  unmount(): void {
    this.closePanel();
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this.root = null;
  }
}
