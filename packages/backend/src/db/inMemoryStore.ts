// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { Tenant, FunctionalMapEntry, InterventionLog, Workflow, WorkflowStep, WorkflowStatus, FeatureRequest, FeedbackType, FeatureRequestStatus, AuditLogEntry, SurveyDefinition, SurveyResponse, SurveyQuestion } from '@opentam/shared';
import type { Store, User, AuthSession, Integration, IntegrationTrigger, UsageLimits, TenantSettings, TelemetryEventRecord, ServerLicense } from './store.js';

class InMemoryStore implements Store {
  _needsAdminHash = false;
  private tenants: Map<string, Tenant> = new Map();
  private tenantsBySdkKey: Map<string, Tenant> = new Map();
  private tenantsBySecretKey: Map<string, Tenant> = new Map();
  private mapEntries: Map<string, FunctionalMapEntry[]> = new Map();
  private interventionLogsList: InterventionLog[] = [];
  private usersMap: Map<string, User> = new Map();
  private sessionsMap: Map<string, AuthSession> = new Map();
  private sessionsByToken: Map<string, AuthSession> = new Map();
  private integrationsMap: Map<string, Integration> = new Map();
  private triggersMap: Map<string, IntegrationTrigger> = new Map();
  private usageRecordsList: { tenantId: string; type: string; createdAt: string }[] = [];
  private usageLimitsMap: Map<string, UsageLimits> = new Map();
  private tenantSettings: Map<string, TenantSettings> = new Map();
  private workflowsMap: Map<string, Workflow> = new Map();
  private workflowStepsMap: Map<string, WorkflowStep[]> = new Map();
  private featureRequestsMap: Map<string, FeatureRequest> = new Map();
  private featureRequestVotesMap: Map<string, { featureRequestId: string; voterId: string }> = new Map();
  private passwordResetTokensMap: Map<string, { userId: string; expiresAt: string }> = new Map();
  private auditLogsList: AuditLogEntry[] = [];
  private surveysMap: Map<string, SurveyDefinition> = new Map();
  private surveyResponsesList: SurveyResponse[] = [];

  constructor() {
    this.seed();
  }

  private seed(): void {
    const acme: Tenant = {
      id: 'tenant-1',
      name: 'Acme Corp',
      sdkKey: 'sdk_test_acme',
      secretKey: 'sk_test_acme',
      plan: 'startup',
      model: 'claude-sonnet-4-6',
    };
    this.tenants.set(acme.id, acme);
    this.tenantsBySdkKey.set(acme.sdkKey, acme);
    this.tenantsBySecretKey.set(acme.secretKey, acme);

    const acmeEntries: FunctionalMapEntry[] = [
      { id: 'entry-1', tenantId: 'tenant-1', feature: 'Chat / Main assistant', url: '/', selector: 'a[href="/chat"]', description: 'Main chat interface to talk to your AI assistant', source: 'manual' },
      { id: 'entry-2', tenantId: 'tenant-1', feature: 'Agents — manage AI agent files', url: '/agents', selector: 'a[href="/agents"]', description: 'Browse and manage agent prompt/instruction files stored in the gateway', source: 'manual' },
      { id: 'entry-3', tenantId: 'tenant-1', feature: 'Channels — connect messaging platforms', url: '/channels', selector: 'a[href="/channels"]', description: 'Connect and configure messaging channels: Telegram, Discord, Slack, WhatsApp, iMessage, etc.', source: 'manual' },
      { id: 'entry-4', tenantId: 'tenant-1', feature: 'Skills — extend assistant capabilities', url: '/skills', selector: 'a[href="/skills"]', description: 'Install and manage skills that extend what your assistant can do (search, calendar, image gen, etc.)', source: 'manual' },
      { id: 'entry-5', tenantId: 'tenant-1', feature: 'Overview — gateway status and stats', url: '/overview', selector: 'a[href="/overview"]', description: 'Dashboard showing gateway health, active channels, message counts, and system status', source: 'manual' },
      { id: 'entry-6', tenantId: 'tenant-1', feature: 'Sessions — conversation history', url: '/sessions', selector: 'a[href="/sessions"]', description: 'Browse past conversation sessions and their history', source: 'manual' },
      { id: 'entry-7', tenantId: 'tenant-1', feature: 'Config / Settings — gateway configuration', url: '/config', selector: 'a[href="/config"]', description: 'Configure the gateway: AI model, system prompt, gateway URL, port, and general settings', source: 'manual' },
      { id: 'entry-8', tenantId: 'tenant-1', feature: 'AI Agents settings', url: '/ai-agents', selector: 'a[href="/ai-agents"]', description: 'Configure AI provider settings, API keys for Anthropic, OpenAI, etc.', source: 'manual' },
      { id: 'entry-9', tenantId: 'tenant-1', feature: 'Nodes — connected devices', url: '/nodes', selector: 'a[href="/nodes"]', description: 'Manage nodes: macOS, iOS, Android devices connected to this gateway', source: 'manual' },
      { id: 'entry-10', tenantId: 'tenant-1', feature: 'Cron — scheduled tasks', url: '/cron', selector: 'a[href="/cron"]', description: 'Create and manage scheduled/recurring tasks that run automatically', source: 'manual' },
      { id: 'entry-11', tenantId: 'tenant-1', feature: 'Logs — system logs', url: '/logs', selector: 'a[href="/logs"]', description: 'View live gateway logs for debugging and monitoring', source: 'manual' },
      { id: 'entry-12', tenantId: 'tenant-1', feature: 'Communications settings', url: '/communications', selector: 'a[href="/communications"]', description: 'Configure communication preferences, notification settings', source: 'manual' },
      { id: 'entry-13', tenantId: 'tenant-1', feature: 'Infrastructure settings', url: '/infrastructure', selector: 'a[href="/infrastructure"]', description: 'Configure gateway infrastructure: SSL/TLS, reverse proxy, network settings', source: 'manual' },
    ];
    this.mapEntries.set('tenant-1', acmeEntries);

    // ── OpenTAM Admin Dashboard tenant ───────────────────────────────────────
    this.seedQAdminTenant();

    const now = new Date();
    const logs: InterventionLog[] = [
      { id: 'log-1', eventId: 'evt-1', tenantId: 'tenant-1', sessionId: 'sess-abc', url: '/dashboard', action: 'overlay_highlight', elementId: '#create-project-btn', message: 'Click here to create a new project', confidence: 0.92, resolved: true, createdAt: new Date(now.getTime() - 3600000 * 5).toISOString(), resolvedAt: new Date(now.getTime() - 3600000 * 4).toISOString() },
      { id: 'log-2', eventId: 'evt-2', tenantId: 'tenant-1', sessionId: 'sess-def', url: '/settings/team', action: 'deep_link', message: 'Go to team settings to invite members', confidence: 0.85, resolved: true, createdAt: new Date(now.getTime() - 3600000 * 4).toISOString(), resolvedAt: new Date(now.getTime() - 3600000 * 3).toISOString() },
      { id: 'log-3', eventId: 'evt-3', tenantId: 'tenant-1', sessionId: 'sess-ghi', url: '/reports', action: 'message_only', message: 'To export, use the Reports section', confidence: 0.78, resolved: false, createdAt: new Date(now.getTime() - 3600000 * 3).toISOString() },
      { id: 'log-4', eventId: 'evt-4', tenantId: 'tenant-1', sessionId: 'sess-jkl', url: '/integrations', action: 'dismissed', message: 'User dismissed the intervention', confidence: 0.65, resolved: false, createdAt: new Date(now.getTime() - 3600000 * 2).toISOString() },
      { id: 'log-5', eventId: 'evt-5', tenantId: 'tenant-1', sessionId: 'sess-mno', url: '/reports', action: 'overlay_highlight', elementId: '#export-report-btn', message: 'Click here to export your report', confidence: 0.88, resolved: true, createdAt: new Date(now.getTime() - 3600000 * 1).toISOString(), resolvedAt: new Date(now.getTime() - 3600000 * 0.5).toISOString() },
    ];
    this.interventionLogsList.push(...logs);
  }

