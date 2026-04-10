// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FunctionalMapEntry, InterventionLog, FeatureRequest, FeedbackType, FeatureRequestStatus, SurveyDefinition, SurveyResponse, SurveyQuestion, Feature } from '@opentam/shared';
import { backendConfig } from './config';

const { backendUrl, secretKey, sdkKey } = backendConfig;

function getAuthHeaders(token?: string | null): Record<string, string> {
  // Prefer JWT token, fall back to secret key
  const bearer = token ?? secretKey;
  return bearer ? { Authorization: `Bearer ${bearer}` } : {};
}

// ── Map entries ──────────────────────────────────────────────────────────────

export async function getMapEntries(token?: string | null, includeReference = false): Promise<{ entries: FunctionalMapEntry[]; referenceEntries?: FunctionalMapEntry[] }> {
  const qs = includeReference ? '?includeReference=true' : '';
  const res = await fetch(`${backendUrl}/api/v1/map${qs}`, {
    headers: getAuthHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch map entries: ${res.status}`);
  return res.json() as Promise<{ entries: FunctionalMapEntry[]; referenceEntries?: FunctionalMapEntry[] }>;
}

export async function createMapEntry(
  body: Omit<FunctionalMapEntry, 'id' | 'tenantId'>,
  token?: string | null,
): Promise<FunctionalMapEntry> {
  const res = await fetch(`${backendUrl}/api/v1/map`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(token),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to create map entry: ${res.status}`);
  const data = await res.json() as { entry: FunctionalMapEntry };
  return data.entry;
}

export async function updateMapEntry(
  id: string,
  patch: Partial<Omit<FunctionalMapEntry, 'id' | 'tenantId'>>,
  token?: string | null,
): Promise<FunctionalMapEntry> {
  const res = await fetch(`${backendUrl}/api/v1/map/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(token),
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update map entry: ${res.status}`);
  const data = await res.json() as { entry: FunctionalMapEntry };
  return data.entry;
}

export async function deleteMapEntry(id: string, token?: string | null): Promise<void> {
  const res = await fetch(`${backendUrl}/api/v1/map/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(token),
  });
  if (!res.ok) throw new Error(`Failed to delete map entry: ${res.status}`);
}

// ── Workflows ─────────────────────────────────────────────────────────────────

export async function getWorkflows(status?: string, token?: string | null, includeReference = false): Promise<{ workflows: any[]; referenceWorkflows?: any[] }> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (includeReference) params.set('includeReference', 'true');
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${backendUrl}/api/v1/workflows${qs}`, {
    headers: getAuthHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch workflows: ${res.status}`);
  return res.json() as Promise<{ workflows: any[]; referenceWorkflows?: any[] }>;
}

export async function getWorkflow(id: string, token?: string | null): Promise<{ workflow: any; steps: any[] }> {
  const res = await fetch(`${backendUrl}/api/v1/workflows/${id}`, {
    headers: getAuthHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch workflow: ${res.status}`);
  return res.json() as Promise<{ workflow: any; steps: any[] }>;
}

export async function createWorkflow(
  body: { name: string; description: string; steps: Array<{ id: string; urlPattern: string; selector: string; action: string; contextHint: string }> },
  token?: string | null,
): Promise<{ workflow: any; steps: any[] }> {
  const res = await fetch(`${backendUrl}/api/v1/workflows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to create workflow: ${res.status}`);
  return res.json() as Promise<{ workflow: any; steps: any[] }>;
}

export async function updateWorkflow(
  id: string,
  patch: { name?: string; description?: string; tags?: string[] },
  token?: string | null,
): Promise<{ workflow: any }> {
  const res = await fetch(`${backendUrl}/api/v1/workflows/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token) },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update workflow: ${res.status}`);
  return res.json() as Promise<{ workflow: any }>;
}

export async function updateWorkflowSteps(
  id: string,
  steps: Array<{ id: string; urlPattern: string; selector: string; action: string; contextHint: string; expectedSelectors?: string[]; mapEntryId?: string }>,
  token?: string | null,
): Promise<{ steps: any[] }> {
  const res = await fetch(`${backendUrl}/api/v1/workflows/${id}/steps`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token) },
    body: JSON.stringify({ steps }),
  });
  if (!res.ok) throw new Error(`Failed to update steps: ${res.status}`);
  return res.json() as Promise<{ steps: any[] }>;
}

