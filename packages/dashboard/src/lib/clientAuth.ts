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

/** Call right after login so subsequent getClientToken() calls return the new
 * tenant's token immediately, without waiting on a stale cache to expire. */
export function setClientToken(token: string) { _token = token; }

/** Call on logout to clear the cached token — otherwise a same-tab login as a
 * different tenant keeps serving the previous tenant's cached JWT until a
 * full page reload, leaking that tenant's data into the new session. */
export function clearClientToken() { _token = null; }
