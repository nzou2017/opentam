# Q — Production Readiness Plan

Picks up where the 7-milestone implementation plan left off.
The core loop works end-to-end. These are the remaining gaps before real customers can use Q.

---

## P1: Replace In-Memory Store with PostgreSQL

**Why it's blocking production:** the in-memory store resets on every server restart and can't support more than one backend instance.

### Schema (Drizzle ORM)

```sql
-- tenants
id          uuid primary key default gen_random_uuid()
name        text not null
sdk_key     text unique not null
secret_key  text unique not null
plan        text not null default 'hobbyist'  -- hobbyist | startup | enterprise
model       text                               -- optional override
created_at  timestamptz default now()

-- functional_map_entries
id          uuid primary key default gen_random_uuid()
tenant_id   uuid references tenants(id) on delete cascade
feature     text not null
url         text not null
selector    text not null
description text not null
preconditions text[]
source      text not null default 'manual'     -- manual | crawler
created_at  timestamptz default now()

-- intervention_logs
id          uuid primary key default gen_random_uuid()
event_id    text not null
tenant_id   uuid references tenants(id) on delete cascade
session_id  text not null
url         text
action      text not null
element_id  text
message     text not null
confidence  float not null
resolved    boolean default false
created_at  timestamptz default now()
resolved_at timestamptz
```

### Steps

1. Install: `pnpm add drizzle-orm postgres` + `pnpm add -D drizzle-kit @types/pg`
2. Create `packages/backend/src/db/schema.ts` with Drizzle table definitions
3. Create `packages/backend/src/db/client.ts` — pool from `DATABASE_URL`
4. Create `packages/backend/drizzle.config.ts` for migrations
5. Replace `InMemoryStore` class with a `DatabaseStore` class implementing the same interface — swap in `inMemoryStore.ts` or introduce a `IStore` interface both implement
6. Add `DATABASE_URL=postgres://...` to `.env` and Docker Compose
7. Add a migration script: `pnpm --filter @opentam/backend db:migrate`
8. Update `docker-compose.yml` to add a `postgres` service and remove the in-memory seed

---

## P2: Configurable Embedding Provider

**Why OpenAI is used today:** `embedder.ts` is hardcoded to `text-embedding-3-small` via the OpenAI SDK. OpenAI doesn't offer a free tier for embeddings.

**Recommended replacement for self-hosting: Ollama** — runs locally, no API key, free forever.

### Recommended providers

| Provider | Model | Dimensions | Setup |
|---|---|---|---|
| **Ollama** *(recommended for self-hosting)* | `nomic-embed-text` | 768 | `ollama pull nomic-embed-text` — no key |
| **Voyage AI** *(recommended for cloud)* | `voyage-3-lite` | 512 | `VOYAGE_API_KEY=...` — 200M free tokens |
| **Jina AI** | `jina-embeddings-v3` | 1024 | `JINA_API_KEY=...` — 1M free/month |
| **OpenAI** *(current)* | `text-embedding-3-small` | 1536 | `OPENAI_API_KEY=...` — paid |

### Steps

1. Add `EMBEDDING_PROVIDER=ollama` (or `voyage` / `jina` / `openai`) to config
2. Add `OLLAMA_URL=http://localhost:11434` to config
3. Refactor `packages/backend/src/ingestion/embedder.ts` into a provider pattern:
   ```typescript
   // embedder.ts
   export async function embedTexts(texts: string[]): Promise<number[][]> {
     switch (config.embeddingProvider) {
       case 'ollama':  return ollamaEmbed(texts);
       case 'voyage':  return voyageEmbed(texts);
       case 'jina':    return jinaEmbed(texts);
       default:        return openaiEmbed(texts);
     }
   }
   ```
4. **MRL (Matryoshka Representation Learning):** `text-embedding-3-small`, `nomic-embed-text`, and `jina-embeddings-v3` all support MRL — the first N dimensions of a full embedding are themselves a valid embedding. Set `EMBEDDING_DIMENSIONS=256` to store 6× smaller vectors with ~5% quality loss. **Important:** the dimension must be decided before first ingest and must match the ChromaDB collection. Changing it later requires re-ingesting all documents. Recommended: `256` for OpenAI/Jina, `256` for Ollama nomic-embed-text.
5. Update `isRagConfigured()` in `ingest.ts`: Ollama needs no key; others need their respective key
6. Update `docker-compose.yml` to add an `ollama` service with the `nomic-embed-text` model pre-pulled

