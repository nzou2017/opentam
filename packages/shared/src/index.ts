// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

// ── Password policy ──────────────────────────────────────────────────────

export interface PasswordCheck {
  label: string;
  met: boolean;
}

export function checkPassword(password: string): PasswordCheck[] {
  return [
    { label: 'At least 12 characters', met: password.length >= 12 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', met: /[a-z]/.test(password) },
    { label: 'One number', met: /[0-9]/.test(password) },
    { label: 'One special character (!@#$%^&*...)', met: /[^A-Za-z0-9]/.test(password) },
  ];
}

export function isPasswordValid(password: string): boolean {
  return checkPassword(password).every(c => c.met);
}

// ── Platform ─────────────────────────────────────────────────────────────

export type Platform = 'web' | 'ios' | 'android';

export interface DeviceInfo {
  model: string;      // "iPhone 15 Pro", "Pixel 8"
  os: string;         // "iOS 18.2", "Android 14"
  screenSize: string; // "393x852"
}

// ── Feature gating ────────────────────────────────────────────────────────

export type Feature = 'sso' | 'team' | 'surveys' | 'feature_requests';
export type Plan = 'hobbyist' | 'startup' | 'enterprise';

export const FEATURE_MIN_PLAN: Record<Feature, Plan> = {
  sso: 'enterprise',
  team: 'enterprise',
  surveys: 'enterprise',
  feature_requests: 'enterprise',
};

const PLAN_RANK: Record<Plan, number> = { hobbyist: 0, startup: 1, enterprise: 2 };

export function hasFeature(plan: Plan, feature: Feature): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[FEATURE_MIN_PLAN[feature]];
}

// Tenant
export interface Tenant {
  id: string;
  name: string;
  sdkKey: string;
  secretKey: string;
  plan: 'hobbyist' | 'startup' | 'enterprise';
  /**
   * The Anthropic model this tenant is allowed to use.
   * Defaults to the server-level config.model.
   * Used for plan-based billing restrictions (e.g. hobbyist → haiku, enterprise → opus).
   */
  model?: string;
}

// FunctionalMapEntry
export interface FunctionalMapEntry {
  id: string;
  tenantId: string;
  feature: string;
  url: string;        // web: URL path; iOS: screen route; Android: destination name
  selector: string;   // web: CSS selector; iOS: accessibility ID; Android: view ID / content description
  description: string;
  preconditions?: string[];
  source: 'manual' | 'crawler';
  platform?: Platform; // defaults to 'web' if absent
}

// FrustrationSignals
export interface FrustrationSignals {
  rageClicks: number;
  deadEndLoops: number;
  dwellSeconds: number;
  cursorEntropy: number;
}

// FrustrationEvent — what the SDK sends to the backend
export interface FrustrationEvent {
  tenantId: string;
  sessionId: string;
  userId?: string;
  currentUrl: string;
  signals: FrustrationSignals;
  domSnapshot: string;
  timestamp: string; // ISO string
  // Mobile-specific context (optional, all default to web behavior if absent)
  platform?: Platform;
  screenName?: string;    // e.g. "Settings", "Checkout"
  appVersion?: string;
  deviceInfo?: DeviceInfo;
}

// TelemetryEvent — lightweight analytics events from mobile SDKs
export type TelemetryEventName = 'chatOpened' | 'interventionDisplayed' | 'interventionDismissed' | 'screenView';

export interface TelemetryEvent {
  tenantId: string;
  platform: Platform;
  eventName: TelemetryEventName;
  screenName?: string;
  appVersion?: string;
  deviceInfo?: DeviceInfo;
  properties?: Record<string, unknown>;
}

// ChatMessage context — used by mobile SDK to send view hierarchy alongside chat
export interface ChatMessageContext {
  platform?: Platform;
  screenName?: string;
  domSnapshot?: string; // JSON view hierarchy (mobile) or DOM snapshot (web) — name kept for backward compat
}

// ── Workflow types ────────────────────────────────────────────────────────

export type WorkflowStatus = 'draft' | 'published' | 'archived';
export type WorkflowSource = 'manual' | 'learned' | 'imported';
export type WorkflowStepAction = 'click' | 'navigate' | 'input' | 'wait' | 'verify';

