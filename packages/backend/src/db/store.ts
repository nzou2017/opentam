// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { Tenant, FunctionalMapEntry, InterventionLog, Workflow, WorkflowStep, WorkflowStatus, FeatureRequest, FeedbackType, FeatureRequestStatus, AuditLogEntry, SurveyDefinition, SurveyResponse, Platform } from '@opentam/shared';

export interface ServerLicense {
  deploymentId: string;         // stable UUID for this OpenTAM instance
  ownerName: string;
  ownerEmail: string;
  company?: string;
  plan: 'hobbyist' | 'startup' | 'enterprise';
  licenseKey: string;           // current Ed25519 JWT
  refreshToken?: string;        // only for hobbyist/startup
  refreshTokenExpiresAt?: string;
  licenseExpiresAt?: string;
  setupCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CrawlJobStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface CrawlJobQueueItem {
  url: string;
  depth: number;
}

export interface CrawlJob {
  id: string;
  tenantId: string;
  rootUrl: string;
  maxPages: number;
  maxDepth: number;
  status: CrawlJobStatus;
  pagesIngested: number;
  pagesQueued: number;
  pagesFailed: number;
  totalChunks: number;
  /** Pages classified as not worth indexing (relevanceFilter.ts), tracked separately from pagesFailed. */
  docsSkipped: number;
  /** Checkpoint state — non-empty once the crawl has made progress, used to resume instead of restarting at rootUrl. */
  visitedUrls?: string[];
  queueState?: CrawlJobQueueItem[];
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GithubCrawlCandidate {
  feature: string;
  url: string;
  selector: string;
  description: string;
  source: 'crawler';
  platform?: Platform;
}

export interface GithubCrawlJob {
  id: string;
  tenantId: string;
  repoUrl: string;
  branch?: string | null;
  srcPath?: string | null;
  baseUrl?: string | null;
  ingestDocs: boolean;
  autoApply: boolean;
  status: CrawlJobStatus;
  totalFiles: number;
  filesProcessed: number;
  elementsFound: number;
  docsIngested: number;
  docsChunks: number;
  /** Docs classified as not worth indexing (relevanceFilter.ts). */
  docsSkipped: number;
  applied: number;
  appliedAt?: string | null;
  candidates?: GithubCrawlCandidate[];
  /** Checkpoint state — file paths already fetched+processed, used to resume instead of re-fetching everything. */
  processedPaths?: string[];
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  tenantId: string;
  sessionId: string;
  /** Set once linked to a filed feature request — null while it's just sitting there waiting to be claimed. */
  featureRequestId?: string | null;
  mimeType: string;
  filename: string;
  /** Full public URL, computed once at upload time from the request's own protocol/host — stored rather than re-derived later, since linking happens deep in agent/tools.ts with no access to a request object. */
  url: string;
  /** sha256 (hex) of the decoded image bytes — used to dedupe re-uploads of the same screenshot within a session. Optional for backward compat with rows created before this column existed. */
  contentHash?: string | null;
  createdAt: string;
}

export interface TelemetryEventRecord {
  id: string;
  tenantId: string;
  platform: string;
  eventName: string;
  screenName?: string;
  appVersion?: string;
  deviceInfo?: string; // JSON
  properties?: string; // JSON
  createdAt: string;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  name: string;
  role: 'owner' | 'admin' | 'viewer';
  mustChangePassword?: boolean;
  oauthProvider?: string | null;
  oauthProviderId?: string | null;
  totpSecret?: string | null;
  totpEnabled?: boolean;
  backupCodes?: string | null;
  avatar?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
}

export interface TeamInvite {
  id: string;
  tenantId: string;
  email: string;
  role: 'admin' | 'viewer';
  tokenHash: string;
  invitedBy: string;
  expiresAt: string;
  acceptedAt?: string | null;
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
}

export interface UsageLimits {
  tenantId: string;
  maxEventsMonth: number | null;
  maxChatMonth: number | null;
  maxUsers: number | null;
  maxSdkKeys: number | null;
}

export interface Store {
  // ── Tenants ──────────────────────────────────────────────────────────
  getTenantBySdkKey(sdkKey: string): Promise<Tenant | undefined>;
  getTenantBySecretKey(secretKey: string): Promise<Tenant | undefined>;
  getTenantById(id: string): Promise<Tenant | undefined>;
  getTenantByName(name: string): Promise<Tenant | undefined>;
  createTenant(tenant: Tenant): Promise<void>;
  updateTenant(id: string, patch: Partial<Omit<Tenant, 'id'>>): Promise<Tenant | undefined>;