  private seedQAdminTenant(): void {
    const T = 'tenant-q-admin';
    const tenant: Tenant = {
      id: T,
      name: 'OpenTAM Admin Portal',
      sdkKey: 'sdk_q_admin',
      secretKey: 'sk_q_admin',
      plan: 'enterprise',
    };
    this.tenants.set(T, tenant);
    this.tenantsBySdkKey.set(tenant.sdkKey, tenant);
    this.tenantsBySecretKey.set(tenant.secretKey, tenant);

    // ── Functional map: every sidebar link + key page elements ─────────
    const entries: FunctionalMapEntry[] = [
      // Sidebar navigation
      { id: 'qa-nav-overview', tenantId: T, feature: 'Overview', url: '/', selector: 'a[href="/"]', description: 'Dashboard home — shows intervention stats, resolution rate, top frustration URLs, and recent intervention logs', source: 'manual' },
      { id: 'qa-nav-map', tenantId: T, feature: 'Map Editor', url: '/map', selector: 'a[href="/map"]', description: 'Functional Map Editor — add, edit, or delete feature-to-selector mappings. Q uses the map to know where UI elements are', source: 'manual' },
      { id: 'qa-nav-workflows', tenantId: T, feature: 'Workflows', url: '/workflows', selector: 'a[href="/workflows"]', description: 'Workflow manager — create multi-step SOPs (Standard Operating Procedures) that power guided tours', source: 'manual' },
      { id: 'qa-nav-crawl', tenantId: T, feature: 'Crawler', url: '/crawl', selector: 'a[href="/crawl"]', description: 'Repository Crawler — auto-discover UI elements from a GitHub repo and spider documentation sites for RAG', source: 'manual' },
      { id: 'qa-nav-docs', tenantId: T, feature: 'Docs', url: '/docs', selector: 'a[href="/docs"]', description: 'Documentation Ingestion — add product docs (URL, text, markdown, PDF) so Q can answer user questions via RAG', source: 'manual' },
      { id: 'qa-nav-analytics', tenantId: T, feature: 'Analytics', url: '/analytics', selector: 'a[href="/analytics"]', description: 'Analytics — view resolution rates, top frustration URLs, and intervention action breakdown', source: 'manual' },
      { id: 'qa-nav-usage', tenantId: T, feature: 'Usage', url: '/usage', selector: 'a[href="/usage"]', description: 'Usage dashboard — monitor API consumption (events, chats) against plan limits, with 6-month history chart', source: 'manual' },
      { id: 'qa-nav-settings', tenantId: T, feature: 'Settings', url: '/settings', selector: 'a[href="/settings"]', description: 'Settings hub — configure tenant name, API keys, LLM/STT providers, team members, and integrations', source: 'manual' },
      { id: 'qa-nav-install', tenantId: T, feature: 'Install', url: '/install', selector: 'a[href="/install"]', description: 'Installation guide — copy the JavaScript snippet to embed Q into your web application', source: 'manual' },
      // New pages
      { id: 'qa-nav-surveys', tenantId: T, feature: 'Surveys', url: '/surveys', selector: 'a[aria-label="Navigate to Surveys"]', description: 'Create and manage user surveys with rating, choice, and text questions. View survey results and analytics', source: 'manual' },
      { id: 'qa-nav-feedback', tenantId: T, feature: 'Feedback', url: '/feature-requests', selector: 'a[aria-label="Navigate to Feature Requests"]', description: 'Tabbed view of feature requests, positive feedback, and bug reports submitted by users', source: 'manual' },
      { id: 'qa-nav-audit-logs', tenantId: T, feature: 'Audit Logs', url: '/audit-logs', selector: 'a[aria-label="Navigate to Audit Logs"]', description: 'View the system audit trail — tracks user actions, configuration changes, and security events', source: 'manual' },
      { id: 'qa-nav-settings-profile', tenantId: T, feature: 'Settings > Profile', url: '/settings/profile', selector: 'a[aria-label="Navigate to Profile"]', description: 'Update your avatar, display name, and password', source: 'manual' },
      { id: 'qa-nav-settings-general', tenantId: T, feature: 'Settings > General', url: '/settings/general', selector: 'a[aria-label="Navigate to General"]', description: 'Edit tenant name, plan info, and general configuration', source: 'manual' },
      { id: 'qa-nav-settings-keys', tenantId: T, feature: 'Settings > API Keys', url: '/settings/keys', selector: 'a[aria-label="Navigate to API Keys"]', description: 'View and regenerate your SDK key for embedding Q into your application', source: 'manual' },
      { id: 'qa-nav-settings-team', tenantId: T, feature: 'Settings > Team', url: '/settings/team', selector: 'a[aria-label="Navigate to Team"]', description: 'Manage team members — invite users, change roles (owner/admin/viewer), remove users', source: 'manual' },
      { id: 'qa-nav-settings-model', tenantId: T, feature: 'Settings > Model (LLM Provider)', url: '/settings/model', selector: 'a[aria-label="Navigate to Model"]', description: 'Configure your LLM provider (Anthropic, Gemini, OpenAI-compatible including MiniMax, Kimi, DeepSeek, Groq) and speech-to-text settings', source: 'manual' },
      { id: 'qa-nav-settings-integrations', tenantId: T, feature: 'Settings > Integrations', url: '/settings/integrations', selector: 'a[aria-label="Navigate to Integrations"]', description: 'Connect external services — Slack, Discord, or custom webhooks for event notifications', source: 'manual' },
      { id: 'qa-nav-settings-security', tenantId: T, feature: 'Settings > Security', url: '/settings/security', selector: 'a[aria-label="Navigate to Security"]', description: 'Enable two-factor authentication (2FA) and manage recovery/backup codes', source: 'manual' },
      { id: 'qa-nav-settings-sso', tenantId: T, feature: 'Settings > SSO', url: '/settings/sso', selector: 'a[aria-label="Navigate to SSO"]', description: 'Configure Google SSO for single sign-on authentication', source: 'manual' },
      { id: 'qa-ui-theme-toggle', tenantId: T, feature: 'Theme Toggle (Dark Mode)', url: '*', selector: 'button[aria-label="Toggle theme"]', description: 'Switch between light and dark mode. Respects system preference by default', source: 'manual' },
      { id: 'qa-nav-forgot-password', tenantId: T, feature: 'Forgot Password', url: '/forgot-password', selector: 'a[href="/forgot-password"]', description: 'Password reset flow — enter email to receive a reset link', source: 'manual' },
    ];
    this.mapEntries.set(T, entries);

    // ── Seed admin user ───────────────────────────────────────────────
    // Pre-computed argon2 hash for 'changeme'
    // Generated via: await hash('changeme')
    const adminId = 'user-q-admin';
    const now = new Date().toISOString();
    this.usersMap.set(adminId, {
      id: adminId,
      tenantId: T,
      email: 'admin@q.local',
      passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$SEED_ADMIN_HASH$placeholder',
      name: 'OpenTAM Admin',
      role: 'owner',
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
    });
    // We'll replace the hash at runtime in initAdminHash()
    this._needsAdminHash = true;

    // ── Workflows for common dashboard tasks ───────────────────────────
    const wfNow = new Date().toISOString();

    // Workflow 1: Add a map entry
    const wf1: Workflow = { id: 'wf-qa-add-map', tenantId: T, name: 'Add a functional map entry', description: 'How to add a new feature-to-selector mapping so Q can guide users to it', status: 'published', source: 'manual', tags: ['map', 'getting-started'], version: 1, createdAt: wfNow, updatedAt: wfNow };
    const wf1Steps: WorkflowStep[] = [
      { id: 'wf-qa-add-map-s1', workflowId: wf1.id, stepIndex: 0, urlPattern: '/map', selector: 'a[href="/map"]', action: 'click', contextHint: 'Navigate to the Map Editor page' },
      { id: 'wf-qa-add-map-s2', workflowId: wf1.id, stepIndex: 1, urlPattern: '/map', selector: 'button', action: 'click', contextHint: 'Click "Add Entry" to open the new entry form' },
      { id: 'wf-qa-add-map-s3', workflowId: wf1.id, stepIndex: 2, urlPattern: '/map', selector: 'input[name="feature"]', action: 'input', contextHint: 'Enter the feature name (e.g., "Settings button")' },
      { id: 'wf-qa-add-map-s4', workflowId: wf1.id, stepIndex: 3, urlPattern: '/map', selector: 'input[name="selector"]', action: 'input', contextHint: 'Enter the CSS selector (e.g., "#settings-btn" or "a[href=\\"/settings\\"]")' },
      { id: 'wf-qa-add-map-s5', workflowId: wf1.id, stepIndex: 4, urlPattern: '/map', selector: 'button[type="submit"]', action: 'click', contextHint: 'Click Save to create the entry' },
    ];

    // Workflow 2: Create and publish a workflow
    const wf2: Workflow = { id: 'wf-qa-create-wf', tenantId: T, name: 'Create and publish a workflow', description: 'How to create a multi-step guided tour workflow and publish it', status: 'published', source: 'manual', tags: ['workflows', 'getting-started'], version: 1, createdAt: wfNow, updatedAt: wfNow };
    const wf2Steps: WorkflowStep[] = [
      { id: 'wf-qa-create-wf-s1', workflowId: wf2.id, stepIndex: 0, urlPattern: '/workflows', selector: 'a[href="/workflows"]', action: 'click', contextHint: 'Navigate to the Workflows page' },
      { id: 'wf-qa-create-wf-s2', workflowId: wf2.id, stepIndex: 1, urlPattern: '/workflows', selector: 'a[href="/workflows/new"]', action: 'click', contextHint: 'Click "New Workflow" to start creating a workflow' },
      { id: 'wf-qa-create-wf-s3', workflowId: wf2.id, stepIndex: 2, urlPattern: '/workflows/new', selector: 'input[name="name"]', action: 'input', contextHint: 'Enter a descriptive name for the workflow' },
      { id: 'wf-qa-create-wf-s4', workflowId: wf2.id, stepIndex: 3, urlPattern: '/workflows/new', selector: 'textarea', action: 'input', contextHint: 'Describe what this workflow helps the user accomplish' },
      { id: 'wf-qa-create-wf-s5', workflowId: wf2.id, stepIndex: 4, urlPattern: '/workflows/new', selector: 'button[type="submit"]', action: 'click', contextHint: 'Click "Create & Edit Steps" to save and open the step editor' },
    ];

    // Workflow 3: Ingest product documentation
    const wf3: Workflow = { id: 'wf-qa-ingest-docs', tenantId: T, name: 'Ingest product documentation', description: 'How to add product docs so Q can answer user questions using RAG', status: 'published', source: 'manual', tags: ['docs', 'rag', 'getting-started'], version: 1, createdAt: wfNow, updatedAt: wfNow };
    const wf3Steps: WorkflowStep[] = [
      { id: 'wf-qa-ingest-docs-s1', workflowId: wf3.id, stepIndex: 0, urlPattern: '/docs', selector: 'a[href="/docs"]', action: 'click', contextHint: 'Navigate to the Docs page' },
      { id: 'wf-qa-ingest-docs-s2', workflowId: wf3.id, stepIndex: 1, urlPattern: '/docs', selector: 'input[type="url"]', action: 'input', contextHint: 'Paste a documentation URL (HTML, Markdown, or PDF)' },
      { id: 'wf-qa-ingest-docs-s3', workflowId: wf3.id, stepIndex: 2, urlPattern: '/docs', selector: 'button', action: 'click', contextHint: 'Click "Ingest" to process and vectorize the documentation' },
    ];

    // Workflow 4: Configure LLM provider
    const wf4: Workflow = { id: 'wf-qa-config-llm', tenantId: T, name: 'Configure your LLM provider', description: 'How to set up the AI model that powers Q chat and interventions', status: 'published', source: 'manual', tags: ['settings', 'llm', 'getting-started'], version: 1, createdAt: wfNow, updatedAt: wfNow };
    const wf4Steps: WorkflowStep[] = [
      { id: 'wf-qa-config-llm-s1', workflowId: wf4.id, stepIndex: 0, urlPattern: '/settings', selector: 'a[href="/settings"]', action: 'click', contextHint: 'Navigate to Settings' },
      { id: 'wf-qa-config-llm-s2', workflowId: wf4.id, stepIndex: 1, urlPattern: '/settings/*', selector: 'a[href="/settings/model"]', action: 'click', contextHint: 'Click the "Model" tab' },
      { id: 'wf-qa-config-llm-s3', workflowId: wf4.id, stepIndex: 2, urlPattern: '/settings/model', selector: 'select', action: 'input', contextHint: 'Choose your LLM provider: Anthropic, Gemini, or OpenAI-compatible (includes MiniMax, Groq, etc.)' },
      { id: 'wf-qa-config-llm-s4', workflowId: wf4.id, stepIndex: 3, urlPattern: '/settings/model', selector: 'input[type="password"]', action: 'input', contextHint: 'Enter your API key for the chosen provider' },
      { id: 'wf-qa-config-llm-s5', workflowId: wf4.id, stepIndex: 4, urlPattern: '/settings/model', selector: 'button[type="submit"]', action: 'click', contextHint: 'Click Save to apply the configuration' },
    ];

    // Workflow 5: Set up a webhook integration
    const wf5: Workflow = { id: 'wf-qa-webhook', tenantId: T, name: 'Set up a webhook integration', description: 'How to receive Q events (frustration alerts, chat activity) via webhook', status: 'published', source: 'manual', tags: ['integrations', 'webhook'], version: 1, createdAt: wfNow, updatedAt: wfNow };
    const wf5Steps: WorkflowStep[] = [
      { id: 'wf-qa-webhook-s1', workflowId: wf5.id, stepIndex: 0, urlPattern: '/settings', selector: 'a[href="/settings"]', action: 'click', contextHint: 'Navigate to Settings' },
      { id: 'wf-qa-webhook-s2', workflowId: wf5.id, stepIndex: 1, urlPattern: '/settings/*', selector: 'a[href="/settings/integrations"]', action: 'click', contextHint: 'Click the "Integrations" tab' },
      { id: 'wf-qa-webhook-s3', workflowId: wf5.id, stepIndex: 2, urlPattern: '/settings/integrations', selector: 'a[href="/settings/integrations/new"]', action: 'click', contextHint: 'Click "Add Integration"' },
      { id: 'wf-qa-webhook-s4', workflowId: wf5.id, stepIndex: 3, urlPattern: '/settings/integrations/new', selector: 'select', action: 'input', contextHint: 'Select "Webhook" as the integration type' },
      { id: 'wf-qa-webhook-s5', workflowId: wf5.id, stepIndex: 4, urlPattern: '/settings/integrations/new', selector: 'input[name="url"]', action: 'input', contextHint: 'Enter your webhook endpoint URL' },
      { id: 'wf-qa-webhook-s6', workflowId: wf5.id, stepIndex: 5, urlPattern: '/settings/integrations/new', selector: 'button[type="submit"]', action: 'click', contextHint: 'Click "Create" to save the integration' },
    ];

    // Workflow 6: Crawl a GitHub repository
    const wf6: Workflow = { id: 'wf-qa-crawl', tenantId: T, name: 'Crawl a GitHub repo for UI elements', description: 'Auto-discover functional map entries by crawling your app\'s source code', status: 'published', source: 'manual', tags: ['crawler', 'map', 'automation'], version: 1, createdAt: wfNow, updatedAt: wfNow };
    const wf6Steps: WorkflowStep[] = [
      { id: 'wf-qa-crawl-s1', workflowId: wf6.id, stepIndex: 0, urlPattern: '/crawl', selector: 'a[href="/crawl"]', action: 'click', contextHint: 'Navigate to the Crawler page' },
      { id: 'wf-qa-crawl-s2', workflowId: wf6.id, stepIndex: 1, urlPattern: '/crawl', selector: 'input[name="repoUrl"]', action: 'input', contextHint: 'Enter the GitHub repository URL (e.g., https://github.com/org/repo)' },
      { id: 'wf-qa-crawl-s3', workflowId: wf6.id, stepIndex: 2, urlPattern: '/crawl', selector: 'button', action: 'click', contextHint: 'Click "Crawl" to start scanning the repository for UI elements' },
    ];

    // Workflow 7: Create and configure a survey
    const wf7: Workflow = { id: 'wf-qa-create-survey', tenantId: T, name: 'Create and configure a survey', description: 'How to create a new survey with questions, set a trigger, and start collecting responses', status: 'published', source: 'manual', tags: ['surveys', 'getting-started'], version: 1, createdAt: wfNow, updatedAt: wfNow };
    const wf7Steps: WorkflowStep[] = [
      { id: 'wf-qa-create-survey-s1', workflowId: wf7.id, stepIndex: 0, urlPattern: '/surveys', selector: 'a[aria-label="Navigate to Surveys"]', action: 'click', contextHint: 'Navigate to the Surveys page' },
      { id: 'wf-qa-create-survey-s2', workflowId: wf7.id, stepIndex: 1, urlPattern: '/surveys', selector: 'a[href="/surveys/new"]', action: 'click', contextHint: 'Click "New Survey" to start creating a survey' },
      { id: 'wf-qa-create-survey-s3', workflowId: wf7.id, stepIndex: 2, urlPattern: '/surveys/new', selector: 'input[name="name"]', action: 'input', contextHint: 'Enter a name and description for the survey' },
      { id: 'wf-qa-create-survey-s4', workflowId: wf7.id, stepIndex: 3, urlPattern: '/surveys/new', selector: 'button[aria-label="Add question"]', action: 'click', contextHint: 'Add questions — choose from rating, multiple choice, or free text types' },
      { id: 'wf-qa-create-survey-s5', workflowId: wf7.id, stepIndex: 4, urlPattern: '/surveys/new', selector: 'select[name="trigger"]', action: 'input', contextHint: 'Set a trigger condition to control when the survey appears to users' },
      { id: 'wf-qa-create-survey-s6', workflowId: wf7.id, stepIndex: 5, urlPattern: '/surveys/new', selector: 'button[type="submit"]', action: 'click', contextHint: 'Click Save to create the survey' },
    ];

    // Workflow 8: Set up Google SSO
    const wf8: Workflow = { id: 'wf-qa-setup-sso', tenantId: T, name: 'Set up Google SSO', description: 'How to configure Google single sign-on for your team', status: 'published', source: 'manual', tags: ['settings', 'sso', 'security'], version: 1, createdAt: wfNow, updatedAt: wfNow };
    const wf8Steps: WorkflowStep[] = [
      { id: 'wf-qa-setup-sso-s1', workflowId: wf8.id, stepIndex: 0, urlPattern: '/settings', selector: 'a[href="/settings"]', action: 'click', contextHint: 'Navigate to Settings' },
      { id: 'wf-qa-setup-sso-s2', workflowId: wf8.id, stepIndex: 1, urlPattern: '/settings/*', selector: 'a[aria-label="Navigate to SSO"]', action: 'click', contextHint: 'Click the SSO tab' },
      { id: 'wf-qa-setup-sso-s3', workflowId: wf8.id, stepIndex: 2, urlPattern: '/settings/sso', selector: 'input[name="clientId"]', action: 'input', contextHint: 'Enter your Google OAuth Client ID from the Google Cloud Console' },
      { id: 'wf-qa-setup-sso-s4', workflowId: wf8.id, stepIndex: 3, urlPattern: '/settings/sso', selector: 'button[aria-label="Enable SSO"]', action: 'click', contextHint: 'Toggle SSO on to enable Google sign-in' },
      { id: 'wf-qa-setup-sso-s5', workflowId: wf8.id, stepIndex: 4, urlPattern: '/settings/sso', selector: 'button[type="submit"]', action: 'click', contextHint: 'Click Save to apply SSO configuration' },
    ];

    // Workflow 9: Enable two-factor authentication
    const wf9: Workflow = { id: 'wf-qa-enable-2fa', tenantId: T, name: 'Enable two-factor authentication', description: 'How to set up 2FA for your account with an authenticator app', status: 'published', source: 'manual', tags: ['settings', 'security', '2fa'], version: 1, createdAt: wfNow, updatedAt: wfNow };
    const wf9Steps: WorkflowStep[] = [
      { id: 'wf-qa-enable-2fa-s1', workflowId: wf9.id, stepIndex: 0, urlPattern: '/settings', selector: 'a[href="/settings"]', action: 'click', contextHint: 'Navigate to Settings' },
      { id: 'wf-qa-enable-2fa-s2', workflowId: wf9.id, stepIndex: 1, urlPattern: '/settings/*', selector: 'a[aria-label="Navigate to Security"]', action: 'click', contextHint: 'Click the Security tab' },
      { id: 'wf-qa-enable-2fa-s3', workflowId: wf9.id, stepIndex: 2, urlPattern: '/settings/security', selector: 'button[aria-label="Enable 2FA"]', action: 'click', contextHint: 'Click "Enable 2FA" to begin setup — scan the QR code with your authenticator app' },
      { id: 'wf-qa-enable-2fa-s4', workflowId: wf9.id, stepIndex: 3, urlPattern: '/settings/security', selector: 'input[name="verificationCode"]', action: 'input', contextHint: 'Enter the 6-digit verification code from your authenticator app' },
      { id: 'wf-qa-enable-2fa-s5', workflowId: wf9.id, stepIndex: 4, urlPattern: '/settings/security', selector: 'button[aria-label="Save backup codes"]', action: 'click', contextHint: 'Save your backup codes in a safe place — you will need them if you lose your authenticator' },
    ];

    // Workflow 10: Submit a feature request
    const wf10: Workflow = { id: 'wf-qa-submit-feedback', tenantId: T, name: 'Submit a feature request', description: 'How to submit a feature request, bug report, or positive feedback', status: 'published', source: 'manual', tags: ['feedback', 'feature-requests'], version: 1, createdAt: wfNow, updatedAt: wfNow };
    const wf10Steps: WorkflowStep[] = [
      { id: 'wf-qa-submit-feedback-s1', workflowId: wf10.id, stepIndex: 0, urlPattern: '/feature-requests', selector: 'a[aria-label="Navigate to Feature Requests"]', action: 'click', contextHint: 'Navigate to the Feedback page' },
      { id: 'wf-qa-submit-feedback-s2', workflowId: wf10.id, stepIndex: 1, urlPattern: '/feature-requests', selector: 'button[aria-label="New request"]', action: 'click', contextHint: 'Click "New" to open the submission form' },
      { id: 'wf-qa-submit-feedback-s3', workflowId: wf10.id, stepIndex: 2, urlPattern: '/feature-requests', selector: 'select[name="type"]', action: 'input', contextHint: 'Select the type: feature request, bug report, or positive feedback' },
      { id: 'wf-qa-submit-feedback-s4', workflowId: wf10.id, stepIndex: 3, urlPattern: '/feature-requests', selector: 'input[name="title"]', action: 'input', contextHint: 'Enter a descriptive title and fill in the details' },
      { id: 'wf-qa-submit-feedback-s5', workflowId: wf10.id, stepIndex: 4, urlPattern: '/feature-requests', selector: 'button[type="submit"]', action: 'click', contextHint: 'Click Submit to send your feedback' },
    ];

    // Workflow 11: Review audit logs
    const wf11: Workflow = { id: 'wf-qa-review-audit', tenantId: T, name: 'Review audit logs', description: 'How to view and filter the system audit trail', status: 'published', source: 'manual', tags: ['audit', 'security'], version: 1, createdAt: wfNow, updatedAt: wfNow };
    const wf11Steps: WorkflowStep[] = [
      { id: 'wf-qa-review-audit-s1', workflowId: wf11.id, stepIndex: 0, urlPattern: '/audit-logs', selector: 'a[aria-label="Navigate to Audit Logs"]', action: 'click', contextHint: 'Navigate to the Audit Logs page' },
      { id: 'wf-qa-review-audit-s2', workflowId: wf11.id, stepIndex: 1, urlPattern: '/audit-logs', selector: 'select[aria-label="Filter by action"]', action: 'input', contextHint: 'Use the action filter to narrow results (e.g., login, settings change, user invite)' },
      { id: 'wf-qa-review-audit-s3', workflowId: wf11.id, stepIndex: 2, urlPattern: '/audit-logs', selector: 'input[aria-label="Search by user"]', action: 'input', contextHint: 'Search by user email or name to find specific activity' },
    ];

    // Workflow 12: Update your profile
    const wf12: Workflow = { id: 'wf-qa-update-profile', tenantId: T, name: 'Update your profile', description: 'How to change your avatar, display name, and password', status: 'published', source: 'manual', tags: ['settings', 'profile'], version: 1, createdAt: wfNow, updatedAt: wfNow };
    const wf12Steps: WorkflowStep[] = [
      { id: 'wf-qa-update-profile-s1', workflowId: wf12.id, stepIndex: 0, urlPattern: '/settings', selector: 'a[href="/settings"]', action: 'click', contextHint: 'Navigate to Settings' },
      { id: 'wf-qa-update-profile-s2', workflowId: wf12.id, stepIndex: 1, urlPattern: '/settings/*', selector: 'a[aria-label="Navigate to Profile"]', action: 'click', contextHint: 'Click the Profile tab' },
      { id: 'wf-qa-update-profile-s3', workflowId: wf12.id, stepIndex: 2, urlPattern: '/settings/profile', selector: 'button[aria-label="Change avatar"]', action: 'click', contextHint: 'Click to upload a new avatar image' },
      { id: 'wf-qa-update-profile-s4', workflowId: wf12.id, stepIndex: 3, urlPattern: '/settings/profile', selector: 'input[name="name"]', action: 'input', contextHint: 'Update your display name' },
      { id: 'wf-qa-update-profile-s5', workflowId: wf12.id, stepIndex: 4, urlPattern: '/settings/profile', selector: 'button[type="submit"]', action: 'click', contextHint: 'Click Save to apply your profile changes' },
    ];

    // Store all workflows
    for (const [wf, steps] of [[wf1, wf1Steps], [wf2, wf2Steps], [wf3, wf3Steps], [wf4, wf4Steps], [wf5, wf5Steps], [wf6, wf6Steps], [wf7, wf7Steps], [wf8, wf8Steps], [wf9, wf9Steps], [wf10, wf10Steps], [wf11, wf11Steps], [wf12, wf12Steps]] as [Workflow, WorkflowStep[]][]) {
      this.workflowsMap.set(wf.id, wf);
      this.workflowStepsMap.set(wf.id, steps);
    }
  }

