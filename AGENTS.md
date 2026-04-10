# AGENTS.md

## Monorepo

pnpm + Turborepo at repo root. Packages live under `packages/`: `backend`, `dashboard`, `sdk`, `shared`, `mcp`, `proxy`.

## Commands

```bash
pnpm dev          # start all packages (turbo). dashboard=3000, backend=3001, proxy=3002
pnpm build        # build all packages (respects dependency order)
pnpm lint         # tsc --noEmit per package (no ^build dep in turbo.json)

# Per-package
pnpm --filter backend test        # vitest run (backend only)
pnpm --filter backend test:watch   # vitest watch
pnpm --filter backend dev          # tsx watch (backend)
pnpm --filter dashboard dev        # next dev -p 3000 (dashboard)
pnpm --filter sdk build            # esbuild → dist/q.min.js
```

## Order matters

`pnpm dev` runs `^build` first — all workspace dependencies must build before dev starts. If you change `shared`, run `pnpm build` before `pnpm dev`.

## Backend tests

Tests live in `packages/backend/src/__tests__/`. Setup (`setup.ts`) spins up a real Fastify instance with an **in-memory store** (no `DATABASE_URL` needed). Seeded test credentials: `SDK_KEY=sdk_test_acme`, `SECRET_KEY=sk_test_acme`, `TENANT_ID=tenant-1`.

```ts
import { buildApp, SDK_KEY, SECRET_KEY, TENANT_ID } from './setup';
// also exports registerAndGetToken(app)
```

## Database

Drizzle ORM with SQLite. Dev uses in-memory store (no `.env` needed). Prod uses `DATABASE_URL=file:./data/q.db`. Migrations via `drizzle-kit` (devDependency in backend).

## SDK bundle

Built via `node build.mjs` (custom esbuild script), outputs `dist/q.min.js`. Backend serves it at `/sdk/q.min.js` by checking two paths: `packages/sdk/dist/` (monorepo) and `packages/backend/src/sdk_dist/` (Docker).

## Docker

```bash
docker-compose up        # chromadb:8000 + backend:3001 + dashboard:3000 + proxy:3002
```

Key env vars: `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CHROMA_URL`.

## Packages

| Package | Entrypoint | Notes |
|---------|-----------|-------|
| `backend` | `src/index.ts` | Fastify, tsx watch in dev |
| `dashboard` | `src/app/page.tsx` | Next.js 14, Tailwind |
| `sdk` | `src/index.ts` | Browser SDK, esbuild |
| `shared` | `src/index.ts` | Types only (FrustrationEvent, InterventionCommand, etc.) |
| `mcp` | `src/index.ts` | MCP server for repo crawling / doc ingestion |
| `proxy` | `src/index.ts` | Q-Proxy reverse proxy for sales demos |

## Env files

- `.env` at repo root (backend + shared)
- `packages/dashboard/.env.local` (dashboard only)
- `.env.example` at repo root as template

## Shared types

All packages import `@opentam/shared` as workspace dependency. It's the source of truth for cross-package types.

## LLM config

`LLM_PROVIDER=anthropic|openai|gemini` + provider-specific keys. Defaults to Anthropic Claude Sonnet 4.

## Test timeouts

Backend vitest: `testTimeout: 15000`, `hookTimeout: 15000` (vitest.config.ts).