  // ── Functional map ───────────────────────────────────────────────────
  getMapEntriesByTenantId(tenantId: string): Promise<FunctionalMapEntry[]>;
  addMapEntry(entry: FunctionalMapEntry): Promise<void>;
  updateMapEntry(
    id: string,
    tenantId: string,
    patch: Partial<Omit<FunctionalMapEntry, 'id' | 'tenantId'>>,
  ): Promise<FunctionalMapEntry | undefined>;
  deleteMapEntry(id: string, tenantId: string): Promise<boolean>;
  upsertDiscoveredEntry(entry: FunctionalMapEntry): Promise<'added' | 'skipped'>;

  // ── Intervention logs ────────────────────────────────────────────────
  addInterventionLog(log: InterventionLog): Promise<void>;
  getInterventionLogs(tenantId?: string): Promise<InterventionLog[]>;

  // ── Users ────────────────────────────────────────────────────────────
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsersByTenantId(tenantId: string): Promise<User[]>;
  createUser(user: User): Promise<void>;
  updateUser(id: string, patch: Partial<Omit<User, 'id' | 'tenantId'>>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  countUsersByTenantId(tenantId: string): Promise<number>;

  // ── Auth sessions ────────────────────────────────────────────────────
  createSession(session: AuthSession): Promise<void>;
  getSessionByTokenHash(tokenHash: string): Promise<AuthSession | undefined>;
  deleteSession(id: string): Promise<void>;
  deleteSessionsByUserId(userId: string): Promise<void>;

  // ── Password reset tokens ──────────────────────────────────────────
  createPasswordResetToken(userId: string, tokenHash: string, expiresAt: string): Promise<void>;
  getPasswordResetToken(tokenHash: string): Promise<{ userId: string; expiresAt: string } | undefined>;
  deletePasswordResetToken(tokenHash: string): Promise<void>;
  deleteExpiredPasswordResetTokens(): Promise<void>;

  // ── Team invites ─────────────────────────────────────────────────────
  createTeamInvite(invite: TeamInvite): Promise<void>;
  getTeamInviteByTokenHash(tokenHash: string): Promise<TeamInvite | undefined>;
  markTeamInviteAccepted(id: string): Promise<void>;

  // ── Usage ────────────────────────────────────────────────────────────
  recordUsage(tenantId: string, type: 'event' | 'chat' | 'crawl' | 'ingest'): Promise<void>;
  getUsageCount(tenantId: string, type: 'event' | 'chat', monthOffset?: number): Promise<number>;
  getUsageLimits(tenantId: string): Promise<UsageLimits | undefined>;
  setUsageLimits(limits: UsageLimits): Promise<void>;
  getUsageHistory(tenantId: string, months: number): Promise<{ month: string; events: number; chats: number }[]>;

  // ── Crawl jobs (docs spider) ─────────────────────────────────────────
  createCrawlJob(job: CrawlJob): Promise<void>;
  updateCrawlJob(id: string, patch: Partial<Omit<CrawlJob, 'id' | 'tenantId'>>): Promise<CrawlJob | undefined>;
  getCrawlJob(id: string): Promise<CrawlJob | undefined>;
  getCrawlJobsByTenantId(tenantId: string): Promise<CrawlJob[]>;
  /** Oldest-first, across all tenants — used by the job worker to pick up work. */
  getQueuedCrawlJobs(limit: number): Promise<CrawlJob[]>;
  deleteCrawlJob(id: string): Promise<boolean>;
  /**
   * Called once at startup — any job still 'running' belonged to a process
   * that's gone (crash/redeploy). Requeues it (checkpoint state preserved)
   * rather than failing it outright, so the worker picks it back up and
   * resumes instead of losing all progress.
   */
  requeueRunningCrawlJobs(): Promise<void>;

  // ── Crawl jobs (GitHub repo crawl) ───────────────────────────────────
  createGithubCrawlJob(job: GithubCrawlJob): Promise<void>;
  updateGithubCrawlJob(id: string, patch: Partial<Omit<GithubCrawlJob, 'id' | 'tenantId'>>): Promise<GithubCrawlJob | undefined>;
  getGithubCrawlJob(id: string): Promise<GithubCrawlJob | undefined>;
  getGithubCrawlJobsByTenantId(tenantId: string): Promise<GithubCrawlJob[]>;
  /** Oldest-first, across all tenants — used by the job worker to pick up work. */
  getQueuedGithubCrawlJobs(limit: number): Promise<GithubCrawlJob[]>;
  deleteGithubCrawlJob(id: string): Promise<boolean>;
  requeueRunningGithubCrawlJobs(): Promise<void>;

  // ── Integrations ─────────────────────────────────────────────────────
  getIntegrationsByTenantId(tenantId: string): Promise<Integration[]>;
  getIntegrationById(id: string): Promise<Integration | undefined>;
  createIntegration(integration: Integration): Promise<void>;
  updateIntegration(id: string, patch: Partial<Omit<Integration, 'id' | 'tenantId'>>): Promise<Integration | undefined>;
  deleteIntegration(id: string): Promise<boolean>;

  // ── Integration triggers ─────────────────────────────────────────────
  getTriggersByIntegrationId(integrationId: string): Promise<IntegrationTrigger[]>;
  getEnabledTriggersByEvent(tenantId: string, eventType: string): Promise<(IntegrationTrigger & { integration: Integration })[]>;
  createTrigger(trigger: IntegrationTrigger): Promise<void>;
  updateTrigger(id: string, patch: Partial<Omit<IntegrationTrigger, 'id' | 'integrationId'>>): Promise<IntegrationTrigger | undefined>;
  deleteTrigger(id: string): Promise<boolean>;

  // ── Tenant settings (LLM/STT config) ────────────────────────────────
  getTenantSettings(tenantId: string): Promise<TenantSettings | undefined>;
  updateTenantSettings(tenantId: string, settings: Partial<TenantSettings>): Promise<void>;

  // ── Workflows ──────────────────────────────────────────────────────
  getWorkflowsByTenantId(tenantId: string, status?: WorkflowStatus): Promise<Workflow[]>;
  getWorkflowById(id: string, tenantId: string): Promise<Workflow | undefined>;
  createWorkflow(workflow: Workflow, steps: WorkflowStep[]): Promise<void>;
  updateWorkflow(id: string, tenantId: string, patch: Partial<Omit<Workflow, 'id' | 'tenantId'>>): Promise<Workflow | undefined>;
  deleteWorkflow(id: string, tenantId: string): Promise<boolean>;
  getWorkflowSteps(workflowId: string): Promise<WorkflowStep[]>;
  upsertWorkflowSteps(workflowId: string, steps: WorkflowStep[]): Promise<void>;

  // ── Audit logs ─────────────────────────────────────────────────────
  createAuditLog(entry: AuditLogEntry): Promise<void>;
  getAuditLogs(tenantId: string, opts?: { limit?: number; offset?: number; action?: string; userId?: string }): Promise<AuditLogEntry[]>;
  countAuditLogs(tenantId: string, opts?: { action?: string; userId?: string }): Promise<number>;

  // ── Feature requests ────────────────────────────────────────────────
  createFeatureRequest(request: FeatureRequest): Promise<void>;
  getFeatureRequestsByTenantId(tenantId: string, type?: FeedbackType, status?: FeatureRequestStatus): Promise<FeatureRequest[]>;
  getFeatureRequestById(id: string, tenantId: string): Promise<FeatureRequest | undefined>;
  updateFeatureRequest(id: string, tenantId: string, patch: Partial<Omit<FeatureRequest, 'id' | 'tenantId'>>): Promise<FeatureRequest | undefined>;
  deleteFeatureRequest(id: string, tenantId: string): Promise<boolean>;
  voteFeatureRequest(id: string, voterId: string): Promise<{ votes: number; alreadyVoted: boolean }>;

  // ── Attachments ──────────────────────────────────────────────────────
  createAttachment(attachment: Attachment): Promise<void>;
  getAttachmentById(id: string): Promise<Attachment | undefined>;
  getUnlinkedAttachmentsBySession(tenantId: string, sessionId: string): Promise<Attachment[]>;
  linkAttachmentsToFeatureRequest(ids: string[], featureRequestId: string): Promise<void>;
  /** Dedupe helper — returns any existing attachment with the same decoded-bytes hash already uploaded in this session (linked or not). */
  getAttachmentByHash(tenantId: string, sessionId: string, contentHash: string): Promise<Attachment | undefined>;
  /** How many attachments are already linked to a given feature request — used to enforce the per-bug cap. */
  countAttachmentsForFeatureRequest(featureRequestId: string): Promise<number>;
  /** How many uploaded-but-not-yet-claimed attachments a session is holding — used to cap runaway/bot uploads. */
  countPendingAttachmentsBySession(tenantId: string, sessionId: string): Promise<number>;

  // ── Surveys ─────────────────────────────────────────────────────────
  createSurvey(survey: SurveyDefinition): Promise<void>;
  getSurveysByTenantId(tenantId: string): Promise<SurveyDefinition[]>;
  getSurveyById(id: string, tenantId: string): Promise<SurveyDefinition | undefined>;
  updateSurvey(id: string, tenantId: string, patch: Partial<Omit<SurveyDefinition, 'id' | 'tenantId'>>): Promise<SurveyDefinition | undefined>;
  deleteSurvey(id: string, tenantId: string): Promise<boolean>;

  // ── Survey responses ────────────────────────────────────────────────
  createSurveyResponse(response: SurveyResponse): Promise<void>;
  getSurveyResponses(surveyId: string, tenantId: string): Promise<SurveyResponse[]>;
  getSurveyResponseStats(surveyId: string, tenantId: string): Promise<{
    totalResponses: number;
    questionStats: Record<string, { average?: number; distribution?: Record<string, number> }>;
  }>;

  // ── Telemetry events (mobile SDK) ────────────────────────────────────
  addTelemetryEvent(event: TelemetryEventRecord): Promise<void>;

  // ── Server license (setup wizard) ────────────────────────────────────
  getServerLicense(): Promise<ServerLicense | undefined>;
  saveServerLicense(data: ServerLicense): Promise<void>;
}

export interface TenantSettings {
  llmProvider?: string;
  llmApiKey?: string;
  llmBaseUrl?: string;
  llmModel?: string;
  sttBaseUrl?: string;
  sttApiKey?: string;
  sttModel?: string;
  sttPath?: string;
  // Embedding / vector store
  embeddingProvider?: string;
  openaiApiKey?: string;
  ollamaUrl?: string;
  ollamaEmbeddingModel?: string;
  chromaUrl?: string;
  chromaCollection?: string;
  embeddingDimensions?: number;
  ssoGoogleClientId?: string;
  ssoGoogleEnabled?: boolean;
}