  // ── Tenants ──────────────────────────────────────────────────────────

  async getTenantBySdkKey(sdkKey: string): Promise<Tenant | undefined> {
    return this.tenantsBySdkKey.get(sdkKey);
  }

  async getTenantBySecretKey(secretKey: string): Promise<Tenant | undefined> {
    return this.tenantsBySecretKey.get(secretKey);
  }

  async getTenantById(id: string): Promise<Tenant | undefined> {
    return this.tenants.get(id);
  }

  async createTenant(tenant: Tenant): Promise<void> {
    this.tenants.set(tenant.id, tenant);
    this.tenantsBySdkKey.set(tenant.sdkKey, tenant);
    this.tenantsBySecretKey.set(tenant.secretKey, tenant);
  }

  async updateTenant(id: string, patch: Partial<Omit<Tenant, 'id'>>): Promise<Tenant | undefined> {
    const t = this.tenants.get(id);
    if (!t) return undefined;
    // Remove old key mappings
    this.tenantsBySdkKey.delete(t.sdkKey);
    this.tenantsBySecretKey.delete(t.secretKey);
    const updated = { ...t, ...patch };
    this.tenants.set(id, updated);
    this.tenantsBySdkKey.set(updated.sdkKey, updated);
    this.tenantsBySecretKey.set(updated.secretKey, updated);
    return updated;
  }

