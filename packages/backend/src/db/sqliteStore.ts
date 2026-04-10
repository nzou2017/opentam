// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, and, sql, gte, like } from 'drizzle-orm';
import type { Tenant, FunctionalMapEntry, InterventionLog, Workflow, WorkflowStep, WorkflowStatus, FeatureRequest, FeedbackType, FeatureRequestStatus, AuditLogEntry, SurveyDefinition, SurveyResponse, SurveyQuestion } from '@opentam/shared';
import type { Store, User, AuthSession, Integration, IntegrationTrigger, UsageLimits, TenantSettings, TelemetryEventRecord } from './store.js';
import * as schema from './schema.js';
import { encrypt, decrypt } from '../crypto.js';

/** Keys inside integration config JSON that contain secrets and should be encrypted at rest. */
const CONFIG_SECRET_KEYS = ['apiKey', 'apiToken', 'webhookUrl', 'secret', 'password', 'token'];

function encryptConfigSecrets(config: Record<string, unknown>): Record<string, unknown> {
  const out = { ...config };
  for (const key of CONFIG_SECRET_KEYS) {
    if (typeof out[key] === 'string' && out[key]) {
      out[key] = encrypt(out[key] as string);
    }
  }
  return out;
}

function decryptConfigSecrets(config: Record<string, unknown>): Record<string, unknown> {
  const out = { ...config };
  for (const key of CONFIG_SECRET_KEYS) {
    if (typeof out[key] === 'string' && out[key]) {
      out[key] = decrypt(out[key] as string);
    }
  }
  return out;
}

export class SqliteStore implements Store {
  private db: BetterSQLite3Database<typeof schema>;

