# PM/TAM Discovery Agent — Phased Implementation Plan

Turns Q's prompt-driven, stateless feedback capture into the stateful,
observable, playbook-driven discovery agent described in
`pm_tam_customer_discovery_agent_design.md`.

Guiding principle (design doc §5): **the application owns the workflow; the
LLM reasons.** Each phase moves one responsibility out of the prompt and into
deterministic, persisted, testable code.

---

## Phase map (what ships, in what order, and why)

| Phase | Theme | Ships | Doc refs | Depends on |
|------|-------|-------|----------|-----------|
| **1** | **State + trace spine** | Server-side `Case`, `Message`, `ExtractedFact`, `AgentTurn` persistence; `chat.ts` stops trusting client `history`; every turn writes a trace | §5, §6, §7, §20, §25, §28 | — |
| 2 | Playbook engine | `feature_request` / `bug_report` YAML + deterministic `evaluate(case) → missing[]`; `runChatAgent` becomes extract → merge → evaluate → respond | §4.2, §8, §16, §17, §18, §25 | 1 |
| 3 | Requirements + confirmation | `Requirement` objects, customer-confirmation step, structured handoff replaces the flat `feature_requests` write | §21, §22, §23, §27 | 1, 2 |
| 4 | Evidence-aware retrieval | Chroma metadata enrichment, retrieval planner, evidence/claim objects, contradiction detection | §12, §13, §14, §15 | 1 |
| 5 | Evaluation harness | Scenario suite over persisted traces; readiness + hygiene metrics | §29 | 1, 2 |

Phases 2–5 all stand on Phase 1. Nothing else is implementable while the
agent's memory is a client-supplied `history` array. Phase 1 is therefore the
only phase scoped in full detail below; later phases are sketched at the end.

---

## Phase 1 — State + Trace Spine (first PR)

### Goal

1. Persist conversation state server-side, keyed by `(tenantId, sessionId)`, so
   the agent's memory no longer comes from the client.
2. Record one `AgentTurn` trace per chat request (why the agent did what it
   did), even before any playbook exists.
3. Ship behind a flag, fully backward-compatible — no behavior change to
   replies yet; this phase is pure substrate.

### Non-goals (explicitly deferred)

- No playbook, fact-extraction LLM call, requirement objects, or confirmation
  step (Phases 2–3).
- `ExtractedFact` table is **created and written opportunistically** but not yet
  consumed for question planning — it exists so Phase 2 has somewhere to write.
- No dashboard UI for cases/traces yet (add in a Phase 1.5 follow-up if wanted).

### Why this is the production unlock

`routes/chat.ts:54` trusts a client-supplied `history` array and persists only
a usage tick (`chat.ts:66`). That means: the client controls the agent's entire
memory, nothing is auditable, nothing survives a refresh, and there is no
server-side object for Phases 2–5 to attach to. Phase 1 fixes exactly this.

---

### 1.1 New shared types (`packages/shared/src/index.ts`)

Append a new section. Keep these provider-agnostic (no Anthropic/SQLite types).

```ts
// ── Discovery: case state & traces ───────────────────────────────────────

export type CaseType = 'feature_request' | 'bug_report' | 'positive_feedback' | 'unknown';
export type CaseStatus = 'open' | 'ready' | 'filed' | 'abandoned';

export interface DiscoveryCase {
  id: string;
  tenantId: string;
  sessionId: string;           // natural key with tenantId
  type: CaseType;              // starts 'unknown'; reclassified later (§9)
  status: CaseStatus;          // 'open' until Phase 3 marks it 'ready'/'filed'
  platform: Platform;
  featureRequestId?: string;   // set when Phase 3 files a handoff
  createdAt: string;
  updatedAt: string;
}

export type MessageRole = 'user' | 'assistant';

export interface ConversationMessage {
  id: string;
  caseId: string;
  tenantId: string;
  role: MessageRole;
  content: string;
  seq: number;                 // monotonic per case; server-assigned
  createdAt: string;
}

// Provenance per fact (design doc §7). Phase 1 writes these best-effort;
// Phase 2 consumes them.
export type FactStatus =
  | 'unknown' | 'inferred' | 'customer_stated'
  | 'customer_confirmed' | 'kb_supported' | 'conflicting';

export interface ExtractedFact {
  id: string;
  caseId: string;
  tenantId: string;
  field: string;               // e.g. 'problem_statement'
  value: string;
  sourceType: 'customer' | 'kb' | 'agent' | 'pm';
  sourceMessageId?: string;
  confidence: number;          // 0..1
  status: FactStatus;
  createdAt: string;
}

// One row per chat request — the "why" record (design doc §28).
export interface AgentTurn {
  id: string;
  caseId: string;
  tenantId: string;
  sessionId: string;
  userMessageId: string;
  assistantMessageId?: string;
  intent: CaseType;
  // JSON blobs kept opaque in Phase 1; typed as records fill in later phases.
  factsExtracted: unknown;     // [] in Phase 1
  retrievalQueries: unknown;   // [] in Phase 1
  missingFieldsBefore: unknown;// [] in Phase 1
  missingFieldsAfter: unknown; // [] in Phase 1
  nextAction: string;          // 'answer' | 'ask' | 'submit' | ... (free-text P1)
  toolsCalled: string[];
  model: string;
  latencyMs: number;
  tokenUsage?: { input: number; output: number };
  createdAt: string;
}
```

