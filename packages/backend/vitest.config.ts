import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15000,
    hookTimeout: 15000,
    // Don't pick up compiled test output from a local `tsc` build — only run
    // the TS sources.
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Tests must run against the in-memory store (see setup.ts), not whatever
    // DATABASE_URL a developer has set in the root .env for local dev.
    // dotenv (loaded by src/config.ts) won't override a var that's already
    // set, so pre-setting it empty here forces initStore() to pick in-memory.
    env: {
      DATABASE_URL: '',
      // Same reasoning as DATABASE_URL above — a developer's local .env may
      // have EMBEDDING_PROVIDER=ollama pointing at a real local Ollama
      // server. Without this, tests that hit the ingest/search pipeline
      // would silently make live network calls to it (slow, and their
      // pass/fail would depend on whether Ollama happens to be running).
      // Tests that need RAG "configured" set it explicitly per-tenant via
      // store.updateTenantSettings (see 'Per-Tenant RAG Config' tests).
      EMBEDDING_PROVIDER: '',
      OPENAI_API_KEY: '',
    },
  },
});
