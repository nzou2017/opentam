// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

export const backendConfig = {
  backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL ?? process.env.BACKEND_URL ?? 'http://localhost:3001',
  secretKey: process.env.NEXT_PUBLIC_SECRET_KEY ?? process.env.Q_SECRET_KEY ?? '',
  sdkKey: process.env.NEXT_PUBLIC_SDK_KEY ?? process.env.Q_SDK_KEY ?? '',
  tenantName: process.env.NEXT_PUBLIC_TENANT_NAME ?? process.env.Q_TENANT_NAME ?? '',
};
