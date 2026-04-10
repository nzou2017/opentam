# Q

**The invisible bridge between your product and your user.**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)

Q is an open-source AI agent that detects user frustration in real-time — rage clicks, dead-end loops, dwell time anomalies — and delivers non-intrusive contextual guidance using RAG over your product documentation and source code. Web, iOS, and Android SDKs included.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Observer  │────▶│    Brain    │────▶│    Actor    │
│  (SDK <20kb)│     │  (LLM+RAG) │     │ (Overlays)  │
└─────────────┘     └─────────────┘     └─────────────┘
     ▲                    ▲                    │
     │                    │                    ▼
  Rage clicks,       Docs + source       Guided tours,
  dwell time,        code via            highlights,
  cursor entropy     vector search       deep links
```

## Features

- **Frustration detection** — lightweight browser SDK captures behavioral signals without tracking PII
- **LLM reasoning with RAG** — agent queries your docs and functional map to pick the right intervention
- **Smart interventions** — element highlights, guided tours (Driver.js), deep links, or free-text messages
- **Workflow engine** — define multi-step walkthroughs; the agent matches and launches them automatically
- **Voice input** — speech-to-text via any OpenAI-compatible STT endpoint
- **Surveys & feedback** — collect structured feedback triggered by interventions or frustration events
- **Multi-tenant** — team management, RBAC (owner/admin/viewer), SSO, TOTP 2FA, audit logs
- **Bring your own LLM** — works with Anthropic, OpenAI, Gemini, DeepSeek, Groq, Ollama, and more
- **MCP server** — populate Q's knowledge base directly from AI agent workflows

## Quick Start

### Docker (recommended)

```bash
cp .env.example .env
# Add your ANTHROPIC_API_KEY (or other LLM provider keys) to .env
docker-compose up
```

- Dashboard: http://localhost:3000
- Backend API: http://localhost:3001
- Demo page: http://localhost:3001/demo

### Local dev

```bash
pnpm install
cp .env.example .env   # fill in API keys
pnpm dev               # starts backend (:3001) + dashboard (:3000)
```

ChromaDB must be running separately for vector search:
```bash
docker run -p 8000:8000 chromadb/chroma
```

Omit `DATABASE_URL` in `.env` to run with an in-memory store (no persistence, great for testing).

## Add Q to Your App

```html
<script src="https://api.useq.dev/sdk/q.min.js"></script>
<script>
  Q.init('YOUR_SDK_KEY', {
    // Optional overrides:
    // backendUrl: 'https://your-self-hosted-backend.com',
    // cooldownHours: 24,
    // layout: 'popup',        // or 'panel'
    // thresholds: { rageClicks: 3, dwellSeconds: 120, cursorEntropy: 7 },
  });
</script>
```

For self-hosted deployments, set `backendUrl` to your backend URL and serve the SDK from `GET /sdk/q.min.js`.

Mobile SDKs are available in `packages/sdk-ios` (Swift) and `packages/sdk-android` (Kotlin).

## LLM Providers

Set `LLM_PROVIDER` in `.env` to switch providers. All providers are configured with a consistent set of env vars:

| Provider | `LLM_PROVIDER` | Key env vars |
|----------|---------------|-------------|
| Anthropic (default) | `anthropic` | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |
| OpenAI | `openai` | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` |
| Google Gemini | `gemini` | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| DeepSeek / Groq / Ollama / MiniMax / OpenRouter | `openai` | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` |

Embedding providers (`EMBEDDING_PROVIDER`): `openai` (default), `ollama`, `minimax`.

See `.env.example` for the full list of options with examples.

## Ingest Your Docs

Upload documentation through the dashboard or via the API:

```bash
# Ingest a markdown file
curl -X POST http://localhost:3001/api/v1/ingest \
  -H "Authorization: Bearer YOUR_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"docId": "getting-started", "text": "...", "mimeType": "text/markdown"}'
```

Or use the MCP server to let an AI agent crawl a GitHub repo and ingest docs automatically:

```json
{
  "mcpServers": {
    "q": {
      "command": "node",
      "args": ["packages/mcp/dist/index.js"],
      "env": { "Q_BACKEND_URL": "http://localhost:3001", "Q_SECRET_KEY": "YOUR_SECRET_KEY" }
    }
  }
}
```

## Community vs Enterprise

| Feature | Community | Enterprise |
|---------|:---------:|:----------:|
| Frustration detection | ✓ | ✓ |
| AI interventions | ✓ | ✓ |
| Workflow engine | ✓ | ✓ |
| Doc ingestion & RAG | ✓ | ✓ |
| Analytics | ✓ | ✓ |
| Audit logs | ✓ | ✓ |
| Surveys & feedback collection | — | ✓ |
| Team management & RBAC | — | ✓ |
| SSO (Google, SAML) | — | ✓ |
| Priority support | — | ✓ |

Enterprise features require a license key. Activate in the dashboard under **Settings → General**.

## Project Structure

```
packages/
  backend/     — Fastify API server (Drizzle ORM, SQLite, ChromaDB, LangGraph)
  dashboard/   — Next.js admin portal
  sdk/         — Vanilla JS browser SDK (<20kb)
  sdk-ios/     — Swift SDK
  sdk-android/ — Kotlin SDK
  shared/      — Shared TypeScript types
  proxy/       — Reverse proxy for demos
  mcp/         — MCP server for AI agent integration
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR process.

## License

Q is licensed under [AGPL-3.0](LICENSE). Enterprise features require a separate commercial license — contact [q.cue.2026@gmail.com](mailto:q.cue.2026@gmail.com).

Copyright (C) 2026 Ning Zou