export async function deleteWorkflow(id: string, token?: string | null): Promise<void> {
  const res = await fetch(`${backendUrl}/api/v1/workflows/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(token),
  });
  if (!res.ok) throw new Error(`Failed to delete workflow: ${res.status}`);
}

export async function publishWorkflow(id: string, token?: string | null): Promise<{ workflow: any }> {
  const res = await fetch(`${backendUrl}/api/v1/workflows/${id}/publish`, {
    method: 'POST',
    headers: getAuthHeaders(token),
  });
  if (!res.ok) throw new Error(`Failed to publish workflow: ${res.status}`);
  return res.json() as Promise<{ workflow: any }>;
}

// ── Analytics ────────────────────────────────────────────────────────────────

export interface AnalyticsData {
  totalInterventions: number;
  resolvedInterventions: number;
  resolutionRate: number;
  topFrustrationUrls: { url: string; count: number }[];
  interventionsByAction: {
    overlay_highlight: number;
    deep_link: number;
    message_only: number;
    dismissed: number;
  };
  platformDistribution?: { web: number; ios: number; android: number };
}

export async function getAnalytics(token?: string | null): Promise<AnalyticsData> {
  const res = await fetch(`${backendUrl}/api/v1/analytics`, {
    headers: getAuthHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch analytics: ${res.status}`);
  return res.json() as Promise<AnalyticsData>;
}

// ── Intervention logs ────────────────────────────────────────────────────────

export async function getInterventionLogs(token?: string | null): Promise<InterventionLog[]> {
  const res = await fetch(`${backendUrl}/api/v1/map/logs`, {
    headers: getAuthHeaders(token ?? sdkKey),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch intervention logs: ${res.status}`);
  const data = await res.json() as { logs: InterventionLog[] };
  return data.logs;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function apiLogin(email: string, password: string): Promise<{ token?: string; user?: any; mustChangePassword?: boolean; requires2FA?: boolean; tempToken?: string }> {
  const res = await fetch(`${backendUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? `Login failed: ${res.status}`);
  }
  return res.json() as Promise<{ token?: string; user?: any; mustChangePassword?: boolean; requires2FA?: boolean; tempToken?: string }>;
}

export async function apiForgotPassword(email: string): Promise<{ ok: boolean; resetToken?: string; message?: string }> {
  const res = await fetch(`${backendUrl}/api/v1/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? 'Failed to request password reset');
  }
  return res.json() as Promise<{ ok: boolean; resetToken?: string; message?: string }>;
}

export async function apiResetPassword(token: string, newPassword: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${backendUrl}/api/v1/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? 'Failed to reset password');
  }
  return res.json() as Promise<{ ok: boolean }>;
}

export async function apiChangePassword(currentPassword: string, newPassword: string, token: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${backendUrl}/api/v1/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? 'Failed to change password');
  }
  return res.json() as Promise<{ ok: boolean }>;
}

export async function apiGetSsoConfig(): Promise<{ google: { enabled: boolean; clientId?: string } }> {
  const res = await fetch(`${backendUrl}/api/v1/auth/sso/config`, { cache: 'no-store' });
  if (!res.ok) return { google: { enabled: false } };
  return res.json() as Promise<{ google: { enabled: boolean; clientId?: string } }>;
}

export async function apiSsoGoogle(idToken: string): Promise<{ token: string; user: any }> {
  const res = await fetch(`${backendUrl}/api/v1/auth/sso/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? 'Google SSO failed');
  }
  return res.json() as Promise<{ token: string; user: any }>;
}

export async function apiValidate2FA(tempToken: string, code: string): Promise<{ token: string; user: any; mustChangePassword?: boolean }> {
  const res = await fetch(`${backendUrl}/api/v1/auth/2fa/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tempToken, code }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? 'Invalid 2FA code');
  }
  return res.json() as Promise<{ token: string; user: any; mustChangePassword?: boolean }>;
}

export async function api2FASetup(token: string): Promise<{ secret: string; otpauthUrl: string }> {
  const res = await fetch(`${backendUrl}/api/v1/auth/2fa/setup`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? 'Failed to setup 2FA');
  }
  return res.json() as Promise<{ secret: string; otpauthUrl: string }>;
}

export async function api2FAVerify(token: string, code: string): Promise<{ ok: boolean; backupCodes: string[] }> {
  const res = await fetch(`${backendUrl}/api/v1/auth/2fa/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? 'Failed to verify 2FA');
  }
  return res.json() as Promise<{ ok: boolean; backupCodes: string[] }>;
}