### Ollama Docker service
```yaml
ollama:
  image: ollama/ollama
  ports:
    - '11434:11434'
  volumes:
    - ollama_data:/root/.ollama
  entrypoint: ["/bin/sh", "-c", "ollama serve & sleep 5 && ollama pull nomic-embed-text && wait"]
```

---

## P3: Dashboard Authentication (Clerk)

**Why it's blocking production:** the dashboard is currently single-tenant with credentials in env vars. Any customer needs their own secure login.

### Steps

1. Install: `pnpm add @clerk/nextjs` in `packages/dashboard`
2. Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to `.env`
3. Wrap `packages/dashboard/src/app/layout.tsx` in `<ClerkProvider>`
4. Add `middleware.ts` at `packages/dashboard/src/` using `clerkMiddleware()` to protect all routes except `/sign-in`
5. Add sign-in page at `src/app/sign-in/[[...sign-in]]/page.tsx`
6. Replace env-var `Q_SECRET_KEY` with a per-user secret key fetched from the backend after Clerk auth:
   - On first login, backend creates a tenant record and returns `sdkKey` + `secretKey`
   - Store in Clerk's user metadata or session claims
7. Add `GET /api/v1/me` backend route (Bearer = Clerk session token) that returns the tenant for the authenticated user

---

## P4: SDK Key → Tenant ID Resolution

**Why it matters:** the SDK currently hardcodes `sdk_test_acme → tenant-1` in `index.ts`. Real customers need their SDK key resolved server-side.

### Steps

1. Add `GET /api/v1/resolve` backend route — accepts `Authorization: Bearer <sdkKey>`, returns `{ tenantId, thresholds }` (public, no secret data)
2. Update `packages/sdk/src/index.ts`: on `Q.init()`, call `/api/v1/resolve` to get `tenantId` before starting the observer. Cache result in `sessionStorage`.
3. Remove the hardcoded `resolveTenantId()` function

---

## P5: Deployment Infrastructure

### Recommended stack

| Service | Provider | Notes |
|---|---|---|
| Backend API | **Railway** or **Fly.io** | Docker deploy from `packages/backend/Dockerfile` |
| Dashboard | **Vercel** | Native Next.js support, zero config |
| ChromaDB | **Railway** (persistent volume) or **Zilliz Cloud** (managed Chroma) | Swap `indexer.ts` for Zilliz when scaling |
| Ollama | **Modal** or self-hosted GPU | Or swap to Voyage AI (no infra needed) |
| PostgreSQL | **Neon** (serverless) or **Railway Postgres** | Add `DATABASE_URL` |
| MCP server | Customer self-hosts | Distribute as `npx @opentam/mcp` |

### Steps

1. Add `NEXT_PUBLIC_BACKEND_URL` to Vercel env vars (points to Railway backend)
2. Set up CI with GitHub Actions: `pnpm build` + `pnpm lint` on PR, deploy on merge to `main`
3. Add health check endpoint to `docker-compose.yml` (`depends_on: condition: service_healthy`)
4. Add `ALLOWED_ORIGINS` env var to backend CORS config (restrict from `*` to actual customer domains)
5. Set `NODE_ENV=production` to disable pino-pretty logging

---

## P6: Security Hardening

Small but necessary before accepting real customer data:

1. **Rate limiting** — add `@fastify/rate-limit` to `POST /api/v1/events` (max 60 req/min per SDK key)
2. **SDK key rotation** — add `POST /api/v1/rotate-key` (secret key auth) that generates a new SDK key
3. **DOM snapshot PII scrubbing** — audit `transport.ts` to ensure no text content leaks through; strip `value` attributes from inputs
4. **HTTPS enforcement** — add `X-Forwarded-Proto` check in production; redirect HTTP → HTTPS
5. **Secrets in env only** — confirm no keys are logged by pino (add a `redact` config to the Fastify logger: `['req.headers.authorization']`)

---

## Priority order

```
P2 (embeddings) → try right now, unblocks free RAG
P4 (SDK key resolve) → needed for any real customer install
P1 (Postgres) → needed before first paying customer
P3 (Clerk auth) → needed for multi-tenant dashboard
P5 (deploy) → needed to go live
P6 (security) → before public launch
```
