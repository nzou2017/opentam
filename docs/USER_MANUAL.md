# Q — User Manual

> **The invisible bridge between your product and your user.**

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Quick Start — SDK Integration](#2-quick-start--sdk-integration)
3. [Authentication](#3-authentication)
4. [RAG Configuration](#4-rag-configuration)
5. [Model Support & Configuration](#5-model-support--configuration)
6. [Next Steps](#6-next-steps)

---

## 1. Introduction

**Q** is an open-source, proactive AI support agent for web applications. Instead of waiting for users to open a help ticket, Q monitors behavioral signals in real-time — rage clicks, dead-end navigation loops, prolonged dwell on a single page — and intervenes the moment a user appears stuck.

When frustration is detected, Q surfaces a non-intrusive chat panel powered by your own product documentation. It can answer questions, highlight the correct UI element, link directly to the relevant page, or walk the user through a guided tour — all without leaving the current page.

### Why Q?

| Problem | Q's Approach |
|---|---|
| Users silently churn when lost | Detects frustration signals and intervenes proactively |
| Generic chatbots give generic answers | RAG over *your* docs and *your* UI map gives precise answers |
| Support overlays feel intrusive | Q only appears when behavioral thresholds are crossed |
| Hard to integrate | One `<script>` tag; no framework required |

### Architecture Overview

```
┌─────────────────────────────────────────────┐
│  Browser (your web app)                     │
│                                             │
│  ┌──────────┐    signals    ┌─────────────┐ │
│  │ Observer │ ──────────►  │  Q Backend  │ │
│  │  (SDK)   │ ◄──────────  │  (Node.js)  │ │
│  └──────────┘  intervention └──────┬──────┘ │
│       │                           │        │
│  ┌────▼─────┐               ┌─────▼──────┐ │
│  │ Actor UI │               │  ChromaDB  │ │
│  │ (panel,  │               │  (RAG)     │ │
│  │  tours)  │               └────────────┘ │
│  └──────────┘                              │
└─────────────────────────────────────────────┘
```

- **Observer** — A <20 KB JavaScript SDK dropped into any web page. Watches clicks, mouse movement, navigation patterns, and dwell time.
- **Backend** — A Fastify (Node.js) API that receives signals, runs RAG retrieval, and calls the LLM to generate interventions.
- **ChromaDB** — Stores vector embeddings of your documentation and UI map for fast semantic retrieval.

---

## 2. Quick Start — SDK Integration

### Prerequisites

- Node.js 18+
- `pnpm` (or `npm`/`yarn`)
- A running Q backend (see below)

### Option A — Self-Hosted (Monorepo)

```bash
git clone https://github.com/your-org/q.git
cd q
pnpm install
cp .env.example .env   # fill in your API keys
pnpm dev               # starts backend on :3001 and dashboard on :3000
```

### Option B — Docker Compose (Recommended for first run)

```bash
cp .env.example .env   # fill in ANTHROPIC_API_KEY or OPENAI_API_KEY
docker compose up -d
```

Services started:

| Service | Port | Purpose |
|---|---|---|
| `backend` | 3001 | Core API + SDK file server |
| `chromadb` | 8000 | Vector store |
| `dashboard` | 3000 | Admin UI for knowledge base |
| `proxy` | 3002 | Optional demo reverse proxy |

### Adding Q to Your Web App

Once the backend is running, add two lines before `</body>` in any HTML page:

```html
<!-- 1. Load the Q SDK from your backend -->
<script src="http://localhost:3001/sdk/q.min.js"></script>

<!-- 2. Initialize with your SDK key -->
<script>
  Q.init('YOUR_SDK_KEY', {
    backendUrl: 'http://localhost:3001',
  });
</script>
```

That's it. Q will mount a floating button in the bottom-right corner of the page and begin observing user behavior.

> **Tip:** In production, replace `http://localhost:3001` with your deployed backend URL and serve `q.min.js` from a CDN or your own static host.

### Configuration Options

```javascript
Q.init('YOUR_SDK_KEY', {
  backendUrl: 'https://your-q-backend.example.com',

  // Optional: pass a stable user ID for session continuity
  userId: 'user_abc123',

  // Optional: tune frustration detection thresholds
  thresholds: {
    rageClicks:    3,   // clicks on same element within 2s
    dwellSeconds:  60,  // seconds idle on one page
    cursorEntropy: 7,   // cursor search-pattern score (0–10)
  },

  // Optional: suppress re-triggering for N hours after dismissal
  cooldownHours: 24,
});
```

### Testing the Integration

Trigger a simulated frustration event in the browser console to verify everything is wired up:

```javascript
Q.simulate();
```

The Q panel should open and display a greeting message.

---

## 3. Authentication

Q uses **two separate keys** with different trust levels:

| Key Type | Prefix | Used By | Grants Access To |
|---|---|---|---|
| **SDK Key** | `sdk_` | Client-side JS (public) | Chat, events, voice transcription |
| **Secret Key** | `sk_` | Server-side / admin only | Ingest, crawl, analytics, map management |

> **Warning:** Never expose your **Secret Key** in client-side code or public repositories. It grants write access to your knowledge base.

### Obtaining Keys

**Development** — The following test credentials are seeded automatically:

```
SDK Key:    sdk_test_acme
Secret Key: sk_test_acme
Tenant ID:  tenant-1
```

**Production** — Create a tenant via the Dashboard at `http://localhost:3000`, or via the API:

```bash
curl -X POST http://localhost:3001/api/v1/tenants \
  -H "Content-Type: application/json" \
  -d '{ "name": "Acme Corp", "plan": "startup" }'
```

Response:

```json
{
  "id": "tenant-abc",
  "sdkKey": "sdk_live_xxxxxxxxxxxxxxxx",
  "secretKey": "sk_live_xxxxxxxxxxxxxxxx"
}
```

### Using the Secret Key (Backend API calls)

Pass the Secret Key as a Bearer token:

```bash
curl http://localhost:3001/api/v1/ingest/url \
  -H "Authorization: Bearer sk_test_acme" \
  -H "Content-Type: application/json" \
  -d '{ "url": "https://your-docs-site.com/getting-started" }'
```

---

## 4. RAG Configuration

Q uses [ChromaDB](https://www.trychroma.com/) as its vector store. Before Q can answer product-specific questions, you need to ingest your documentation.

### 4.1 Local Setup

#### Start ChromaDB

```bash
# Via Docker Compose (recommended — already included)
docker compose up -d chromadb

# Or standalone Docker
docker run -p 8000:8000 chromadb/chroma:latest
```

Set the URL in your `.env`:

```env
CHROMA_URL=http://localhost:8000
```

#### Choose an Embedding Provider

Q supports three embedding providers. Set `EMBEDDING_PROVIDER` in `.env`:

**OpenAI** (default — best quality):

```env
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

**Ollama** (fully local — no API key required):

```bash
ollama pull nomic-embed-text   # one-time download
```

```env
EMBEDDING_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

**MiniMax** (recommended for China region):

```env
EMBEDDING_PROVIDER=minimax
MINIMAX_API_KEY=...
MINIMAX_GROUP_ID=...
```

> **Note:** All three providers produce vectors that are stored in the same ChromaDB instance. You cannot mix providers within one collection — if you change `EMBEDDING_PROVIDER`, re-ingest all documents.

#### Ingesting Documents

**From a URL** (Q fetches and parses the page automatically):

```bash
curl -X POST http://localhost:3001/api/v1/ingest/url \
  -H "Authorization: Bearer sk_test_acme" \
  -H "Content-Type: application/json" \
  -d '{ "url": "https://your-docs-site.com/page" }'
```

**From raw text** (Markdown, HTML, or plain text):

```bash
curl -X POST http://localhost:3001/api/v1/ingest/text \
  -H "Authorization: Bearer sk_test_acme" \
  -H "Content-Type: application/json" \
  -d '{
    "docId": "getting-started",
    "text": "# Getting Started\n\nTo create an API key, go to Settings > API...",
    "mimeType": "text/markdown"
  }'
```

**Crawl an entire docs site**:

```bash
curl -X POST http://localhost:3001/api/v1/crawl \
  -H "Authorization: Bearer sk_test_acme" \
  -H "Content-Type: application/json" \
  -d '{ "rootUrl": "https://your-docs-site.com", "maxPages": 100 }'
```

#### Advanced: Custom ChromaDB Collection

If you already have a ChromaDB collection populated by another pipeline (e.g., LlamaIndex), point Q directly at it:

```env
CHROMA_COLLECTION=my_existing_collection
```

> **Note:** When `CHROMA_COLLECTION` is unset, Q manages its own namespace: `q_tenant_{tenantId}`.

#### Tuning Embedding Dimensions

For cheaper storage and faster retrieval, you can reduce embedding dimensions (Matryoshka Representation Learning):

```env
# text-embedding-3-small supports 256–1536
# nomic-embed-text supports 64–768
EMBEDDING_DIMENSIONS=512
```

> **Warning:** `EMBEDDING_DIMENSIONS` must match the dimension used when the collection was first created. Changing it requires deleting and re-ingesting the collection.

---

### 4.2 Cloud / Managed Setup

#### Managed ChromaDB (Chroma Cloud)

Replace the local `CHROMA_URL` with your Chroma Cloud endpoint:

```env
CHROMA_URL=https://your-instance.api.trychroma.com:8000
```

> **Tip:** Add your Chroma Cloud API key via their client configuration. Refer to [Chroma Cloud docs](https://docs.trychroma.com/deployment/cloud) for authentication details.

#### Bring Your Own Vector Store

Q's ingestion pipeline targets ChromaDB via the `chromadb` npm client. To swap in a different vector store (Pinecone, Weaviate, Milvus), replace the indexer in `packages/backend/src/ingestion/indexer.ts` and implement the same `upsert` / `query` interface.

---

## 5. Model Support & Configuration

### Supported LLM Providers

| Provider | Models | Region |
|---|---|---|
| **Anthropic** (default) | `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-haiku-4-5-20251001` | Global |
| **MiniMax** | `MiniMax-Text-01`, `MiniMax-M2.7` | Global + China |
| OpenAI | Planned | — |
| Gemini | Planned | — |
| DeepSeek | Planned | — |

### Switching LLM Provider

Set `LLM_PROVIDER` in `.env`:

**Anthropic (default):**

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6
```

**MiniMax:**

```env
LLM_PROVIDER=minimax
MINIMAX_API_KEY=...
MINIMAX_GROUP_ID=...
MINIMAX_CHAT_MODEL=MiniMax-M2.7

# Use China region endpoint if needed:
MINIMAX_BASE_URL=https://api.minimax.chat/v1
# International (default):
# MINIMAX_BASE_URL=https://api.minimax.io/v1
```

### Per-Tenant Model Override

Each tenant can be assigned a different model. This is useful for tiered plans:

```json
{
  "id": "tenant-enterprise",
  "model": "claude-opus-4-6",
  "plan": "enterprise"
}
```

If no `model` is set on the tenant, the backend falls back to `ANTHROPIC_MODEL` in `.env`.

### Voice Input (Speech-to-Text)

Q's mic button uses a two-layer fallback:

1. **Web Speech API** — Native browser STT (works on Safari out of the box).
2. **MiniMax STT** — MediaRecorder fallback sent to `/api/v1/transcribe`. Required for Chrome (Google STT is blocked in some regions).

To enable MiniMax STT, ensure the following are set:

```env
MINIMAX_API_KEY=...
MINIMAX_STT_MODEL=speech-01-turbo
```

### Complete `.env` Reference

```env
# ── Server ────────────────────────────────────────────────
PORT=3001

# ── LLM Provider ─────────────────────────────────────────
LLM_PROVIDER=anthropic            # anthropic | minimax

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6

# MiniMax (chat + STT)
MINIMAX_API_KEY=...
MINIMAX_GROUP_ID=...
MINIMAX_CHAT_MODEL=MiniMax-Text-01
MINIMAX_BASE_URL=https://api.minimax.io/v1
MINIMAX_STT_MODEL=speech-01-turbo

# ── Embeddings ────────────────────────────────────────────
EMBEDDING_PROVIDER=openai         # openai | minimax | ollama
OPENAI_API_KEY=sk-...

OLLAMA_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

EMBEDDING_DIMENSIONS=             # optional: e.g. 512

# ── Vector Store ──────────────────────────────────────────
CHROMA_URL=http://localhost:8000
CHROMA_COLLECTION=                # optional: override collection name
```

---

## 6. Next Steps

### Verify Your Setup

```bash
# Health check
curl http://localhost:3001/health

# Send a test frustration event (should trigger an intervention)
curl -X POST http://localhost:3001/api/v1/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sdk_test_acme" \
  -d '{
    "tenantId": "tenant-1",
    "sessionId": "sess_test_001",
    "currentUrl": "/dashboard",
    "signals": {
      "rageClicks": 4,
      "deadEndLoops": 0,
      "dwellSeconds": 30,
      "cursorEntropy": 2.5
    },
    "domSnapshot": "",
    "timestamp": "2026-03-26T00:00:00.000Z"
  }'
```

### Further Reading

| Resource | Description |
|---|---|
| `IMPLEMENTATION_PLAN.md` | Detailed phase-by-phase technical roadmap |
| `SaaS_IMPLEMENTATION.md` | Multi-tenant business model and pricing strategy |
| `Q_PROXY_DEMO_TOOL.md` | Using the reverse proxy for sales demos |
| `packages/backend/src/routes/` | All API endpoint implementations |
| `packages/sdk/src/` | Observer, Actor, Transport source code |
| Dashboard (`localhost:3000`) | Visual knowledge base management and analytics |

### Community & Support

- **Issues:** [github.com/your-org/q/issues](https://github.com/your-org/q/issues)
- **Discussions:** [github.com/your-org/q/discussions](https://github.com/your-org/q/discussions)
