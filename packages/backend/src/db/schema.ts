// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sdkKey: text('sdk_key').notNull().unique(),
  secretKey: text('secret_key').notNull().unique(),
  plan: text('plan', { enum: ['hobbyist', 'startup', 'enterprise'] }).notNull().default('hobbyist'),
  model: text('model'),
  // Per-tenant LLM config
  llmProvider: text('llm_provider'),
  llmApiKey: text('llm_api_key'),
  llmBaseUrl: text('llm_base_url'),
  llmModel: text('llm_model'),
  // Per-tenant STT config
  sttBaseUrl: text('stt_base_url'),
  sttApiKey: text('stt_api_key'),
  sttModel: text('stt_model'),
  sttPath: text('stt_path'),
  // Per-tenant embedding / vector store config
  embeddingProvider: text('embedding_provider'),
  openaiApiKey: text('openai_api_key'),
  ollamaUrl: text('ollama_url'),
  ollamaEmbeddingModel: text('ollama_embedding_model'),
  chromaUrl: text('chroma_url'),
  chromaCollection: text('chroma_collection'),
  embeddingDimensions: integer('embedding_dimensions'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role', { enum: ['owner', 'admin', 'viewer'] }).notNull().default('viewer'),
  mustChangePassword: integer('must_change_password', { mode: 'boolean' }).default(false),
  oauthProvider: text('oauth_provider'),
  oauthProviderId: text('oauth_provider_id'),
  totpSecret: text('totp_secret'),
  totpEnabled: integer('totp_enabled', { mode: 'boolean' }).default(false),
  backupCodes: text('backup_codes'),
  avatar: text('avatar'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const passwordResetTokens = sqliteTable('password_reset_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const authSessions = sqliteTable('auth_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const functionalMapEntries = sqliteTable('functional_map_entries', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  feature: text('feature').notNull(),
  url: text('url').notNull(),
  selector: text('selector').notNull(),
  description: text('description').notNull(),
  preconditions: text('preconditions'), // JSON array
  source: text('source', { enum: ['manual', 'crawler'] }).notNull().default('manual'),
  platform: text('platform').notNull().default('web'), // 'web' | 'ios' | 'android'
});

export const interventionLogs = sqliteTable('intervention_logs', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  sessionId: text('session_id').notNull(),
  url: text('url'),
  action: text('action').notNull(),
  elementId: text('element_id'),
  message: text('message').notNull(),
  confidence: integer('confidence').notNull(), // stored as integer * 100
  resolved: integer('resolved', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  resolvedAt: text('resolved_at'),
  platform: text('platform').default('web'), // 'web' | 'ios' | 'android'
});

export const usageRecords = sqliteTable('usage_records', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  type: text('type', { enum: ['event', 'chat', 'crawl', 'ingest'] }).notNull(),
  tokensUsed: integer('tokens_used').default(0),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const usageLimits = sqliteTable('usage_limits', {
  tenantId: text('tenant_id').primaryKey().references(() => tenants.id),
  maxEventsMonth: integer('max_events_month'),
  maxChatMonth: integer('max_chat_month'),
  maxUsers: integer('max_users'),
  maxSdkKeys: integer('max_sdk_keys'),
});

export const integrations = sqliteTable('integrations', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  type: text('type', { enum: ['slack', 'jira', 'webhook'] }).notNull(),
  name: text('name').notNull(),
  config: text('config').notNull().default('{}'), // JSON
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  description: text('description').notNull(),
  status: text('status', { enum: ['draft', 'published', 'archived'] }).notNull().default('draft'),
  source: text('source', { enum: ['manual', 'learned', 'imported'] }).notNull().default('manual'),
  tags: text('tags'), // JSON array
  version: integer('version').notNull().default(1),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const workflowSteps = sqliteTable('workflow_steps', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull().references(() => workflows.id),
  stepIndex: integer('step_index').notNull(),
  urlPattern: text('url_pattern').notNull(),
  selector: text('selector').notNull(),
  action: text('action', { enum: ['click', 'navigate', 'input', 'wait', 'verify'] }).notNull(),
  contextHint: text('context_hint').notNull(),
  expectedSelectors: text('expected_selectors'), // JSON array
  mapEntryId: text('map_entry_id').references(() => functionalMapEntries.id),
  platform: text('platform').notNull().default('web'), // 'web' | 'ios' | 'android'
});

export const featureRequests = sqliteTable('feature_requests', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  type: text('type').notNull(), // 'feature_request' | 'positive_feedback' | 'bug_report'
  title: text('title').notNull(),
  description: text('description').notNull(),
  status: text('status').notNull().default('new'),
  votes: integer('votes').notNull().default(0),
  submittedBy: text('submitted_by').notNull(),
  submittedByEmail: text('submitted_by_email'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const featureRequestVotes = sqliteTable('feature_request_votes', {
  id: text('id').primaryKey(),
  featureRequestId: text('feature_request_id').notNull().references(() => featureRequests.id),
  voterId: text('voter_id').notNull(),
  createdAt: text('created_at').notNull(),
});

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  userEmail: text('user_email').notNull(),
  action: text('action').notNull(),
  resource: text('resource').notNull(),
  resourceId: text('resource_id'),
  details: text('details'),  // JSON stringified
  ipAddress: text('ip_address'),
  createdAt: text('created_at').notNull(),
});

export const surveys = sqliteTable('surveys', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  description: text('description'),
  questions: text('questions').notNull(),  // JSON
  triggerOn: text('trigger_on'),
  active: integer('active').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const surveyResponses = sqliteTable('survey_responses', {
  id: text('id').primaryKey(),
  surveyId: text('survey_id').notNull(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  sessionId: text('session_id').notNull(),
  answers: text('answers').notNull(),  // JSON
  createdAt: text('created_at').notNull(),
});

export const integrationTriggers = sqliteTable('integration_triggers', {
  id: text('id').primaryKey(),
  integrationId: text('integration_id').notNull().references(() => integrations.id),
  eventType: text('event_type').notNull(),
  filterConfig: text('filter_config'), // JSON
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
});

// ── Mobile telemetry ────────────────────────────────────────────────────────

export const telemetryEvents = sqliteTable('telemetry_events', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  platform: text('platform').notNull(), // 'ios' | 'android'
  eventName: text('event_name').notNull(), // 'chatOpened' | 'interventionDisplayed' | 'interventionDismissed' | 'screenView'
  screenName: text('screen_name'),
  appVersion: text('app_version'),
  deviceInfo: text('device_info'), // JSON
  properties: text('properties'), // JSON
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});
