# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Q Is

An AI-powered customer support agent that detects user frustration in real-time (rage clicks, dwell time, cursor entropy) and provides non-intrusive guidance using RAG over product documentation and source code.

## Monorepo Structure

pnpm + Turborepo monorepo. All packages live under `packages/`:

| Package | Description |
|---------|-------------|
| `backend` | Fastify API server — the core backend |
| `dashboard` | Next.js admin portal |
| `sdk` | Vanilla JS client SDK (<20kb), bundles to `dist/q.min.js` |
| `shared` | Shared TypeScript types consumed by all packages |
| `mcp` | Model Context Protocol server (crawl repos, ingest docs via AI agents) |
| `proxy` | Q-Proxy reverse proxy for sales demos |

The `@opentam/shared` package is the source of truth for cross-package types (`FrustrationEvent`, `InterventionCommand`, `FunctionalMapEntry`, etc.).

## Commands

From the monorepo root:
```bash
pnpm dev          # start all packages in dev mode (turbo)
pnpm build        # build all packages
pnpm lint         # typecheck all packages
```

Per-package (run from `packages/<name>/` or with `--filter`):
```bash
pnpm --filter backend dev        # tsx watch
pnpm --filter backend test       # vitest run (backend only)
pnpm --filter backend test:watch # vitest watch
pnpm --filter dashboard dev      # next dev -p 3000
pnpm --filter sdk build          # tsc → dist/q.min.js
```

Docker (starts backend + dashboard + ChromaDB + proxy):
```bash
docker-compose up
```

## Architecture

### Three-module loop

1. **Observer** (`packages/sdk/src/observer.ts`) — runs in the browser. Detects rage clicks, dwell anomalies, cursor entropy. Fires `onThresholdCrossed` → `QUI.showGreeting()`.

2. **Brain** (`packages/backend/src/agent/`) — Fastify handles the `POST /api/v1/events` route, scores frustration (`services/frustrationScorer.ts`), then runs the LangGraph/Anthropic agent (`agent/graph.ts` or `agent/chatAgent.ts`). The agent calls tools: `lookup_functional_map`, `search_docs`, `search_workflows`, then exactly one intervention tool (`highlight_element`, `deep_link`, `show_message`, `create_tour`).

3. **Actor** (`packages/sdk/src/actor.ts`) — receives `InterventionCommand` from the backend response and executes it in the browser (Driver.js overlays, deep links, spotlight).

### Backend internals

- **Framework:** Fastify with `tsx watch` in dev, compiled `tsc` in prod
- **Database:** SQLite via Drizzle ORM when `DATABASE_URL` is set; falls back to in-memory store (useful for tests and quick local runs). Schema is in `packages/backend/src/db/schema.ts`.
- **Vector store:** ChromaDB at `CHROMA_URL` (default `http://localhost:8000`). Each tenant gets its own collection `q_tenant_{tenantId}`.
- **RAG pipeline:** `packages/backend/src/ingestion/` — `pipeline.ts` chunks → embeds → indexes into ChromaDB. Embedding providers: `openai` (default), `ollama`, `minimax`.
- **Auth:** JWT sessions, TOTP 2FA, OAuth SSO, per-tenant roles (`owner`/`admin`/`viewer`). Auth hook in `middleware/auth.ts`.
- **Multi-tenancy:** All data is scoped by `tenantId`. The SDK key sent by client SDKs resolves the tenant.

### LLM configuration

Default provider is Anthropic (`claude-sonnet-4-6`). Configurable via env vars or per-tenant settings in DB:

- `LLM_PROVIDER=anthropic|openai|gemini`
- `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`
- `LLM_BASE_URL` + `LLM_API_KEY` + `LLM_MODEL` (any OpenAI-compatible endpoint)
- `GEMINI_API_KEY`, `GEMINI_MODEL`

STT (speech-to-text) uses the same OpenAI-compatible interface; configured via `STT_*` vars.

### SDK internals

`Q.init(sdkKey, options)` wires together: `Observer` → detects frustration → `QUI.showGreeting()`. The chat widget (`QUI`) lets users chat; messages go via `Transport` to `POST /api/v1/chat`. `DOMMapper` auto-discovers UI elements and reports them to the backend's functional map. `PathRecorder` sends session navigation paths.

### MCP server

`packages/mcp` exposes tools (`crawl_repository`, `ingest_document`, `search_knowledge_base`) so AI agents (e.g. Claude Desktop) can populate Q's knowledge base.

## Key env vars (`.env` at repo root)

```
DATABASE_URL=file:./data/q.db   # omit for in-memory
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
CHROMA_URL=http://localhost:8000
JWT_SECRET=
```

## Testing

Tests are in `packages/backend/src/__tests__/`. The test setup (`setup.ts`) uses the in-memory store (no `DATABASE_URL` needed) and spins up a real Fastify instance via `app.inject()`. No mocking of the store layer.
