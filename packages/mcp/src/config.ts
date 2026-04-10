// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

export const mcpConfig = {
  backendUrl: process.env.Q_BACKEND_URL ?? 'http://localhost:3001',
  secretKey: process.env.Q_SECRET_KEY ?? '',
  sdkKey: process.env.Q_SDK_KEY ?? '',
};
