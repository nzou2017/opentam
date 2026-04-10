# Q — Implementation Plan

## Tech Stack Decisions

These are final choices, not options:

| Layer | Choice | Rationale |
|---|---|---|
| **Monorepo** | pnpm workspaces | Single repo for SDK, backend, dashboard |
| **Observer SDK** | TypeScript → esbuild bundle | Keeps final output <20kb |
| **Backend** | Node.js + Fastify + TypeScript | Fast, low overhead, good streaming support |
| **LLM** | Claude 3.5 Sonnet (primary) | Best at HTML/code reasoning and tool use |
| **Agent orchestration** | LangGraph.js | Structured Plan-Act-Observe loop with TypeScript support |
| **Vector DB** | Pinecone (serverless) | Managed, no infra, easy multi-tenancy via namespaces |
| **Document parsing** | LlamaIndex (TS) | Handles Markdown, PDF, HTML out of the box |
| **App DB** | PostgreSQL + Drizzle ORM | Tenants, functional maps, session state |
| **Dashboard** | Next.js 14 (App Router) | Co-located with API routes for rapid iteration |
| **Guidance overlays** | Driver.js | Lighter than Intro.js, programmatic API |
| **Auth** | Clerk | Fast to integrate, handles multi-tenant org model |
| **Infra** | Docker + Railway (Phase 1) → self-hosted option later |

---

## Repository Structure

```
q/
├── packages/
│   ├── sdk/              # The Observer — <20kb client JS
│   ├── backend/          # Fastify API + LangGraph agent
│   ├── dashboard/        # Next.js admin control plane
│   └── shared/           # Types, schemas shared across packages
├── docker-compose.yml    # Local dev: Postgres + Pinecone mock
├── pnpm-workspace.yaml
└── turbo.json
```

---

## Core Data Models

### Tenant
```typescript
{
  id: uuid,
  name: string,
  sdkKey: string,          // public key embedded in SDK snippet
  secretKey: string,       // server-side key for backend calls
  plan: "hobbyist" | "startup" | "enterprise"
}
```

### FunctionalMap
The central data structure the Brain reasons over. One per tenant.
```typescript
{
  tenantId: uuid,
  entries: [{
    feature: string,          // "API Key Generation"
    url: string,              // "/settings/api-keys"
    selector: string,         // "#btn-generate-api"
    description: string,      // Human-readable context for the LLM
    preconditions?: string[]  // e.g. ["email_verified", "plan !== 'free'"]
  }]
}
```

### FrustrationEvent
```typescript
{
  tenantId: uuid,
  sessionId: string,
  userId?: string,           // optional, passed by customer
  currentUrl: string,
  signals: {
    rageClicks: number,
    deadEndLoops: number,     // same 2 pages visited 3+ times
    dwellSeconds: number,
    cursorEntropy: number     // variance in mouse movement
  },
  domSnapshot: string,       // compressed relevant DOM fragment
  timestamp: Date
}
```

### InterventionLog
```typescript
{
  eventId: uuid,
  tenantId: uuid,
  action: "overlay_highlight" | "deep_link" | "message_only" | "dismissed",
  elementId?: string,
  message: string,
  resolved: boolean,         // did the user complete the task after?
  dismissedAt?: Date
}
```

---

## Phase 1: Observer MVP

**Goal:** Q appears at the right moment and can guide users to the right place via a manually-authored functional map.

**Definition of done:**
- SDK drops into any site with a `<script>` tag + SDK key
- Detects rage clicks, dead-end loops, and dwell anomalies
- Sends frustration events to the Q backend
- Backend calls Claude with the functional map + event context
- Claude returns a structured intervention command
- SDK renders a Driver.js highlight or a toast message
- Dashboard lets the tenant CRUD their functional map

### 1.1 SDK (`packages/sdk`)

```
src/
├── index.ts          # Entry: init(sdkKey, options)
├── observer.ts       # Event listeners + heuristic scoring
├── transport.ts      # Debounced POST to Q backend
├── actor.ts          # Executes intervention commands (Driver.js, deep link)
└── ui.ts             # The "Q pulse" widget in the corner
```

**Heuristic thresholds (tunable per tenant):**
- Rage click: 3+ clicks on same non-interactive element within 2s
- Dead-end loop: same 2 URLs visited 3+ times in 5 minutes
- Dwell: 90+ seconds on page with no meaningful interaction
- Cooldown: suppress Q for a feature for 24h after dismissal

**SDK API:**
```typescript
Q.init("sdk_key_xxx", {
  userId: "user-123",       // optional
  cooldownHours: 24,        // default
  thresholds: { rageClicks: 3, dwellSeconds: 90 }
})
```

### 1.2 Backend API (`packages/backend`)

**Endpoints:**

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/events` | Receive FrustrationEvent from SDK |
| `GET/POST/PUT/DELETE` | `/api/v1/map` | CRUD functional map entries |
| `GET` | `/api/v1/analytics` | Aggregated frustration heatmap data |

**Event processing pipeline:**
```
FrustrationEvent received
  → Score severity (low / medium / high)
  → If high: invoke LangGraph agent
      → Tool: lookup_functional_map(currentUrl, domSnapshot)
      → Tool: retrieve_docs(detected_intent)  [Phase 2]
      → LLM synthesizes intervention
      → Return { action, selector, message, confidence }
  → Log InterventionLog
  → Stream response back to SDK