export interface WorkflowStep {
  id: string;
  workflowId: string;
  stepIndex: number;
  urlPattern: string;
  selector: string;
  action: WorkflowStepAction;
  contextHint: string;
  expectedSelectors?: string[];
  mapEntryId?: string;
}

export interface Workflow {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  source: WorkflowSource;
  tags?: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

// InterventionCommand — what the backend returns to the SDK
export type InterventionAction = 'overlay_highlight' | 'deep_link' | 'message_only' | 'tour' | 'survey';

export interface TourStep {
  selector: string;
  message: string;
  urlPattern?: string;
  action?: WorkflowStepAction;
  workflowStepId?: string;
}

export interface InterventionCommand {
  action: InterventionAction;
  elementId?: string;
  href?: string;
  message: string;
  confidence: number;
  steps?: TourStep[]; // for tour action
  workflowId?: string;
  surveyId?: string;
  surveyQuestions?: SurveyQuestion[];
  platform?: Platform;
}

// InterventionLog
export interface InterventionLog {
  id: string;
  eventId: string;
  tenantId: string;
  sessionId: string;
  url?: string;
  action: InterventionAction | 'dismissed';
  elementId?: string;
  message: string;
  confidence: number;
  resolved: boolean;
  createdAt: string;
  resolvedAt?: string;
  platform?: Platform;
}

// ── New types for admin portal ────────────────────────────────────────

export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'viewer';
  createdAt: string;
}

export interface Integration {
  id: string;
  tenantId: string;
  type: 'slack' | 'jira' | 'webhook';
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
}

export interface IntegrationTrigger {
  id: string;
  integrationId: string;
  eventType: string;
  filterConfig?: Record<string, unknown>;
  enabled: boolean;
}

export interface UsageSummary {
  events: { used: number; limit: number };
  chat: { used: number; limit: number };
  users: { used: number; limit: number };
  period: string;
  plan: string;
}

export interface TenantSettings {
  llmProvider?: string;
  llmModel?: string;
  llmBaseUrl?: string;
  llmApiKey?: string;
  sttBaseUrl?: string;
  sttApiKey?: string;
  sttModel?: string;
  sttPath?: string;
}

// ── Feature requests / feedback ────────────────────────────────────────

export type FeatureRequestStatus = 'new' | 'under_review' | 'planned' | 'in_progress' | 'completed' | 'declined';
export type FeedbackType = 'feature_request' | 'positive_feedback' | 'bug_report';

export interface FeatureRequest {
  id: string;
  tenantId: string;
  type: FeedbackType;
  title: string;
  description: string;
  status: FeatureRequestStatus;
  votes: number;
  submittedBy: string;       // userId or sessionId
  submittedByEmail?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Audit log ─────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  action: string;     // e.g. 'user.login', 'settings.update', 'workflow.publish'
  resource: string;   // e.g. 'user', 'settings', 'workflow', 'map_entry'
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

// ── Survey / Feedback ──────────────────────────────────────────────────────

export type SurveyQuestionType = 'rating' | 'single_choice' | 'multi_choice' | 'text';

export interface SurveyQuestion {
  id: string;
  type: SurveyQuestionType;
  text: string;
  required?: boolean;
  options?: string[];       // for single_choice, multi_choice
  min?: number;             // for rating (default 1)
  max?: number;             // for rating (default 5)
  ratingStyle?: 'stars' | 'emoji';
}

export interface SurveyDefinition {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  questions: SurveyQuestion[];
  triggerOn?: string;       // e.g. 'frustration_high', 'intervention_complete'
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyResponse {
  id: string;
  surveyId: string;
  tenantId: string;
  sessionId: string;
  answers: Record<string, string | number | string[]>;
  createdAt: string;
}

export interface SpiderJob {
  id: string;
  tenantId: string;
  status: 'running' | 'completed' | 'failed';
  progress: { pagesIngested: number; pagesQueued: number };
  result?: {
    pagesIngested: number;
    pagesFailed: number;
    totalChunks: number;
    urls: string[];
  };
  error?: string;
  createdAt: string;
}
