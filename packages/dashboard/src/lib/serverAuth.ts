// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { cookies } from 'next/headers';
import { backendConfig } from './config';

/**
 * Returns the best available auth token for server components.
 * Prefers the user's JWT session cookie; falls back to the static secret key env var.
 */
export async function getServerToken(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore.get('q_token')?.value ?? backendConfig.secretKey;
}
