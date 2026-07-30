// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { SettingsNav } from '@/components/SettingsNav';
import type { Feature } from '@opentam/shared';

async function fetchLicensedFeatures(): Promise<Feature[] | undefined> {
  try {
    const { getServerToken } = await import('@/lib/serverAuth');
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? process.env.Q_BACKEND_URL ?? 'http://localhost:3001';
    const token = await getServerToken();
    if (!token) return undefined;
    const res = await fetch(`${backendUrl}/api/v1/tenant/license`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return undefined;
    const data = await res.json() as { licensed: boolean; features: Feature[] };
    return data.licensed ? data.features : [];
  } catch {
    return undefined;
  }
}

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const licensedFeatures = await fetchLicensedFeatures();

  return (
    <div className="p-8">
      <h1 className="mb-4 text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
      <SettingsNav licensedFeatures={licensedFeatures} />
      {children}
    </div>
  );
}