export async function api2FADisable(token: string, password: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${backendUrl}/api/v1/auth/2fa/disable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? 'Failed to disable 2FA');
  }
  return res.json() as Promise<{ ok: boolean }>;
}

export async function apiRegister(data: { email: string; password: string; name: string; tenantName?: string }): Promise<{ token: string; user: any }> {
  const res = await fetch(`${backendUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Registration failed: ${res.status}`);
  }
  return res.json() as Promise<{ token: string; user: any }>;
}

export async function apiGetMe(token: string): Promise<{ user: any; tenant: any } | null> {
  const res = await fetch(`${backendUrl}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ user: any; tenant: any }>;
}

// ── Usage ────────────────────────────────────────────────────────────────────

export async function getUsage(token: string): Promise<any> {
  const res = await fetch(`${backendUrl}/api/v1/tenant/usage`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch usage: ${res.status}`);
  return res.json();
}

export async function getUsageHistory(token: string, months = 6): Promise<{ history: any[] }> {
  const res = await fetch(`${backendUrl}/api/v1/tenant/usage/history?months=${months}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch usage history: ${res.status}`);
  return res.json() as Promise<{ history: any[] }>;
}

// ── Tenant ───────────────────────────────────────────────────────────────────

export async function getTenant(token: string): Promise<any> {
  const res = await fetch(`${backendUrl}/api/v1/tenant`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch tenant: ${res.status}`);
  return res.json();
}

export async function getTenantKeys(token: string): Promise<{ sdkKey: string; secretKey: string }> {
  const res = await fetch(`${backendUrl}/api/v1/tenant/keys`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch keys: ${res.status}`);
  return res.json() as Promise<{ sdkKey: string; secretKey: string }>;
}

export async function getTenantUsers(token: string): Promise<{ users: any[] }> {
  const res = await fetch(`${backendUrl}/api/v1/tenant/users`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`);
  return res.json() as Promise<{ users: any[] }>;
}

export async function getTenantSettings(token: string): Promise<any> {
  const res = await fetch(`${backendUrl}/api/v1/tenant/settings`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch settings: ${res.status}`);
  return res.json();
}

