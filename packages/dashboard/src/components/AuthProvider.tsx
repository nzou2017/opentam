'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface UserState {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextValue {
  user: UserState | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: UserState) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  loading: true,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children, initialToken, initialUser }: {
  children: ReactNode;
  initialToken?: string | null;
  initialUser?: UserState | null;
}) {
  const [user, setUser] = useState<UserState | null>(initialUser ?? null);
  const [token, setToken] = useState<string | null>(initialToken ?? null);
  const [loading, setLoading] = useState(!initialToken);

  useEffect(() => {
    if (initialToken) {
      setLoading(false);
    }
  }, [initialToken]);

  function login(newToken: string, newUser: UserState) {
    setToken(newToken);
    setUser(newUser);
    // Store in cookie via API call
    fetch('/api/auth/set-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: newToken }),
    });
  }

  function logout() {
    setToken(null);
    setUser(null);
    fetch('/api/auth/clear-token', { method: 'POST' });
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
