// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

let _token: string | null = null;

/** Fetch the session JWT from the server (httpOnly cookie → /api/auth/token). Cached per page load. */
export async function getClientToken(): Promise<string> {
  if (_token) return _token;
  try {
    const res = await fetch('/api/auth/token');
    if (res.ok) {
      const { token } = await res.json() as { token: string };
      _token = token;
      return token;
    }
  } catch { /* ignore */ }
  return '';
}

/** Call on logout to clear the cached token. */
export function clearClientToken() { _token = null; }
