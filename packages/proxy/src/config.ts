// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
loadEnv({ path: resolve(__dirname, '../../../.env') });
loadEnv({ path: resolve(__dirname, '../../.env') });

export const proxyConfig = {
  port: parseInt(process.env.PROXY_PORT ?? '3002', 10),
  sdkUrl: process.env.Q_SDK_URL ?? 'http://localhost:3001',  // where to load q.min.js from
  sdkKey: process.env.Q_SDK_KEY ?? 'sdk_test_acme',
  backendUrl: process.env.Q_BACKEND_URL ?? 'http://localhost:3001',
};