> Rebuild `@opentam/shared` after editing (`pnpm --filter @opentam/shared build`)
> — backend typechecks against the built `dist`, as the license work just
> re-confirmed.

### 1.2 Drizzle schema (`packages/backend/src/db/schema.ts`)

Mirror existing conventions (text PKs, `tenant_id` FK, snake_case columns,
ISO-string timestamps). Append:

```ts
export const discoveryCases = sqliteTable('discovery_cases', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  sessionId: text('session_id').notNull(),
  type: text('type').notNull().default('unknown'),
  status: text('status').notNull().default('open'),
  platform: text('platform').notNull().default('web'),
  featureRequestId: text('feature_request_id').references(() => featureRequests.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const conversationMessages = sqliteTable('conversation_messages', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => discoveryCases.id),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  role: text('role').notNull(),
  content: text('content').notNull(),
  seq: integer('seq').notNull(),
  createdAt: text('created_at').notNull(),
});

export const extractedFacts = sqliteTable('extracted_facts', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => discoveryCases.id),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  field: text('field').notNull(),
  value: text('value').notNull(),
  sourceType: text('source_type').notNull(),
  sourceMessageId: text('source_message_id'),
  confidence: real('confidence').notNull().default(0),
  status: text('status').notNull().default('customer_stated'),
  createdAt: text('created_at').notNull(),
});

export const agentTurns = sqliteTable('agent_turns', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => discoveryCases.id),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  sessionId: text('session_id').notNull(),
  userMessageId: text('user_message_id').notNull(),
  assistantMessageId: text('assistant_message_id'),
  intent: text('intent').notNull().default('unknown'),
  factsExtracted: text('facts_extracted', { mode: 'json' }).notNull(),
  retrievalQueries: text('retrieval_queries', { mode: 'json' }).notNull(),
  missingFieldsBefore: text('missing_fields_before', { mode: 'json' }).notNull(),
  missingFieldsAfter: text('missing_fields_after', { mode: 'json' }).notNull(),
  nextAction: text('next_action').notNull(),
  toolsCalled: text('tools_called', { mode: 'json' }).notNull(),
  model: text('model').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  tokenUsage: text('token_usage', { mode: 'json' }),
  createdAt: text('created_at').notNull(),
});
```

`real` is already needed — add to the drizzle import at the top of `schema.ts`
if not present.

### 1.3 Raw-SQL migration (`packages/backend/src/db/sqliteStore.ts`, `migrate()`)

The project doesn't use drizzle-kit migrations — `migrate()` runs idempotent
`CREATE TABLE IF NOT EXISTS` + `addColumnIfMissing` (see `sqliteStore.ts:51`,
`:298`). Append to the `driver.exec(` block, matching the existing style:

```sql
CREATE TABLE IF NOT EXISTS discovery_cases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  session_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'open',
  platform TEXT NOT NULL DEFAULT 'web',
  feature_request_id TEXT REFERENCES feature_requests(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_discovery_cases_session
  ON discovery_cases(tenant_id, session_id);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES discovery_cases(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  seq INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_case
  ON conversation_messages(case_id, seq);

CREATE TABLE IF NOT EXISTS extracted_facts (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES discovery_cases(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_message_id TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'customer_stated',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_extracted_facts_case
  ON extracted_facts(case_id, field);

CREATE TABLE IF NOT EXISTS agent_turns (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES discovery_cases(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  session_id TEXT NOT NULL,
  user_message_id TEXT NOT NULL,
  assistant_message_id TEXT,
  intent TEXT NOT NULL DEFAULT 'unknown',
  facts_extracted TEXT NOT NULL,
  retrieval_queries TEXT NOT NULL,
  missing_fields_before TEXT NOT NULL,
  missing_fields_after TEXT NOT NULL,
  next_action TEXT NOT NULL,
  tools_called TEXT NOT NULL,
  model TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  token_usage TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_turns_case ON agent_turns(case_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_turns_tenant ON agent_turns(tenant_id, created_at);
```