  constructor(databaseUrl: string) {
    const filePath = databaseUrl.replace(/^file:/, '');
    const sqlite = new Database(filePath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    this.db = drizzle(sqlite, { schema });
    this.migrate();
  }

  private migrate(): void {
    const sqlite = (this.db as any)._ as any;
    // Use the underlying better-sqlite3 instance to run raw SQL
    const raw = (this.db as any).run ?? null;
    // Access the raw driver
    const driver: Database.Database = ((this.db as any).session?.client) ?? ((this.db as any).$client);

    driver.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sdk_key TEXT NOT NULL UNIQUE,
        secret_key TEXT NOT NULL UNIQUE,
        plan TEXT NOT NULL DEFAULT 'hobbyist',
        model TEXT,
        llm_provider TEXT,
        llm_api_key TEXT,
        llm_base_url TEXT,
        llm_model TEXT,
        stt_base_url TEXT,
        stt_api_key TEXT,
        stt_model TEXT,
        stt_path TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        must_change_password INTEGER DEFAULT 0,
        oauth_provider TEXT,
        oauth_provider_id TEXT,
        totp_secret TEXT,
        totp_enabled INTEGER DEFAULT 0,
        backup_codes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS functional_map_entries (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        feature TEXT NOT NULL,
        url TEXT NOT NULL,
        selector TEXT NOT NULL,
        description TEXT NOT NULL,
        preconditions TEXT,
        source TEXT NOT NULL DEFAULT 'manual'
      );

      CREATE TABLE IF NOT EXISTS intervention_logs (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        session_id TEXT NOT NULL,
        url TEXT,
        action TEXT NOT NULL,
        element_id TEXT,
        message TEXT NOT NULL,
        confidence REAL NOT NULL,
        resolved INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        resolved_at TEXT
      );

      CREATE TABLE IF NOT EXISTS usage_records (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        type TEXT NOT NULL,
        tokens_used INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS usage_limits (
        tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
        max_events_month INTEGER,
        max_chat_month INTEGER,
        max_users INTEGER,
        max_sdk_keys INTEGER
      );

      CREATE TABLE IF NOT EXISTS integrations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        config TEXT NOT NULL DEFAULT '{}',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS integration_triggers (
        id TEXT PRIMARY KEY,
        integration_id TEXT NOT NULL REFERENCES integrations(id),
        event_type TEXT NOT NULL,
        filter_config TEXT,
        enabled INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        source TEXT NOT NULL DEFAULT 'manual',
        tags TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS workflow_steps (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL REFERENCES workflows(id),
        step_index INTEGER NOT NULL,
        url_pattern TEXT NOT NULL,
        selector TEXT NOT NULL,
        action TEXT NOT NULL,
        context_hint TEXT NOT NULL,
        expected_selectors TEXT,
        map_entry_id TEXT REFERENCES functional_map_entries(id)
      );

      CREATE TABLE IF NOT EXISTS feature_requests (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new',
        votes INTEGER NOT NULL DEFAULT 0,
        submitted_by TEXT NOT NULL,
        submitted_by_email TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS feature_request_votes (
        id TEXT PRIMARY KEY,
        feature_request_id TEXT NOT NULL REFERENCES feature_requests(id),
        voter_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_usage_records_tenant_type ON usage_records(tenant_id, type, created_at);
      CREATE INDEX IF NOT EXISTS idx_intervention_logs_tenant ON intervention_logs(tenant_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_functional_map_tenant ON functional_map_entries(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON integrations(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_workflows_tenant ON workflows(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow ON workflow_steps(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_feature_requests_tenant ON feature_requests(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_feature_request_votes_request ON feature_request_votes(feature_request_id);
    `);

    // Migrations for auth hardening columns (safe to run on existing DBs)
    const addColumnIfMissing = (table: string, column: string, type: string) => {
      try { driver.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`); } catch { /* column already exists */ }
    };
    addColumnIfMissing('users', 'must_change_password', 'INTEGER DEFAULT 0');
    addColumnIfMissing('users', 'oauth_provider', 'TEXT');
    addColumnIfMissing('users', 'oauth_provider_id', 'TEXT');
    addColumnIfMissing('users', 'totp_secret', 'TEXT');
    addColumnIfMissing('users', 'totp_enabled', 'INTEGER DEFAULT 0');
    addColumnIfMissing('users', 'backup_codes', 'TEXT');
    addColumnIfMissing('users', 'avatar', 'TEXT');

    // Audit logs table
    driver.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_email TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        resource_id TEXT,
        details TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(tenant_id, action);
    `);

    // Surveys tables
    driver.exec(`
      CREATE TABLE IF NOT EXISTS surveys (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        name TEXT NOT NULL,
        description TEXT,
        questions TEXT NOT NULL,
        trigger_on TEXT,
        active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_surveys_tenant ON surveys(tenant_id);

      CREATE TABLE IF NOT EXISTS survey_responses (
        id TEXT PRIMARY KEY,
        survey_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        session_id TEXT NOT NULL,
        answers TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_survey_responses_survey ON survey_responses(survey_id, tenant_id);
    `);

    // Embedding / vector store columns on tenants
    addColumnIfMissing('tenants', 'embedding_provider', 'TEXT');
    addColumnIfMissing('tenants', 'openai_api_key', 'TEXT');
    addColumnIfMissing('tenants', 'ollama_url', 'TEXT');
    addColumnIfMissing('tenants', 'ollama_embedding_model', 'TEXT');
    addColumnIfMissing('tenants', 'chroma_url', 'TEXT');
    addColumnIfMissing('tenants', 'chroma_collection', 'TEXT');
    addColumnIfMissing('tenants', 'embedding_dimensions', 'INTEGER');

    // ── Mobile platform support migration ─────────────────────────────────
    // Add platform columns to existing tables (safe for existing DBs)
    addColumnIfMissing('functional_map_entries', 'platform', "TEXT NOT NULL DEFAULT 'web'");
    addColumnIfMissing('intervention_logs', 'platform', "TEXT DEFAULT 'web'");
    addColumnIfMissing('workflow_steps', 'platform', "TEXT NOT NULL DEFAULT 'web'");

    // Telemetry events table (mobile SDK analytics)
    driver.exec(`
      CREATE TABLE IF NOT EXISTS telemetry_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        platform TEXT NOT NULL,
        event_name TEXT NOT NULL,
        screen_name TEXT,
        app_version TEXT,
        device_info TEXT,
        properties TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_telemetry_events_tenant ON telemetry_events(tenant_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_telemetry_events_platform ON telemetry_events(tenant_id, platform);
    `);
  }

  // ── Tenants ──────────────────────────────────────────────────────────

  async getTenantBySdkKey(sdkKey: string): Promise<Tenant | undefined> {
    const row = this.db.select().from(schema.tenants).where(eq(schema.tenants.sdkKey, sdkKey)).get();
    return row ? this.toTenant(row) : undefined;
  }

  async getTenantBySecretKey(secretKey: string): Promise<Tenant | undefined> {
    const row = this.db.select().from(schema.tenants).where(eq(schema.tenants.secretKey, secretKey)).get();
    return row ? this.toTenant(row) : undefined;
  }

  async getTenantById(id: string): Promise<Tenant | undefined> {
    const row = this.db.select().from(schema.tenants).where(eq(schema.tenants.id, id)).get();
    return row ? this.toTenant(row) : undefined;
  }

  async createTenant(tenant: Tenant): Promise<void> {
    this.db.insert(schema.tenants).values({
      id: tenant.id,
      name: tenant.name,
      sdkKey: tenant.sdkKey,
      secretKey: tenant.secretKey,
      plan: tenant.plan,
      model: tenant.model ?? null,
    }).run();
  }

  async updateTenant(id: string, patch: Partial<Omit<Tenant, 'id'>>): Promise<Tenant | undefined> {
    const values: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.plan !== undefined) values.plan = patch.plan;
    if (patch.sdkKey !== undefined) values.sdkKey = patch.sdkKey;
    if (patch.secretKey !== undefined) values.secretKey = patch.secretKey;
    if (patch.model !== undefined) values.model = patch.model;

    this.db.update(schema.tenants).set(values).where(eq(schema.tenants.id, id)).run();
    return this.getTenantById(id);
  }

  private toTenant(row: typeof schema.tenants.$inferSelect): Tenant {
    return {
      id: row.id,
      name: row.name,
      sdkKey: row.sdkKey,
      secretKey: row.secretKey,
      plan: row.plan as Tenant['plan'],
      model: row.model ?? undefined,
    };
  }

  // ── Functional map ───────────────────────────────────────────────────

  async getMapEntriesByTenantId(tenantId: string): Promise<FunctionalMapEntry[]> {
    const rows = this.db.select().from(schema.functionalMapEntries)
      .where(eq(schema.functionalMapEntries.tenantId, tenantId)).all();
    return rows.map(this.toMapEntry);
  }

  async addMapEntry(entry: FunctionalMapEntry): Promise<void> {
    this.db.insert(schema.functionalMapEntries).values({
      id: entry.id,
      tenantId: entry.tenantId,
      feature: entry.feature,
      url: entry.url,
      selector: entry.selector,
      description: entry.description,
      preconditions: entry.preconditions ? JSON.stringify(entry.preconditions) : null,
      source: entry.source,
    }).run();
  }

  async updateMapEntry(
    id: string,
    tenantId: string,
    patch: Partial<Omit<FunctionalMapEntry, 'id' | 'tenantId'>>,
  ): Promise<FunctionalMapEntry | undefined> {
    const existing = this.db.select().from(schema.functionalMapEntries)
      .where(and(eq(schema.functionalMapEntries.id, id), eq(schema.functionalMapEntries.tenantId, tenantId))).get();
    if (!existing) return undefined;

    const values: Record<string, unknown> = {};
    if (patch.feature !== undefined) values.feature = patch.feature;
    if (patch.url !== undefined) values.url = patch.url;
    if (patch.selector !== undefined) values.selector = patch.selector;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.preconditions !== undefined) values.preconditions = JSON.stringify(patch.preconditions);
    if (patch.source !== undefined) values.source = patch.source;

    if (Object.keys(values).length > 0) {
      this.db.update(schema.functionalMapEntries).set(values)
        .where(and(eq(schema.functionalMapEntries.id, id), eq(schema.functionalMapEntries.tenantId, tenantId))).run();
    }

    const row = this.db.select().from(schema.functionalMapEntries)
      .where(eq(schema.functionalMapEntries.id, id)).get();
    return row ? this.toMapEntry(row) : undefined;
  }

  async deleteMapEntry(id: string, tenantId: string): Promise<boolean> {
    const result = this.db.delete(schema.functionalMapEntries)
      .where(and(eq(schema.functionalMapEntries.id, id), eq(schema.functionalMapEntries.tenantId, tenantId))).run();
    return result.changes > 0;
  }

  async upsertDiscoveredEntry(entry: FunctionalMapEntry): Promise<'added' | 'skipped'> {
    const existing = this.db.select().from(schema.functionalMapEntries)
      .where(and(
        eq(schema.functionalMapEntries.tenantId, entry.tenantId),
        eq(schema.functionalMapEntries.selector, entry.selector),
      )).get();
    if (existing) return 'skipped';
    await this.addMapEntry(entry);
    return 'added';
  }

  private toMapEntry(row: typeof schema.functionalMapEntries.$inferSelect): FunctionalMapEntry {
    return {
      id: row.id,
      tenantId: row.tenantId,
      feature: row.feature,
      url: row.url,
      selector: row.selector,
      description: row.description,
      preconditions: row.preconditions ? JSON.parse(row.preconditions) : undefined,
      source: row.source as FunctionalMapEntry['source'],
    };
  }

  // ── Intervention logs ────────────────────────────────────────────────

  async addInterventionLog(log: InterventionLog): Promise<void> {
    this.db.insert(schema.interventionLogs).values({
      id: log.id,
      eventId: log.eventId,
      tenantId: log.tenantId,
      sessionId: log.sessionId,
      url: log.url ?? null,
      action: log.action,
      elementId: log.elementId ?? null,
      message: log.message,
      confidence: log.confidence,
      resolved: log.resolved,
      createdAt: log.createdAt,
      resolvedAt: log.resolvedAt ?? null,
    }).run();
  }

  async getInterventionLogs(tenantId?: string): Promise<InterventionLog[]> {
    const query = tenantId
      ? this.db.select().from(schema.interventionLogs).where(eq(schema.interventionLogs.tenantId, tenantId))
      : this.db.select().from(schema.interventionLogs);
    const rows = query.all();
    return rows.map(this.toInterventionLog);
  }

  private toInterventionLog(row: typeof schema.interventionLogs.$inferSelect): InterventionLog {
    return {
      id: row.id,
      eventId: row.eventId,
      tenantId: row.tenantId,
      sessionId: row.sessionId,
      url: row.url ?? undefined,
      action: row.action as InterventionLog['action'],
      elementId: row.elementId ?? undefined,
      message: row.message,
      confidence: row.confidence,
      resolved: Boolean(row.resolved),
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt ?? undefined,
    };
  }

  // ── Users ────────────────────────────────────────────────────────────

  async getUserById(id: string): Promise<User | undefined> {
    const row = this.db.select().from(schema.users).where(eq(schema.users.id, id)).get();
    return row ? this.toUser(row) : undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const row = this.db.select().from(schema.users).where(eq(schema.users.email, email)).get();
    return row ? this.toUser(row) : undefined;
  }

  async getUsersByTenantId(tenantId: string): Promise<User[]> {
    return this.db.select().from(schema.users).where(eq(schema.users.tenantId, tenantId)).all().map(this.toUser);
  }

  async createUser(user: User): Promise<void> {
    this.db.insert(schema.users).values({
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      passwordHash: user.passwordHash,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword ?? false,
      oauthProvider: user.oauthProvider ?? null,
      oauthProviderId: user.oauthProviderId ?? null,
      totpSecret: user.totpSecret ?? null,
      totpEnabled: user.totpEnabled ?? false,
      backupCodes: user.backupCodes ?? null,
      avatar: user.avatar ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }).run();
  }

  async updateUser(id: string, patch: Partial<Omit<User, 'id' | 'tenantId'>>): Promise<User | undefined> {
    const values: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (patch.email !== undefined) values.email = patch.email;
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.role !== undefined) values.role = patch.role;
    if (patch.passwordHash !== undefined) values.passwordHash = patch.passwordHash;
    if (patch.mustChangePassword !== undefined) values.mustChangePassword = patch.mustChangePassword;
    if (patch.oauthProvider !== undefined) values.oauthProvider = patch.oauthProvider;
    if (patch.oauthProviderId !== undefined) values.oauthProviderId = patch.oauthProviderId;
    if (patch.totpSecret !== undefined) values.totpSecret = patch.totpSecret;
    if (patch.totpEnabled !== undefined) values.totpEnabled = patch.totpEnabled;
    if (patch.backupCodes !== undefined) values.backupCodes = patch.backupCodes;
    if (patch.avatar !== undefined) values.avatar = patch.avatar;

    this.db.update(schema.users).set(values).where(eq(schema.users.id, id)).run();
    return this.getUserById(id);
  }

  async deleteUser(id: string): Promise<boolean> {
    // Delete sessions first
    this.db.delete(schema.authSessions).where(eq(schema.authSessions.userId, id)).run();
    const result = this.db.delete(schema.users).where(eq(schema.users.id, id)).run();
    return result.changes > 0;
  }

  async countUsersByTenantId(tenantId: string): Promise<number> {
    const result = this.db.select({ count: sql<number>`count(*)` })
      .from(schema.users).where(eq(schema.users.tenantId, tenantId)).get();
    return result?.count ?? 0;
  }

  private toUser(row: typeof schema.users.$inferSelect): User {
    return {
      id: row.id,
      tenantId: row.tenantId,
      email: row.email,
      passwordHash: row.passwordHash,
      name: row.name,
      role: row.role as User['role'],
      mustChangePassword: Boolean(row.mustChangePassword),
      oauthProvider: row.oauthProvider ?? null,
      oauthProviderId: row.oauthProviderId ?? null,
      totpSecret: row.totpSecret ?? null,
      totpEnabled: Boolean(row.totpEnabled),
      backupCodes: row.backupCodes ?? null,
      avatar: row.avatar ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // ── Auth sessions ────────────────────────────────────────────────────

  async createSession(session: AuthSession): Promise<void> {
    this.db.insert(schema.authSessions).values({
      id: session.id,
      userId: session.userId,
      tokenHash: session.tokenHash,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
    }).run();
  }

  async getSessionByTokenHash(tokenHash: string): Promise<AuthSession | undefined> {
    const row = this.db.select().from(schema.authSessions)
      .where(eq(schema.authSessions.tokenHash, tokenHash)).get();
    return row ?? undefined;
  }

  async deleteSession(id: string): Promise<void> {
    this.db.delete(schema.authSessions).where(eq(schema.authSessions.id, id)).run();
  }

  async deleteSessionsByUserId(userId: string): Promise<void> {
    this.db.delete(schema.authSessions).where(eq(schema.authSessions.userId, userId)).run();
  }

  // ── Password reset tokens ──────────────────────────────────────────

  async createPasswordResetToken(userId: string, tokenHash: string, expiresAt: string): Promise<void> {
    const id = `prt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.db.insert(schema.passwordResetTokens).values({
      id,
      userId,
      tokenHash,
      expiresAt,
      createdAt: new Date().toISOString(),
    }).run();
  }

  async getPasswordResetToken(tokenHash: string): Promise<{ userId: string; expiresAt: string } | undefined> {
    const row = this.db.select().from(schema.passwordResetTokens)
      .where(eq(schema.passwordResetTokens.tokenHash, tokenHash)).get();
    return row ? { userId: row.userId, expiresAt: row.expiresAt } : undefined;
  }

  async deletePasswordResetToken(tokenHash: string): Promise<void> {
    this.db.delete(schema.passwordResetTokens)
      .where(eq(schema.passwordResetTokens.tokenHash, tokenHash)).run();
  }

  async deleteExpiredPasswordResetTokens(): Promise<void> {
    const now = new Date().toISOString();
    this.db.delete(schema.passwordResetTokens)
      .where(sql`${schema.passwordResetTokens.expiresAt} < ${now}`).run();
  }

  // ── Usage ────────────────────────────────────────────────────────────

  async recordUsage(tenantId: string, type: 'event' | 'chat' | 'crawl' | 'ingest'): Promise<void> {
    const id = `usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.db.insert(schema.usageRecords).values({
      id,
      tenantId,
      type,
      createdAt: new Date().toISOString(),
    }).run();
  }

  async getUsageCount(tenantId: string, type: 'event' | 'chat', monthOffset = 0): Promise<number> {
    const now = new Date();
    const targetMonth = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    const monthStart = targetMonth.toISOString();
    const nextMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 1).toISOString();

    const result = this.db.select({ count: sql<number>`count(*)` })
      .from(schema.usageRecords)
      .where(and(
        eq(schema.usageRecords.tenantId, tenantId),
        eq(schema.usageRecords.type, type),
        gte(schema.usageRecords.createdAt, monthStart),
        sql`${schema.usageRecords.createdAt} < ${nextMonth}`,
      )).get();
    return result?.count ?? 0;
  }

  async getUsageLimits(tenantId: string): Promise<UsageLimits | undefined> {
    const row = this.db.select().from(schema.usageLimits)
      .where(eq(schema.usageLimits.tenantId, tenantId)).get();
    return row ?? undefined;
  }

  async setUsageLimits(limits: UsageLimits): Promise<void> {
    // Upsert
    const existing = await this.getUsageLimits(limits.tenantId);
    if (existing) {
      this.db.update(schema.usageLimits).set({
        maxEventsMonth: limits.maxEventsMonth,
        maxChatMonth: limits.maxChatMonth,
        maxUsers: limits.maxUsers,
        maxSdkKeys: limits.maxSdkKeys,
      }).where(eq(schema.usageLimits.tenantId, limits.tenantId)).run();
    } else {
      this.db.insert(schema.usageLimits).values(limits).run();
    }
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
    return this.db.select().from(schema.integrations)
      .where(eq(schema.integrations.tenantId, tenantId)).all()
      .map(this.toIntegration);
  }

  async getIntegrationById(id: string): Promise<Integration | undefined> {
    const row = this.db.select().from(schema.integrations).where(eq(schema.integrations.id, id)).get();
    return row ? this.toIntegration(row) : undefined;
  }

  async createIntegration(integration: Integration): Promise<void> {
    this.db.insert(schema.integrations).values({
      id: integration.id,
      tenantId: integration.tenantId,
      type: integration.type,
      name: integration.name,
      config: JSON.stringify(encryptConfigSecrets(integration.config)),
      enabled: integration.enabled,
      createdAt: integration.createdAt,
    }).run();
  }

  async updateIntegration(id: string, patch: Partial<Omit<Integration, 'id' | 'tenantId'>>): Promise<Integration | undefined> {
    const values: Record<string, unknown> = {};
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.config !== undefined) values.config = JSON.stringify(encryptConfigSecrets(patch.config));
    if (patch.enabled !== undefined) values.enabled = patch.enabled;
    if (patch.type !== undefined) values.type = patch.type;

    if (Object.keys(values).length > 0) {
      this.db.update(schema.integrations).set(values).where(eq(schema.integrations.id, id)).run();
    }
    return this.getIntegrationById(id);
  }

  async deleteIntegration(id: string): Promise<boolean> {
    // Delete triggers first
    this.db.delete(schema.integrationTriggers).where(eq(schema.integrationTriggers.integrationId, id)).run();
    const result = this.db.delete(schema.integrations).where(eq(schema.integrations.id, id)).run();
    return result.changes > 0;
  }

  private toIntegration(row: typeof schema.integrations.$inferSelect): Integration {
    return {
      id: row.id,
      tenantId: row.tenantId,
      type: row.type as Integration['type'],
      name: row.name,
      config: decryptConfigSecrets(JSON.parse(row.config) as Record<string, unknown>),
      enabled: Boolean(row.enabled),
      createdAt: row.createdAt,
    };
  }

  // ── Integration triggers ─────────────────────────────────────────────

  async getTriggersByIntegrationId(integrationId: string): Promise<IntegrationTrigger[]> {
    return this.db.select().from(schema.integrationTriggers)
      .where(eq(schema.integrationTriggers.integrationId, integrationId)).all()
      .map(this.toTrigger);
  }

  async getEnabledTriggersByEvent(tenantId: string, eventType: string): Promise<(IntegrationTrigger & { integration: Integration })[]> {
    const integrationsList = await this.getIntegrationsByTenantId(tenantId);
    const enabledIntegrations = integrationsList.filter(i => i.enabled);
    const results: (IntegrationTrigger & { integration: Integration })[] = [];

    for (const integration of enabledIntegrations) {
      const triggers = this.db.select().from(schema.integrationTriggers)
        .where(and(
          eq(schema.integrationTriggers.integrationId, integration.id),
          eq(schema.integrationTriggers.eventType, eventType),
          eq(schema.integrationTriggers.enabled, true),
        )).all().map(this.toTrigger);

      for (const trigger of triggers) {
        results.push({ ...trigger, integration });
      }
    }
    return results;
  }

  async createTrigger(trigger: IntegrationTrigger): Promise<void> {
    this.db.insert(schema.integrationTriggers).values({
      id: trigger.id,
      integrationId: trigger.integrationId,
      eventType: trigger.eventType,
      filterConfig: trigger.filterConfig ? JSON.stringify(trigger.filterConfig) : null,
      enabled: trigger.enabled,
    }).run();
  }

  async updateTrigger(id: string, patch: Partial<Omit<IntegrationTrigger, 'id' | 'integrationId'>>): Promise<IntegrationTrigger | undefined> {
    const values: Record<string, unknown> = {};
    if (patch.eventType !== undefined) values.eventType = patch.eventType;
    if (patch.filterConfig !== undefined) values.filterConfig = JSON.stringify(patch.filterConfig);
    if (patch.enabled !== undefined) values.enabled = patch.enabled;

    if (Object.keys(values).length > 0) {
      this.db.update(schema.integrationTriggers).set(values)
        .where(eq(schema.integrationTriggers.id, id)).run();
    }
    const row = this.db.select().from(schema.integrationTriggers)
      .where(eq(schema.integrationTriggers.id, id)).get();
    return row ? this.toTrigger(row) : undefined;
  }

  async deleteTrigger(id: string): Promise<boolean> {
    const result = this.db.delete(schema.integrationTriggers)
      .where(eq(schema.integrationTriggers.id, id)).run();
    return result.changes > 0;
  }

  private toTrigger(row: typeof schema.integrationTriggers.$inferSelect): IntegrationTrigger {
    return {
      id: row.id,
      integrationId: row.integrationId,
      eventType: row.eventType,
      filterConfig: row.filterConfig ? JSON.parse(row.filterConfig) : undefined,
      enabled: Boolean(row.enabled),
    };
  }

  // ── Tenant settings ──────────────────────────────────────────────────

  async getTenantSettings(tenantId: string): Promise<TenantSettings | undefined> {
    const row = this.db.select({
      llmProvider: schema.tenants.llmProvider,
      llmApiKey: schema.tenants.llmApiKey,
      llmBaseUrl: schema.tenants.llmBaseUrl,
      llmModel: schema.tenants.llmModel,
      sttBaseUrl: schema.tenants.sttBaseUrl,
      sttApiKey: schema.tenants.sttApiKey,
      sttModel: schema.tenants.sttModel,
      sttPath: schema.tenants.sttPath,
      embeddingProvider: schema.tenants.embeddingProvider,
      openaiApiKey: schema.tenants.openaiApiKey,
      ollamaUrl: schema.tenants.ollamaUrl,
      ollamaEmbeddingModel: schema.tenants.ollamaEmbeddingModel,
      chromaUrl: schema.tenants.chromaUrl,
      chromaCollection: schema.tenants.chromaCollection,
      embeddingDimensions: schema.tenants.embeddingDimensions,
    }).from(schema.tenants).where(eq(schema.tenants.id, tenantId)).get();
    if (!row) return undefined;
    return {
      llmProvider: row.llmProvider ?? undefined,
      llmApiKey: row.llmApiKey ? decrypt(row.llmApiKey) : undefined,
      llmBaseUrl: row.llmBaseUrl ?? undefined,
      llmModel: row.llmModel ?? undefined,
      sttBaseUrl: row.sttBaseUrl ?? undefined,
      sttApiKey: row.sttApiKey ? decrypt(row.sttApiKey) : undefined,
      sttModel: row.sttModel ?? undefined,
      sttPath: row.sttPath ?? undefined,
      embeddingProvider: row.embeddingProvider ?? undefined,
      openaiApiKey: row.openaiApiKey ? decrypt(row.openaiApiKey) : undefined,
      ollamaUrl: row.ollamaUrl ?? undefined,
      ollamaEmbeddingModel: row.ollamaEmbeddingModel ?? undefined,
      chromaUrl: row.chromaUrl ?? undefined,
      chromaCollection: row.chromaCollection ?? undefined,
      embeddingDimensions: row.embeddingDimensions ?? undefined,
    };
  }

  // ── Workflows ──────────────────────────────────────────────────────

  async getWorkflowsByTenantId(tenantId: string, status?: WorkflowStatus): Promise<Workflow[]> {
    const condition = status
      ? and(eq(schema.workflows.tenantId, tenantId), eq(schema.workflows.status, status))
      : eq(schema.workflows.tenantId, tenantId);
    const rows = this.db.select().from(schema.workflows).where(condition).all();
    return rows.map(this.toWorkflow);
  }

  async getWorkflowById(id: string, tenantId: string): Promise<Workflow | undefined> {
    const row = this.db.select().from(schema.workflows)
      .where(and(eq(schema.workflows.id, id), eq(schema.workflows.tenantId, tenantId))).get();
    return row ? this.toWorkflow(row) : undefined;
  }

  async createWorkflow(workflow: Workflow, steps: WorkflowStep[]): Promise<void> {
    this.db.insert(schema.workflows).values({
      id: workflow.id,
      tenantId: workflow.tenantId,
      name: workflow.name,
      description: workflow.description,
      status: workflow.status,
      source: workflow.source,
      tags: workflow.tags ? JSON.stringify(workflow.tags) : null,
      version: workflow.version,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    }).run();

    for (const step of steps) {
      this.db.insert(schema.workflowSteps).values({
        id: step.id,
        workflowId: step.workflowId,
        stepIndex: step.stepIndex,
        urlPattern: step.urlPattern,
        selector: step.selector,
        action: step.action,
        contextHint: step.contextHint,
        expectedSelectors: step.expectedSelectors ? JSON.stringify(step.expectedSelectors) : null,
        mapEntryId: step.mapEntryId ?? null,
      }).run();
    }
  }

  async updateWorkflow(id: string, tenantId: string, patch: Partial<Omit<Workflow, 'id' | 'tenantId'>>): Promise<Workflow | undefined> {
    const existing = await this.getWorkflowById(id, tenantId);
    if (!existing) return undefined;

    const values: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.source !== undefined) values.source = patch.source;
    if (patch.tags !== undefined) values.tags = JSON.stringify(patch.tags);
    if (patch.version !== undefined) values.version = patch.version;

    this.db.update(schema.workflows).set(values)
      .where(and(eq(schema.workflows.id, id), eq(schema.workflows.tenantId, tenantId))).run();
    return this.getWorkflowById(id, tenantId);
  }

  async deleteWorkflow(id: string, tenantId: string): Promise<boolean> {
    const existing = await this.getWorkflowById(id, tenantId);
    if (!existing) return false;
    // Delete steps first
    this.db.delete(schema.workflowSteps).where(eq(schema.workflowSteps.workflowId, id)).run();
    const result = this.db.delete(schema.workflows)
      .where(and(eq(schema.workflows.id, id), eq(schema.workflows.tenantId, tenantId))).run();
    return result.changes > 0;
  }

  async getWorkflowSteps(workflowId: string): Promise<WorkflowStep[]> {
    const rows = this.db.select().from(schema.workflowSteps)
      .where(eq(schema.workflowSteps.workflowId, workflowId)).all();
    return rows.map(this.toWorkflowStep).sort((a, b) => a.stepIndex - b.stepIndex);
  }

  async upsertWorkflowSteps(workflowId: string, steps: WorkflowStep[]): Promise<void> {
    // Delete existing steps and insert new ones
    this.db.delete(schema.workflowSteps).where(eq(schema.workflowSteps.workflowId, workflowId)).run();
    for (const step of steps) {
      this.db.insert(schema.workflowSteps).values({
        id: step.id,
        workflowId: step.workflowId,
        stepIndex: step.stepIndex,
        urlPattern: step.urlPattern,
        selector: step.selector,
        action: step.action,
        contextHint: step.contextHint,
        expectedSelectors: step.expectedSelectors ? JSON.stringify(step.expectedSelectors) : null,
        mapEntryId: step.mapEntryId ?? null,
      }).run();
    }
  }

  private toWorkflow(row: typeof schema.workflows.$inferSelect): Workflow {
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      description: row.description,
      status: row.status as Workflow['status'],
      source: row.source as Workflow['source'],
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toWorkflowStep(row: typeof schema.workflowSteps.$inferSelect): WorkflowStep {
    return {
      id: row.id,
      workflowId: row.workflowId,
      stepIndex: row.stepIndex,
      urlPattern: row.urlPattern,
      selector: row.selector,
      action: row.action as WorkflowStep['action'],
      contextHint: row.contextHint,
      expectedSelectors: row.expectedSelectors ? JSON.parse(row.expectedSelectors) : undefined,
      mapEntryId: row.mapEntryId ?? undefined,
    };
  }

  async updateTenantSettings(tenantId: string, settings: Partial<TenantSettings>): Promise<void> {
    const values: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (settings.llmProvider !== undefined) values.llmProvider = settings.llmProvider || null;
    if (settings.llmApiKey !== undefined) values.llmApiKey = settings.llmApiKey ? encrypt(settings.llmApiKey) : null;
    if (settings.llmBaseUrl !== undefined) values.llmBaseUrl = settings.llmBaseUrl || null;
    if (settings.llmModel !== undefined) values.llmModel = settings.llmModel || null;
    if (settings.sttBaseUrl !== undefined) values.sttBaseUrl = settings.sttBaseUrl || null;
    if (settings.sttApiKey !== undefined) values.sttApiKey = settings.sttApiKey ? encrypt(settings.sttApiKey) : null;
    if (settings.sttModel !== undefined) values.sttModel = settings.sttModel || null;
    if (settings.sttPath !== undefined) values.sttPath = settings.sttPath || null;
    if (settings.embeddingProvider !== undefined) values.embeddingProvider = settings.embeddingProvider || null;
    if (settings.openaiApiKey !== undefined) values.openaiApiKey = settings.openaiApiKey ? encrypt(settings.openaiApiKey) : null;
    if (settings.ollamaUrl !== undefined) values.ollamaUrl = settings.ollamaUrl || null;
    if (settings.ollamaEmbeddingModel !== undefined) values.ollamaEmbeddingModel = settings.ollamaEmbeddingModel || null;
    if (settings.chromaUrl !== undefined) values.chromaUrl = settings.chromaUrl || null;
    if (settings.chromaCollection !== undefined) values.chromaCollection = settings.chromaCollection || null;
    if (settings.embeddingDimensions !== undefined) values.embeddingDimensions = settings.embeddingDimensions || null;

    this.db.update(schema.tenants).set(values).where(eq(schema.tenants.id, tenantId)).run();
  }

  // ── Feature requests ────────────────────────────────────────────────

  async createFeatureRequest(request: FeatureRequest): Promise<void> {
    this.db.insert(schema.featureRequests).values({
      id: request.id,
      tenantId: request.tenantId,
      type: request.type,
      title: request.title,
      description: request.description,
      status: request.status,
      votes: request.votes,
      submittedBy: request.submittedBy,
      submittedByEmail: request.submittedByEmail ?? null,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    }).run();
  }

  async getFeatureRequestsByTenantId(tenantId: string, type?: FeedbackType, status?: FeatureRequestStatus): Promise<FeatureRequest[]> {
    let conditions = [eq(schema.featureRequests.tenantId, tenantId)];
    if (type) conditions.push(eq(schema.featureRequests.type, type));
    if (status) conditions.push(eq(schema.featureRequests.status, status));

    const rows = this.db.select().from(schema.featureRequests)
      .where(and(...conditions)).all();
    return rows.map(this.toFeatureRequest);
  }

  async getFeatureRequestById(id: string, tenantId: string): Promise<FeatureRequest | undefined> {
    const row = this.db.select().from(schema.featureRequests)
      .where(and(eq(schema.featureRequests.id, id), eq(schema.featureRequests.tenantId, tenantId))).get();
    return row ? this.toFeatureRequest(row) : undefined;
  }

  async updateFeatureRequest(id: string, tenantId: string, patch: Partial<Omit<FeatureRequest, 'id' | 'tenantId'>>): Promise<FeatureRequest | undefined> {
    const existing = await this.getFeatureRequestById(id, tenantId);
    if (!existing) return undefined;

    const values: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (patch.title !== undefined) values.title = patch.title;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.type !== undefined) values.type = patch.type;
    if (patch.votes !== undefined) values.votes = patch.votes;
    if (patch.submittedByEmail !== undefined) values.submittedByEmail = patch.submittedByEmail;

    this.db.update(schema.featureRequests).set(values)
      .where(and(eq(schema.featureRequests.id, id), eq(schema.featureRequests.tenantId, tenantId))).run();
    return this.getFeatureRequestById(id, tenantId);
  }

  async deleteFeatureRequest(id: string, tenantId: string): Promise<boolean> {
    const existing = await this.getFeatureRequestById(id, tenantId);
    if (!existing) return false;
    // Delete votes first
    this.db.delete(schema.featureRequestVotes)
      .where(eq(schema.featureRequestVotes.featureRequestId, id)).run();
    const result = this.db.delete(schema.featureRequests)
      .where(and(eq(schema.featureRequests.id, id), eq(schema.featureRequests.tenantId, tenantId))).run();
    return result.changes > 0;
  }

  async voteFeatureRequest(id: string, voterId: string): Promise<{ votes: number; alreadyVoted: boolean }> {
    // Check request exists (any tenant)
    const row = this.db.select().from(schema.featureRequests)
      .where(eq(schema.featureRequests.id, id)).get();
    if (!row) return { votes: 0, alreadyVoted: false };

    // Check for existing vote
    const existingVote = this.db.select().from(schema.featureRequestVotes)
      .where(and(
        eq(schema.featureRequestVotes.featureRequestId, id),
        eq(schema.featureRequestVotes.voterId, voterId),
      )).get();

    if (existingVote) {
      return { votes: row.votes, alreadyVoted: true };
    }

    // Record vote and increment
    const voteId = `vote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.db.insert(schema.featureRequestVotes).values({
      id: voteId,
      featureRequestId: id,
      voterId,
      createdAt: new Date().toISOString(),
    }).run();

    const newVotes = row.votes + 1;
    this.db.update(schema.featureRequests)
      .set({ votes: newVotes, updatedAt: new Date().toISOString() })
      .where(eq(schema.featureRequests.id, id)).run();

    return { votes: newVotes, alreadyVoted: false };
  }

  private toFeatureRequest(row: typeof schema.featureRequests.$inferSelect): FeatureRequest {
    return {
      id: row.id,
      tenantId: row.tenantId,
      type: row.type as FeatureRequest['type'],
      title: row.title,
      description: row.description,
      status: row.status as FeatureRequest['status'],
      votes: row.votes,
      submittedBy: row.submittedBy,
      submittedByEmail: row.submittedByEmail ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // ── Audit logs ──────────────────────────────────────────────────────

  async createAuditLog(entry: AuditLogEntry): Promise<void> {
    this.db.insert(schema.auditLogs).values({
      id: entry.id,
      tenantId: entry.tenantId,
      userId: entry.userId,
      userEmail: entry.userEmail,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId ?? null,
      details: entry.details ? JSON.stringify(entry.details) : null,
      ipAddress: entry.ipAddress ?? null,
      createdAt: entry.createdAt,
    }).run();
  }

  async getAuditLogs(tenantId: string, opts?: { limit?: number; offset?: number; action?: string; userId?: string }): Promise<AuditLogEntry[]> {
    const conditions = [eq(schema.auditLogs.tenantId, tenantId)];
    if (opts?.action) conditions.push(eq(schema.auditLogs.action, opts.action));
    if (opts?.userId) conditions.push(eq(schema.auditLogs.userId, opts.userId));

    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    const rows = this.db.select().from(schema.auditLogs)
      .where(and(...conditions))
      .orderBy(sql`created_at DESC`)
      .limit(limit)
      .offset(offset)
      .all();

    return rows.map(this.toAuditLog);
  }

  async countAuditLogs(tenantId: string, opts?: { action?: string; userId?: string }): Promise<number> {
    const conditions = [eq(schema.auditLogs.tenantId, tenantId)];
    if (opts?.action) conditions.push(eq(schema.auditLogs.action, opts.action));
    if (opts?.userId) conditions.push(eq(schema.auditLogs.userId, opts.userId));

    const result = this.db.select({ count: sql<number>`count(*)` })
      .from(schema.auditLogs)
      .where(and(...conditions))
      .get();
    return result?.count ?? 0;
  }

  private toAuditLog(row: typeof schema.auditLogs.$inferSelect): AuditLogEntry {
    return {
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      userEmail: row.userEmail,
      action: row.action,
      resource: row.resource,
      resourceId: row.resourceId ?? undefined,
      details: row.details ? JSON.parse(row.details) : undefined,
      ipAddress: row.ipAddress ?? undefined,
      createdAt: row.createdAt,
    };
  }

  // ── Surveys ────────────────────────────────────────────────────────

  async createSurvey(survey: SurveyDefinition): Promise<void> {
    this.db.insert(schema.surveys).values({
      id: survey.id,
      tenantId: survey.tenantId,
      name: survey.name,
      description: survey.description ?? null,
      questions: JSON.stringify(survey.questions),
      triggerOn: survey.triggerOn ?? null,
      active: survey.active ? 1 : 0,
      createdAt: survey.createdAt,
      updatedAt: survey.updatedAt,
    }).run();
  }

  async getSurveysByTenantId(tenantId: string): Promise<SurveyDefinition[]> {
    const rows = this.db.select().from(schema.surveys)
      .where(eq(schema.surveys.tenantId, tenantId)).all();
    return rows.map(r => this.toSurveyDefinition(r));
  }

  async getSurveyById(id: string, tenantId: string): Promise<SurveyDefinition | undefined> {
    const row = this.db.select().from(schema.surveys)
      .where(and(eq(schema.surveys.id, id), eq(schema.surveys.tenantId, tenantId))).get();
    return row ? this.toSurveyDefinition(row) : undefined;
  }

  async updateSurvey(id: string, tenantId: string, patch: Partial<Omit<SurveyDefinition, 'id' | 'tenantId'>>): Promise<SurveyDefinition | undefined> {
    const existing = await this.getSurveyById(id, tenantId);
    if (!existing) return undefined;

    const values: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.description !== undefined) values.description = patch.description ?? null;
    if (patch.questions !== undefined) values.questions = JSON.stringify(patch.questions);
    if (patch.triggerOn !== undefined) values.triggerOn = patch.triggerOn ?? null;
    if (patch.active !== undefined) values.active = patch.active ? 1 : 0;

    this.db.update(schema.surveys).set(values)
      .where(and(eq(schema.surveys.id, id), eq(schema.surveys.tenantId, tenantId))).run();
    return this.getSurveyById(id, tenantId);
  }

  async deleteSurvey(id: string, tenantId: string): Promise<boolean> {
    const existing = await this.getSurveyById(id, tenantId);
    if (!existing) return false;
    // Delete responses first
    this.db.delete(schema.surveyResponses)
      .where(and(eq(schema.surveyResponses.surveyId, id), eq(schema.surveyResponses.tenantId, tenantId))).run();
    const result = this.db.delete(schema.surveys)
      .where(and(eq(schema.surveys.id, id), eq(schema.surveys.tenantId, tenantId))).run();
    return result.changes > 0;
  }

  async createSurveyResponse(response: SurveyResponse): Promise<void> {
    this.db.insert(schema.surveyResponses).values({
      id: response.id,
      surveyId: response.surveyId,
      tenantId: response.tenantId,
      sessionId: response.sessionId,
      answers: JSON.stringify(response.answers),
      createdAt: response.createdAt,
    }).run();
  }

  async getSurveyResponses(surveyId: string, tenantId: string): Promise<SurveyResponse[]> {
    const rows = this.db.select().from(schema.surveyResponses)
      .where(and(eq(schema.surveyResponses.surveyId, surveyId), eq(schema.surveyResponses.tenantId, tenantId))).all();
    return rows.map(r => this.toSurveyResponse(r));
  }

  async getSurveyResponseStats(surveyId: string, tenantId: string): Promise<{
    totalResponses: number;
    questionStats: Record<string, { average?: number; distribution?: Record<string, number> }>;
  }> {
    const responses = await this.getSurveyResponses(surveyId, tenantId);
    const survey = await this.getSurveyById(surveyId, tenantId);
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
        stats.distribution = { responses: values.length };
      }

      questionStats[q.id] = stats;
    }

    return { totalResponses: responses.length, questionStats };
  }

  private toSurveyDefinition(row: typeof schema.surveys.$inferSelect): SurveyDefinition {
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      description: row.description ?? undefined,
      questions: JSON.parse(row.questions) as SurveyQuestion[],
      triggerOn: row.triggerOn ?? undefined,
      active: row.active === 1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toSurveyResponse(row: typeof schema.surveyResponses.$inferSelect): SurveyResponse {
    return {
      id: row.id,
      surveyId: row.surveyId,
      tenantId: row.tenantId,
      sessionId: row.sessionId,
      answers: JSON.parse(row.answers),
      createdAt: row.createdAt,
    };
  }

  // ── Telemetry events ────────────────────────────────────────────────────

  async addTelemetryEvent(event: TelemetryEventRecord): Promise<void> {
    await this.db.insert(schema.telemetryEvents).values({
      id: event.id,
      tenantId: event.tenantId,
      platform: event.platform,
      eventName: event.eventName,
      screenName: event.screenName ?? null,
      appVersion: event.appVersion ?? null,
      deviceInfo: event.deviceInfo ?? null,
      properties: event.properties ?? null,
      createdAt: event.createdAt,
    });
  }
}