```

**LangGraph agent tools (Phase 1):**
- `lookup_functional_map` — vector search over the tenant's functional map entries
- `deep_link` — return a redirect URL
- `highlight_element` — return a selector for Driver.js

### 1.3 Dashboard (`packages/dashboard`)

**Routes:**
- `/` — Overview: total sessions, intervention rate, resolution rate
- `/map` — Functional map editor (table with add/edit/delete)
- `/analytics` — Frustration heatmap (which URLs trigger Q most)
- `/settings` — SDK snippet, API keys, thresholds
- `/install` — Onboarding: copy-paste SDK snippet

**Auto-Mapper (stretch goal for Phase 1):** A "Record Mode" button that lets the tenant click through their own app while Q records visited URLs and inspected elements, auto-drafting functional map entries for review.

---

## Phase 2: Learner (RAG Pipeline)

**Goal:** Q can answer "how do I..." questions without manual mapping, by reading the customer's docs and source code.

### 2.1 Doc Ingestion Pipeline

```
packages/backend/src/ingestion/
├── parsers/
│   ├── markdown.ts     # For /docs folders, Notion exports
│   ├── html.ts         # For help centers (Intercom, Zendesk)
│   └── pdf.ts          # LlamaIndex PDF loader
├── chunker.ts          # Semantic chunking (512 tokens, 50 overlap)
├── embedder.ts         # text-embedding-3-small via OpenAI or Voyage
└── indexer.ts          # Upsert to Pinecone namespace per tenant
```

**Triggered by:** tenant uploads a ZIP of docs, or connects a URL (crawler), or connects a GitHub repo.

### 2.2 Source Code Crawler (UI Structure Only)

Parse the customer's frontend repo to extract UI-relevant metadata — **not business logic**.

**What to extract:**
- React/Vue component names and their route associations
- Button labels, `aria-label` attributes, `data-testid` values
- `<Link>` and `<a>` hrefs
- Form field labels and IDs

**Approach:**
1. Customer connects GitHub repo via OAuth
2. Backend clones/fetches only `src/` (shallow)
3. AST parser (using `@babel/parser` or `ts-morph`) extracts UI metadata
4. Results merged into the functional map (marked as `source: "crawler"`)

**MCP compatibility:** Expose the indexing pipeline as an MCP server so enterprise customers can self-host and connect their private repos without giving Q access.

### 2.3 Upgraded LangGraph Agent Tools

Add to Phase 1 tools:
- `search_docs(query)` — semantic search over ingested documentation
- `search_ui_structure(query)` — search crawled component metadata
- `explain_precondition(feature)` — why is this disabled? (e.g., email not verified)

---

## Phase 3: Actor (Interactive Walkthroughs)

**Goal:** Q physically guides the user — highlights, spotlights, and step-by-step tours.

### 3.1 Multi-Step Tour Engine

Extend the actor with a `tour` action type:

```typescript
{
  action: "tour",
  steps: [
    { selector: "#nav-settings", message: "Click Settings" },
    { selector: "#tab-api", message: "Open the API tab" },
    { selector: "#btn-generate", message: "Click Generate Key" }
  ]
}
```

SDK drives Driver.js through the steps, advancing on each user click.

### 3.2 Autonomous Interaction (Optional / Enterprise)

For tasks too complex for visual guidance (e.g., multi-form workflows):
- Use `browser-use` (Python microservice) called from the Node backend
- Operates in a side-by-side panel or browser extension, not injected into the customer's DOM
- Requires explicit user opt-in: "Let Q do this for me"
- Enterprise-only feature (audit log required)

### 3.3 Q-Proxy Demo Engine (Sales Tool)

A separate lightweight service for the sales team:

```
packages/proxy/
├── worker.ts       # Cloudflare Worker: fetches target URL, rewrites HTML, injects SDK
├── portal/         # Sales portal UI: enter URL, get live demo link
└── hotkeys.ts      # "Simulate frustration" button for demos
```

Also supports "Mock-to-Motion": salesperson uploads a screenshot → GPT-4o Vision generates a functional map → Q overlaid on the static image.

---

## Development Milestones

| Milestone | Deliverable |
|---|---|
| **M1** (2 weeks) | Monorepo scaffolded, SDK sends events, backend receives them |
| **M2** (2 weeks) | LangGraph agent returns interventions, SDK executes highlights |
| **M3** (2 weeks) | Dashboard with functional map editor + SDK snippet |
| **M4** (2 weeks) | Doc ingestion + Pinecone RAG working end-to-end |
| **M5** (2 weeks) | GitHub crawler + MCP server for UI structure indexing |
| **M6** (2 weeks) | Multi-step tour engine + frustration heatmap analytics |
| **M7** (ongoing) | Q-Proxy demo tool + self-hosted Docker packaging |

---

## Key Implementation Notes

**Privacy by design:**
- The DOM snapshot sent to the backend strips text content — only element IDs, classes, `aria-label`, and `data-*` attributes are captured
- No keystrokes or form values are ever transmitted
- Tenant data in Pinecone is namespaced by `tenantId`; cross-tenant reads are impossible at the query level

**Multi-tenancy:**
- Every backend call is scoped by `tenantId` derived from the SDK key (verified server-side)
- Pinecone namespaces: `{tenantId}-docs`, `{tenantId}-ui`
- Postgres row-level security on all tables

**Intervention quality loop:**
- Track `resolved: boolean` on every InterventionLog (did the user complete the target action within 60s?)
- Use resolution rate as the primary product health metric
- Low-resolution interventions surface in the dashboard for the tenant to fix their functional map

**Cooldown mechanics:**
- Stored in `localStorage` on the client with feature-level keys
- Also tracked server-side in the session to prevent SDK tampering