  // ── Functional map ───────────────────────────────────────────────────

  async getMapEntriesByTenantId(tenantId: string): Promise<FunctionalMapEntry[]> {
    return this.mapEntries.get(tenantId) ?? [];
  }

  async addMapEntry(entry: FunctionalMapEntry): Promise<void> {
    const entries = this.mapEntries.get(entry.tenantId) ?? [];
    entries.push(entry);
    this.mapEntries.set(entry.tenantId, entries);
  }

  async updateMapEntry(
    id: string,
    tenantId: string,
    patch: Partial<Omit<FunctionalMapEntry, 'id' | 'tenantId'>>,
  ): Promise<FunctionalMapEntry | undefined> {
    const entries = this.mapEntries.get(tenantId);
    if (!entries) return undefined;
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) return undefined;
    const updated: FunctionalMapEntry = { ...entries[idx], ...patch };
    entries[idx] = updated;
    return updated;
  }

  async deleteMapEntry(id: string, tenantId: string): Promise<boolean> {
    const entries = this.mapEntries.get(tenantId);
    if (!entries) return false;
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    entries.splice(idx, 1);
    return true;
  }

  async upsertDiscoveredEntry(entry: FunctionalMapEntry): Promise<'added' | 'skipped'> {
    const entries = this.mapEntries.get(entry.tenantId) ?? [];
    if (entries.some((e) => e.selector === entry.selector)) return 'skipped';
    entries.push(entry);
    this.mapEntries.set(entry.tenantId, entries);
    return 'added';
  }

  // ── Intervention logs ────────────────────────────────────────────────

  async addInterventionLog(log: InterventionLog): Promise<void> {
    this.interventionLogsList.push(log);
  }

  async getInterventionLogs(tenantId?: string): Promise<InterventionLog[]> {
    if (tenantId) {
      return this.interventionLogsList.filter((log) => log.tenantId === tenantId);
    }
    return [...this.interventionLogsList];
  }

  // ── Users ────────────────────────────────────────────────────────────

  async getUserById(id: string): Promise<User | undefined> {
    return this.usersMap.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    for (const u of this.usersMap.values()) {
      if (u.email === email) return u;
    }
    return undefined;
  }

  async getUsersByTenantId(tenantId: string): Promise<User[]> {
    return [...this.usersMap.values()].filter(u => u.tenantId === tenantId);
  }

  async createUser(user: User): Promise<void> {
    this.usersMap.set(user.id, user);
  }

  async updateUser(id: string, patch: Partial<Omit<User, 'id' | 'tenantId'>>): Promise<User | undefined> {
    const user = this.usersMap.get(id);
    if (!user) return undefined;
    const updated = { ...user, ...patch, updatedAt: new Date().toISOString() };
    this.usersMap.set(id, updated);
    return updated;
  }

  async deleteUser(id: string): Promise<boolean> {
    // Delete sessions
    for (const [key, s] of this.sessionsMap) {
      if (s.userId === id) { this.sessionsMap.delete(key); this.sessionsByToken.delete(s.tokenHash); }
    }
    return this.usersMap.delete(id);
  }

  async countUsersByTenantId(tenantId: string): Promise<number> {
    return [...this.usersMap.values()].filter(u => u.tenantId === tenantId).length;
  }

  // ── Auth sessions ────────────────────────────────────────────────────

  async createSession(session: AuthSession): Promise<void> {
    this.sessionsMap.set(session.id, session);
    this.sessionsByToken.set(session.tokenHash, session);
  }

  async getSessionByTokenHash(tokenHash: string): Promise<AuthSession | undefined> {
    return this.sessionsByToken.get(tokenHash);
  }

  async deleteSession(id: string): Promise<void> {
    const s = this.sessionsMap.get(id);
    if (s) this.sessionsByToken.delete(s.tokenHash);
    this.sessionsMap.delete(id);
  }

  async deleteSessionsByUserId(userId: string): Promise<void> {
    for (const [key, s] of this.sessionsMap) {
      if (s.userId === userId) { this.sessionsMap.delete(key); this.sessionsByToken.delete(s.tokenHash); }
    }
  }

  // ── Usage ────────────────────────────────────────────────────────────

  async recordUsage(tenantId: string, type: 'event' | 'chat' | 'crawl' | 'ingest'): Promise<void> {
    this.usageRecordsList.push({ tenantId, type, createdAt: new Date().toISOString() });
  }

  async getUsageCount(tenantId: string, type: 'event' | 'chat', monthOffset = 0): Promise<number> {
    const now = new Date();
    const targetMonth = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    const nextMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 1);
    return this.usageRecordsList.filter(r =>
      r.tenantId === tenantId && r.type === type &&
      new Date(r.createdAt) >= targetMonth && new Date(r.createdAt) < nextMonth
    ).length;
  }

  async getUsageLimits(tenantId: string): Promise<UsageLimits | undefined> {
    return this.usageLimitsMap.get(tenantId);
  }

  async setUsageLimits(limits: UsageLimits): Promise<void> {
    this.usageLimitsMap.set(limits.tenantId, limits);
  }

  async getUsageHistory(tenantId: string, months: number): Promise<{ month: string; events: number; chats: number }[]> {
    const results: { month: string; events: number; chats: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const now = new Date();
      const target = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
      const events = await this.getUsageCount(tenantId, 'event', i);
      const chats = await this.getUsageCount(tenantId, 'chat', i);
      results.push({ month: monthStr, events, chats });
    }
    return results;
  }

  // ── Integrations ─────────────────────────────────────────────────────

  async getIntegrationsByTenantId(tenantId: string): Promise<Integration[]> {
    return [...this.integrationsMap.values()].filter(i => i.tenantId === tenantId);
  }

  async getIntegrationById(id: string): Promise<Integration | undefined> {
    return this.integrationsMap.get(id);
  }

  async createIntegration(integration: Integration): Promise<void> {
    this.integrationsMap.set(integration.id, integration);
  }

  async updateIntegration(id: string, patch: Partial<Omit<Integration, 'id' | 'tenantId'>>): Promise<Integration | undefined> {
    const i = this.integrationsMap.get(id);
    if (!i) return undefined;
    const updated = { ...i, ...patch };
    this.integrationsMap.set(id, updated);
    return updated;
  }

  async deleteIntegration(id: string): Promise<boolean> {
    // Delete triggers
    for (const [key, t] of this.triggersMap) {
      if (t.integrationId === id) this.triggersMap.delete(key);
    }
    return this.integrationsMap.delete(id);
  }

  // ── Integration triggers ─────────────────────────────────────────────

  async getTriggersByIntegrationId(integrationId: string): Promise<IntegrationTrigger[]> {
    return [...this.triggersMap.values()].filter(t => t.integrationId === integrationId);
  }

  async getEnabledTriggersByEvent(tenantId: string, eventType: string): Promise<(IntegrationTrigger & { integration: Integration })[]> {
    const integrationsList = await this.getIntegrationsByTenantId(tenantId);
    const enabledIntegrations = integrationsList.filter(i => i.enabled);
    const results: (IntegrationTrigger & { integration: Integration })[] = [];
    for (const integration of enabledIntegrations) {
      const triggers = [...this.triggersMap.values()].filter(t =>
        t.integrationId === integration.id && t.eventType === eventType && t.enabled
      );
      for (const trigger of triggers) {
        results.push({ ...trigger, integration });
      }
    }
    return results;
  }

  async createTrigger(trigger: IntegrationTrigger): Promise<void> {
    this.triggersMap.set(trigger.id, trigger);
  }

  async updateTrigger(id: string, patch: Partial<Omit<IntegrationTrigger, 'id' | 'integrationId'>>): Promise<IntegrationTrigger | undefined> {
    const t = this.triggersMap.get(id);
    if (!t) return undefined;
    const updated = { ...t, ...patch };
    this.triggersMap.set(id, updated);
    return updated;
  }

  async deleteTrigger(id: string): Promise<boolean> {
    return this.triggersMap.delete(id);
  }

  // ── Tenant settings ──────────────────────────────────────────────────

  async getTenantSettings(tenantId: string): Promise<TenantSettings | undefined> {
    return this.tenantSettings.get(tenantId);
  }

  async updateTenantSettings(tenantId: string, settings: Partial<TenantSettings>): Promise<void> {
    const existing = this.tenantSettings.get(tenantId) ?? {};
    this.tenantSettings.set(tenantId, { ...existing, ...settings });
  }

  // ── Workflows ──────────────────────────────────────────────────────

  async getWorkflowsByTenantId(tenantId: string, status?: WorkflowStatus): Promise<Workflow[]> {
    const all = [...this.workflowsMap.values()].filter(w => w.tenantId === tenantId);
    return status ? all.filter(w => w.status === status) : all;
  }

  async getWorkflowById(id: string, tenantId: string): Promise<Workflow | undefined> {
    const w = this.workflowsMap.get(id);
    return w && w.tenantId === tenantId ? w : undefined;
  }

  async createWorkflow(workflow: Workflow, steps: WorkflowStep[]): Promise<void> {
    this.workflowsMap.set(workflow.id, workflow);
    this.workflowStepsMap.set(workflow.id, [...steps].sort((a, b) => a.stepIndex - b.stepIndex));
  }

  async updateWorkflow(id: string, tenantId: string, patch: Partial<Omit<Workflow, 'id' | 'tenantId'>>): Promise<Workflow | undefined> {
    const existing = this.workflowsMap.get(id);
    if (!existing || existing.tenantId !== tenantId) return undefined;
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.workflowsMap.set(id, updated);
    return updated;
  }

  async deleteWorkflow(id: string, tenantId: string): Promise<boolean> {
    const existing = this.workflowsMap.get(id);
    if (!existing || existing.tenantId !== tenantId) return false;
    this.workflowStepsMap.delete(id);
    return this.workflowsMap.delete(id);
  }

  async getWorkflowSteps(workflowId: string): Promise<WorkflowStep[]> {
    return (this.workflowStepsMap.get(workflowId) ?? []).sort((a, b) => a.stepIndex - b.stepIndex);
  }

  async upsertWorkflowSteps(workflowId: string, steps: WorkflowStep[]): Promise<void> {
    this.workflowStepsMap.set(workflowId, [...steps].sort((a, b) => a.stepIndex - b.stepIndex));
  }

  // ── Password reset tokens ──────────────────────────────────────────

  async createPasswordResetToken(userId: string, tokenHash: string, expiresAt: string): Promise<void> {
    this.passwordResetTokensMap.set(tokenHash, { userId, expiresAt });
  }

  async getPasswordResetToken(tokenHash: string): Promise<{ userId: string; expiresAt: string } | undefined> {
    return this.passwordResetTokensMap.get(tokenHash);
  }

  async deletePasswordResetToken(tokenHash: string): Promise<void> {
    this.passwordResetTokensMap.delete(tokenHash);
  }

  async deleteExpiredPasswordResetTokens(): Promise<void> {
    const now = new Date().toISOString();
    for (const [hash, entry] of this.passwordResetTokensMap) {
      if (entry.expiresAt < now) {
        this.passwordResetTokensMap.delete(hash);
      }
    }
  }

  // ── Admin hash initialization ─────────────────────────────────────

  async initAdminHash(): Promise<void> {
    if (!this._needsAdminHash) return;
    const { hash } = await import('@node-rs/argon2');
    const admin = this.usersMap.get('user-q-admin');
    if (admin) {
      admin.passwordHash = await hash('changeme');
      this._needsAdminHash = false;
    }
  }

  // ── Feature requests ────────────────────────────────────────────────

  async createFeatureRequest(request: FeatureRequest): Promise<void> {
    this.featureRequestsMap.set(request.id, request);
  }

  async getFeatureRequestsByTenantId(tenantId: string, type?: FeedbackType, status?: FeatureRequestStatus): Promise<FeatureRequest[]> {
    let results = [...this.featureRequestsMap.values()].filter(r => r.tenantId === tenantId);
    if (type) results = results.filter(r => r.type === type);
    if (status) results = results.filter(r => r.status === status);
    return results;
  }

  async getFeatureRequestById(id: string, tenantId: string): Promise<FeatureRequest | undefined> {
    const r = this.featureRequestsMap.get(id);
    return r && r.tenantId === tenantId ? r : undefined;
  }

  async updateFeatureRequest(id: string, tenantId: string, patch: Partial<Omit<FeatureRequest, 'id' | 'tenantId'>>): Promise<FeatureRequest | undefined> {
    const existing = this.featureRequestsMap.get(id);
    if (!existing || existing.tenantId !== tenantId) return undefined;
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.featureRequestsMap.set(id, updated);
    return updated;
  }

  async deleteFeatureRequest(id: string, tenantId: string): Promise<boolean> {
    const existing = this.featureRequestsMap.get(id);
    if (!existing || existing.tenantId !== tenantId) return false;
    // Delete associated votes
    for (const [key, v] of this.featureRequestVotesMap) {
      if (v.featureRequestId === id) this.featureRequestVotesMap.delete(key);
    }
    return this.featureRequestsMap.delete(id);
  }

  async voteFeatureRequest(id: string, voterId: string): Promise<{ votes: number; alreadyVoted: boolean }> {
    const request = this.featureRequestsMap.get(id);
    if (!request) return { votes: 0, alreadyVoted: false };

    // Check if already voted
    for (const v of this.featureRequestVotesMap.values()) {
      if (v.featureRequestId === id && v.voterId === voterId) {
        return { votes: request.votes, alreadyVoted: true };
      }
    }

    // Record vote
    const voteId = `vote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.featureRequestVotesMap.set(voteId, { featureRequestId: id, voterId });
    request.votes += 1;
    this.featureRequestsMap.set(id, request);
    return { votes: request.votes, alreadyVoted: false };
  }

  // ── Audit logs ──────────────────────────────────────────────────────

  async createAuditLog(entry: AuditLogEntry): Promise<void> {
    this.auditLogsList.push(entry);
  }

  async getAuditLogs(tenantId: string, opts?: { limit?: number; offset?: number; action?: string; userId?: string }): Promise<AuditLogEntry[]> {
    let result = this.auditLogsList.filter(e => e.tenantId === tenantId);
    if (opts?.action) result = result.filter(e => e.action === opts.action);
    if (opts?.userId) result = result.filter(e => e.userId === opts.userId);
    // Sort newest first
    result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const offset = opts?.offset ?? 0;
    const limit = opts?.limit ?? 50;
    return result.slice(offset, offset + limit);
  }

  async countAuditLogs(tenantId: string, opts?: { action?: string; userId?: string }): Promise<number> {
    let result = this.auditLogsList.filter(e => e.tenantId === tenantId);
    if (opts?.action) result = result.filter(e => e.action === opts.action);
    if (opts?.userId) result = result.filter(e => e.userId === opts.userId);
    return result.length;
  }

  // ── Surveys ────────────────────────────────────────────────────────

  async createSurvey(survey: SurveyDefinition): Promise<void> {
    this.surveysMap.set(survey.id, survey);
  }

  async getSurveysByTenantId(tenantId: string): Promise<SurveyDefinition[]> {
    return [...this.surveysMap.values()].filter(s => s.tenantId === tenantId);
  }

  async getSurveyById(id: string, tenantId: string): Promise<SurveyDefinition | undefined> {
    const s = this.surveysMap.get(id);
    return s && s.tenantId === tenantId ? s : undefined;
  }

  async updateSurvey(id: string, tenantId: string, patch: Partial<Omit<SurveyDefinition, 'id' | 'tenantId'>>): Promise<SurveyDefinition | undefined> {
    const existing = this.surveysMap.get(id);
    if (!existing || existing.tenantId !== tenantId) return undefined;
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.surveysMap.set(id, updated);
    return updated;
  }

  async deleteSurvey(id: string, tenantId: string): Promise<boolean> {
    const existing = this.surveysMap.get(id);
    if (!existing || existing.tenantId !== tenantId) return false;
    // Remove associated responses
    this.surveyResponsesList = this.surveyResponsesList.filter(r => r.surveyId !== id);
    return this.surveysMap.delete(id);
  }

  async createSurveyResponse(response: SurveyResponse): Promise<void> {
    this.surveyResponsesList.push(response);
  }

  async getSurveyResponses(surveyId: string, tenantId: string): Promise<SurveyResponse[]> {
    return this.surveyResponsesList.filter(r => r.surveyId === surveyId && r.tenantId === tenantId);
  }

  async getSurveyResponseStats(surveyId: string, tenantId: string): Promise<{
    totalResponses: number;
    questionStats: Record<string, { average?: number; distribution?: Record<string, number> }>;
  }> {
    const responses = this.surveyResponsesList.filter(r => r.surveyId === surveyId && r.tenantId === tenantId);
    const survey = this.surveysMap.get(surveyId);
    if (!survey) return { totalResponses: 0, questionStats: {} };

    const questionStats: Record<string, { average?: number; distribution?: Record<string, number> }> = {};

    for (const q of survey.questions) {
      const stats: { average?: number; distribution?: Record<string, number> } = {};
      const values = responses.map(r => r.answers[q.id]).filter(v => v !== undefined && v !== null);

      if (q.type === 'rating') {
        const nums = values.map(v => typeof v === 'number' ? v : parseFloat(String(v))).filter(n => !isNaN(n));
        if (nums.length > 0) {
          stats.average = nums.reduce((a, b) => a + b, 0) / nums.length;
        }
        // Distribution for ratings
        const dist: Record<string, number> = {};
        for (const n of nums) { dist[String(n)] = (dist[String(n)] ?? 0) + 1; }
        stats.distribution = dist;
      } else if (q.type === 'single_choice') {
        const dist: Record<string, number> = {};
        for (const v of values) { const s = String(v); dist[s] = (dist[s] ?? 0) + 1; }
        stats.distribution = dist;
      } else if (q.type === 'multi_choice') {
        const dist: Record<string, number> = {};
        for (const v of values) {
          const arr = Array.isArray(v) ? v : [String(v)];
          for (const opt of arr) { dist[opt] = (dist[opt] ?? 0) + 1; }
        }
        stats.distribution = dist;
      } else {
        // text: just count
        stats.distribution = { responses: values.length };
      }

      questionStats[q.id] = stats;
    }

    return { totalResponses: responses.length, questionStats };
  }

  // ── Telemetry events ────────────────────────────────────────────────────

  private telemetryEventsList: TelemetryEventRecord[] = [];

  async addTelemetryEvent(event: TelemetryEventRecord): Promise<void> {
    this.telemetryEventsList.push(event);
  }

  // ── Server license (setup wizard) ────────────────────────────────────────

  private serverLicense: ServerLicense | undefined = undefined;

  async getServerLicense(): Promise<ServerLicense | undefined> {
    return this.serverLicense;
  }

  async saveServerLicense(data: ServerLicense): Promise<void> {
    this.serverLicense = data;
  }
}

// Singleton export
export const inMemoryStore = new InMemoryStore();