The `UNIQUE(tenant_id, session_id)` on `discovery_cases` is what makes
"get-or-create case" race-safe and keeps one case per chat session.

### 1.4 Store interface (`packages/backend/src/db/store.ts`)

Add to the `Store` interface, grouped near the feature-request methods:

```ts
// ── Discovery cases ──────────────────────────────────────────────────────
getOrCreateCase(params: {
  tenantId: string; sessionId: string; platform: Platform;
}): Promise<DiscoveryCase>;
getCaseById(id: string, tenantId: string): Promise<DiscoveryCase | undefined>;
updateCase(id: string, tenantId: string, patch: Partial<Omit<DiscoveryCase, 'id' | 'tenantId'>>): Promise<DiscoveryCase | undefined>;

appendMessage(msg: Omit<ConversationMessage, 'seq'>): Promise<ConversationMessage>; // server assigns seq
getMessages(caseId: string, tenantId: string, limit?: number): Promise<ConversationMessage[]>;

addFact(fact: ExtractedFact): Promise<void>;
getFacts(caseId: string, tenantId: string): Promise<ExtractedFact[]>;

recordAgentTurn(turn: AgentTurn): Promise<void>;
getAgentTurns(caseId: string, tenantId: string): Promise<AgentTurn[]>;
```

Implement in **both** stores:

- **`sqliteStore.ts`** — follow the `createFeatureRequest` / `getFeatureRequestsByTenantId`
  patterns. `getOrCreateCase`: `INSERT ... ON CONFLICT(tenant_id, session_id) DO NOTHING`
  then `SELECT`, inside a transaction. `appendMessage`: `seq = (SELECT COALESCE(MAX(seq),0)+1 ...)`
  computed in the same transaction.
- **`inMemoryStore.ts`** — mirror with `Map`s (`casesById`, `casesBySession`,
  `messagesByCase`, `factsByCase`, `turnsByCase`); `seq` from array length.
  Keep in-memory and sqlite semantics identical — the test suite (§Testing in
  CLAUDE.md) runs on the in-memory store via `app.inject()`.

### 1.5 Wire into the chat route (`packages/backend/src/routes/chat.ts`)

Behind a config flag so it's a no-op until explicitly enabled.

- Add `discoveryState: process.env.DISCOVERY_STATE === 'true'` to `config.ts`
  (defaults false — same pattern as `registerTenantsWithLicenseServer`).
- When the flag is **off**: unchanged behavior (keep passing client `history`).
- When **on**, in the `/api/v1/chat` handler (around `chat.ts:54–66`):
  1. `const caseRow = await store.getOrCreateCase({ tenantId, sessionId, platform });`
  2. `const userMsg = await store.appendMessage({ role: 'user', content: message, caseId: caseRow.id, tenantId, ... });`
  3. Load server history instead of trusting the client:
     `const serverHistory = (await store.getMessages(caseRow.id, tenantId, 20)).map(m => ({ role: m.role, content: m.content }));`
     Pass `serverHistory` to `runChatAgent` in place of `history`.
  4. Run the agent (unchanged) — capture `latencyMs` around the call and
     `tokensUsed` if the provider returns it.
  5. `const asstMsg = await store.appendMessage({ role: 'assistant', content: result.reply, caseId: caseRow.id, tenantId, ... });`
  6. `await store.recordAgentTurn({ ... intent: caseRow.type, factsExtracted: [], retrievalQueries: [], missingFieldsBefore: [], missingFieldsAfter: [], nextAction: result.intervention ? 'intervene' : 'answer', toolsCalled: [], model, latencyMs, tokenUsage });`
  7. `await store.updateCase(caseRow.id, tenantId, { updatedAt: now });`

> The empty-array trace fields are intentional placeholders — Phase 2 fills
> `factsExtracted` / `missingFields*` once extraction and the playbook exist.
> Writing the row now means the observability plumbing is proven before there's
> anything interesting to put in it.

