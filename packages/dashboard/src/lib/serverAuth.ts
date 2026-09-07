// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { cookies } from 'next/headers';

/**
 * Returns the signed-in user's JWT for server components, or '' if there is
 * no session. Every page that calls this is behind the auth middleware, which
 * redirects to /login when the `q_token` cookie is absent — so on a rendered
 * page the cookie is always present.
 *
 * SECURITY: this intentionally does NOT fall back to the static secret key.
 * That key resolves to the single env-configured tenant, so falling back to it
 * would render that tenant's data to whoever hit a page without a valid
 * session (cross-tenant leak). Fail closed instead: '' → backend 401.
 */
export async function getServerToken(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore.get('q_token')?.value ?? '';
}
