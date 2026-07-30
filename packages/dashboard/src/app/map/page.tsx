// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { getMapEntries } from '@/lib/api';
import { MapTable } from './MapTable';
import { backendConfig } from '@/lib/config';
import { getServerToken } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export default async function MapEditorPage() {
  const token = await getServerToken();
  const data = await getMapEntries(token, true).catch(() => ({ entries: [], referenceEntries: undefined }));
  const entries = data.entries ?? [];
  const referenceEntries = data.referenceEntries;

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">Map Editor</h1>
      <MapTable entries={entries} referenceEntries={referenceEntries} backendUrl={backendConfig.backendUrl} secretKey={token} />
    </div>
  );
}