export async function getIntegrations(token: string): Promise<{ integrations: any[] }> {
  const res = await fetch(`${backendUrl}/api/v1/tenant/integrations`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch integrations: ${res.status}`);
  return res.json() as Promise<{ integrations: any[] }>;
}

// ── Feature requests ─────────────────────────────────────────────────────────

export async function getFeatureRequests(token?: string | null, type?: FeedbackType, status?: FeatureRequestStatus): Promise<{ featureRequests: FeatureRequest[] }> {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (status) params.set('status', status);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${backendUrl}/api/v1/feature-requests${qs}`, {
    headers: getAuthHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch feature requests: ${res.status}`);
  return res.json() as Promise<{ featureRequests: FeatureRequest[] }>;
}

export async function createFeatureRequest(
  token: string | null | undefined,
  data: { type: string; title: string; description: string; submittedByEmail?: string },
): Promise<{ created: boolean; featureRequest?: FeatureRequest; possibleDuplicates?: FeatureRequest[] }> {
  const res = await fetch(`${backendUrl}/api/v1/feature-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token) },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create feature request: ${res.status}`);
  return res.json() as Promise<{ created: boolean; featureRequest?: FeatureRequest; possibleDuplicates?: FeatureRequest[] }>;
}

export async function updateFeatureRequest(
  token: string,
  id: string,
  patch: { title?: string; description?: string; status?: string },
): Promise<{ featureRequest: FeatureRequest }> {
  const res = await fetch(`${backendUrl}/api/v1/feature-requests/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update feature request: ${res.status}`);
  return res.json() as Promise<{ featureRequest: FeatureRequest }>;
}

export async function deleteFeatureRequest(token: string, id: string): Promise<void> {
  const res = await fetch(`${backendUrl}/api/v1/feature-requests/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to delete feature request: ${res.status}`);
}

export async function voteFeatureRequest(token: string | null | undefined, id: string): Promise<{ votes: number; alreadyVoted: boolean }> {
  const res = await fetch(`${backendUrl}/api/v1/feature-requests/${id}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token) },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Failed to vote: ${res.status}`);
  return res.json() as Promise<{ votes: number; alreadyVoted: boolean }>;
}

// ── Profile ──────────────────────────────────────────────────────────────────

export async function apiUpdateProfile(token: string, data: { name?: string; email?: string; avatar?: string | null }): Promise<{ user: any }> {
  const res = await fetch(`${backendUrl}/api/v1/auth/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Failed to update profile: ${res.status}`);
  }
  return res.json() as Promise<{ user: any }>;
}

export async function apiResetUserPassword(token: string, userId: string): Promise<{ tempPassword: string }> {
  const res = await fetch(`${backendUrl}/api/v1/tenant/users/${userId}/reset-password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Failed to reset password: ${res.status}`);
  }
  return res.json() as Promise<{ tempPassword: string }>;
}

// ── Audit Logs ───────────────────────────────────────────────────────────────

export async function getAuditLogs(token: string, params?: { page?: number; limit?: number; action?: string; userId?: string }): Promise<{ logs: any[]; total: number; page: number; totalPages: number }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.action) qs.set('action', params.action);
  if (params?.userId) qs.set('userId', params.userId);
  const qsStr = qs.toString() ? `?${qs.toString()}` : '';
  const res = await fetch(`${backendUrl}/api/v1/audit-logs${qsStr}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch audit logs: ${res.status}`);
  return res.json() as Promise<{ logs: any[]; total: number; page: number; totalPages: number }>;
}

// ── License ──────────────────────────────────────────────────────────────────

export interface LicenseInfo {
  licensed: boolean;
  plan: string;
  features: Feature[];
  expiresAt: string | null;
  error: string | null;
}

export async function getLicenseInfo(token: string): Promise<LicenseInfo> {
  const res = await fetch(`${backendUrl}/api/v1/tenant/license`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return { licensed: false, plan: 'community', features: [], expiresAt: null, error: 'Failed to fetch license' };
  return res.json() as Promise<LicenseInfo>;
}

export async function activateLicense(token: string, licenseKey: string): Promise<LicenseInfo> {
  const res = await fetch(`${backendUrl}/api/v1/tenant/license`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ licenseKey }),
  });
  return res.json() as Promise<LicenseInfo>;
}

// ── Surveys ──────────────────────────────────────────────────────────────────

export async function getSurveys(token: string): Promise<{ surveys: (SurveyDefinition & { responseCount?: number })[] }> {
  const res = await fetch(`${backendUrl}/api/v1/surveys`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch surveys: ${res.status}`);
  return res.json() as Promise<{ surveys: (SurveyDefinition & { responseCount?: number })[] }>;
}

export async function getSurvey(token: string, id: string): Promise<{ survey: SurveyDefinition }> {
  const res = await fetch(`${backendUrl}/api/v1/surveys/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch survey: ${res.status}`);
  return res.json() as Promise<{ survey: SurveyDefinition }>;
}

export async function createSurvey(
  token: string,
  data: { name: string; description?: string; questions: SurveyQuestion[]; triggerOn?: string; active?: boolean },
): Promise<{ survey: SurveyDefinition }> {
  const res = await fetch(`${backendUrl}/api/v1/surveys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create survey: ${res.status}`);
  return res.json() as Promise<{ survey: SurveyDefinition }>;
}

export async function updateSurvey(
  token: string,
  id: string,
  patch: Partial<{ name: string; description: string; questions: SurveyQuestion[]; triggerOn: string | null; active: boolean }>,
): Promise<{ survey: SurveyDefinition }> {
  const res = await fetch(`${backendUrl}/api/v1/surveys/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update survey: ${res.status}`);
  return res.json() as Promise<{ survey: SurveyDefinition }>;
}

export async function deleteSurvey(token: string, id: string): Promise<void> {
  const res = await fetch(`${backendUrl}/api/v1/surveys/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to delete survey: ${res.status}`);
}

export async function getSurveyResponses(token: string, surveyId: string): Promise<{ responses: SurveyResponse[] }> {
  const res = await fetch(`${backendUrl}/api/v1/surveys/${surveyId}/responses`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch survey responses: ${res.status}`);
  return res.json() as Promise<{ responses: SurveyResponse[] }>;
}

export async function getSurveyStats(token: string, surveyId: string): Promise<{
  totalResponses: number;
  questionStats: Record<string, { average?: number; distribution?: Record<string, number> }>;
}> {
  const res = await fetch(`${backendUrl}/api/v1/surveys/${surveyId}/stats`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch survey stats: ${res.status}`);
  return res.json();
}
