// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * QState — manages the disabled/enabled state of Q with localStorage persistence.
 * When disabled: observer stops, no popups, bubble shows muted/disabled state.
 */

type ChangeListener = (disabled: boolean) => void;

export class QState {
  private _disabled: boolean;
  private storageKey: string;
  private listeners: ChangeListener[] = [];

  constructor(tenantId: string) {
    this.storageKey = `q_disabled_${tenantId}`;
    this._disabled = this.readStorage();
  }

  get disabled(): boolean {
    return this._disabled;
  }

  setDisabled(value: boolean): void {
    if (this._disabled === value) return;
    this._disabled = value;
    this.writeStorage(value);
    this.notify();
  }

  toggle(): void {
    this.setDisabled(!this._disabled);
  }

  onChange(listener: ChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) {
      fn(this._disabled);
    }
  }

  private readStorage(): boolean {
    try {
      return localStorage.getItem(this.storageKey) === 'true';
    } catch {
      return false;
    }
  }

  private writeStorage(value: boolean): void {
    try {
      if (value) {
        localStorage.setItem(this.storageKey, 'true');
      } else {
        localStorage.removeItem(this.storageKey);
      }
    } catch {
      // localStorage may be unavailable
    }
  }
}