To capture `toolsCalled` without reworking the agent, have `runChatAgent`
return the tool names it invoked alongside `{ reply, intervention }` (small
additive change — push `block.name` into an array in the existing tool-dispatch
loop at `chatAgent.ts:237–259`). Optional in P1; can default to `[]`.

### 1.6 Tests (`packages/backend/src/__tests__/`)

New file `discoveryState.test.ts`, using the existing `buildApp()` + `app.inject()`
harness (in-memory store, no mocks — matches the repo's test convention):

1. **Case get-or-create is idempotent** — two chat calls with the same
   `sessionId` reuse one `discovery_cases` row (assert via a store read).
2. **Messages persist and increment `seq`** — after N turns, `getMessages`
   returns 2N rows in order with contiguous `seq`.
3. **Server history beats client history** — send a chat with a bogus
   `history` in the body; assert the agent was given the server-persisted
   messages, not the client array. (Spy on `runChatAgent`'s history arg, or
   assert via a stub provider.)
4. **An `AgentTurn` is written per request** with `latencyMs > 0`, correct
   `caseId`, and `model` populated.
5. **Flag off = no rows** — with `DISCOVERY_STATE` unset, no discovery tables
   are touched and replies are byte-identical to today.

### 1.7 Rollout / ops notes

- **Migration is additive and idempotent** — `CREATE TABLE IF NOT EXISTS` only;
  zero risk to existing tables. No backfill needed (cases start accruing when
  the flag flips on).
- **Flag-gated** — ship dark, enable per-environment. Behavior identical until
  on.
- **Retention** — `conversation_messages` and `agent_turns` grow unbounded;
  file a follow-up for a TTL/prune job (not P1, but note it now).
- **PII** — messages are now persisted server-side. Confirm this is covered by
  the existing tenant data-retention posture before enabling in prod; may need
  a deletion path (tie into any existing tenant-data-deletion flow).

### 1.8 Phase 1 PR checklist

- [ ] `@opentam/shared` types added + package rebuilt
- [ ] `schema.ts` drizzle defs
- [ ] `sqliteStore.migrate()` raw SQL + store methods
- [ ] `inMemoryStore` store methods (parity)
- [ ] `store.ts` interface
- [ ] `config.ts` flag + `chat.ts` wiring (flag-gated)
- [ ] `discoveryState.test.ts` green; full `pnpm --filter backend test` green
- [ ] `pnpm --filter backend lint` clean
- [ ] `.env.example` documents `DISCOVERY_STATE`

---

## Phases 2–5 (sketch — detail each when it becomes the active PR)

### Phase 2 — Playbook engine (design doc §4.2, §8, §16–18, §25)
- `packages/backend/src/playbooks/*.yaml` (`feature_request`, `bug_report`),
  version-controlled; a `playbook-evaluator.ts` with a pure
  `evaluate(case, facts) → { missing: string[], readiness: number, stage }`.
- Add a fact-extraction step (one cheap LLM call, or structured-output) that
  populates `extracted_facts`; restructure `runChatAgent` into
  extract → merge → evaluate → plan → respond (doc §25). The current loop
  becomes the final "respond" stage.
- Fill the `AgentTurn` trace fields that Phase 1 stubbed.

### Phase 3 — Requirements + confirmation (§21–23, §27)
- `requirements` + `assumptions` tables; customer-confirmation turn before a
  case flips to `status='ready'`.
- `submit_feedback` becomes "emit structured handoff from a confirmed case"
  (links `discovery_cases.featureRequestId`) rather than writing a flat row
  from one message. Enumerate explicit agent actions incl. `ESCALATE_*`.

### Phase 4 — Evidence-aware retrieval (§12–15)
- Enrich Chroma metadata at ingest (`ingestion/indexer.ts:50` — add
  `component`, `document_type`, `version`, `status`, `updated_at`); add a
  retrieval planner + metadata filtering; introduce claim/evidence objects and
  a contradiction check against customer facts.
- Formalize the `KnowledgeService` abstraction (doc §13) so Chroma is one
  backend among several.

### Phase 5 — Evaluation harness (§29)
- Scenario suite (TEST-001…010 from the doc) replayed through the agent;
  metrics derived from persisted `agent_turns` + readiness: required-field
  completeness, unsupported-claim rate, redundant-question rate, correct
  classification. This is only possible because Phase 1 persisted the traces.

---

## One-line rationale

Phase 1 is the whole bet: once conversation state and per-turn traces live
server-side, every later phase is an additive module over real data instead of
a bigger prompt. Until then, nothing else is buildable.
