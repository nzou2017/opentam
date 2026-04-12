// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { Store } from './store.js';
import { config } from '../config.js';

export type { Store };
export type { User, AuthSession, Integration, IntegrationTrigger, UsageLimits, TenantSettings, ServerLicense } from './store.js';

let _store: Store | null = null;

export async function initStore(): Promise<Store> {
  if (_store) return _store;

  if (config.databaseUrl) {
    const { SqliteStore } = await import('./sqliteStore.js');
    _store = new SqliteStore(config.databaseUrl);
    console.log(`[store] SQLite initialized: ${config.databaseUrl}`);
  } else {
    const { inMemoryStore } = await import('./inMemoryStore.js');
    await inMemoryStore.initAdminHash();
    _store = inMemoryStore;
    console.log('[store] In-memory store initialized (no DATABASE_URL set)');
  }

  return _store;
}

export function getStore(): Store {
  if (!_store) throw new Error('Store not initialized. Call initStore() first.');
  return _store;
}
