'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolvedTheme: ResolvedTheme;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  setTheme: () => {},
  resolvedTheme: 'light',
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyClass(resolved: ResolvedTheme) {
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

function setCookie(theme: Theme) {
  document.cookie = `q_theme=${theme};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
}

export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  initialTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme ?? 'system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (initialTheme && initialTheme !== 'system') return initialTheme;
    return 'light'; // SSR default
  });

  const resolve = useCallback((t: Theme): ResolvedTheme => {
    return t === 'system' ? getSystemTheme() : t;
  }, []);

  const setTheme = useCallback(
    (t: Theme) => {
      setThemeState(t);
      const r = resolve(t);
      setResolvedTheme(r);
      applyClass(r);
      setCookie(t);
      localStorage.setItem('q_theme', t);
    },
    [resolve],
  );

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('q_theme') as Theme | null;
    const t = stored && ['light', 'dark', 'system'].includes(stored) ? stored : 'system';
    setThemeState(t);
    const r = resolve(t);
    setResolvedTheme(r);
    applyClass(r);
    setCookie(t);
  }, [resolve]);

  // Listen for system preference changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    function handleChange() {
      if (theme === 'system') {
        const r = getSystemTheme();
        setResolvedTheme(r);
        applyClass(r);
      }
    }
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
