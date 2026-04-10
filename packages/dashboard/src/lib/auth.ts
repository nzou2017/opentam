// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

'use server';

import { cookies } from 'next/headers';

const TOKEN_COOKIE = 'q_token';

export async function getToken(): Promise<string | null> {
  const cookieStore = cookies();
  return cookieStore.get(TOKEN_COOKIE)?.value ?? null;
}

export async function setToken(token: string): Promise<void> {
  const cookieStore = cookies();
  cookieStore.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: '/',
  });
}

export async function clearToken(): Promise<void> {
  const cookieStore = cookies();
  cookieStore.delete(TOKEN_COOKIE);
}
