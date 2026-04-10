'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/change-password'];

export function QScript() {
  const pathname = usePathname();
  const isAuthPage = AUTH_PATHS.some(p => pathname.startsWith(p));

  // Hide the Q widget on auth pages (it may persist from a previous navigation)
  useEffect(() => {
    const w = window as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (isAuthPage) {
      // Hide widget if SDK already loaded
      w.Q?.hide?.();
    } else {
      w.Q?.show?.();
    }
  }, [isAuthPage]);

  if (isAuthPage) return null;

  return (
    <Script
      src="http://localhost:3001/sdk/q.min.js"
      strategy="afterInteractive"
      onLoad={() => {
        (window as any).Q?.init('sdk_q_admin', { backendUrl: 'http://localhost:3001' }); // eslint-disable-line @typescript-eslint/no-explicit-any
      }}
    />
  );
}
