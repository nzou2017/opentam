'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { checkPassword } from '@opentam/shared';

const inputCls = 'w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500';

interface PasswordInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  showPolicy?: boolean;
}

export function PasswordInput({ label, value, onChange, ariaLabel, showPolicy = false }: PasswordInputProps) {
  const checks = checkPassword(value);
  const showChecks = showPolicy && value.length > 0;

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <input
        type="password"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className={inputCls}
      />
      {showChecks && (
        <ul className="mt-2 space-y-0.5">
          {checks.map((c) => (
            <li key={c.label} className={`flex items-center gap-1.5 text-xs ${c.met ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
              <span>{c.met ? '\u2713' : '\u2717'}</span>
              {c.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
