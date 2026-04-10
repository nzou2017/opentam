// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { proxyConfig } from './config.js';
import { rewriteHtml } from './rewriter.js';

async function main(): Promise<void> {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  // ---------------------------------------------------------------------------
  // GET / — Sales portal HTML page
  // ---------------------------------------------------------------------------
  app.get('/', async (_request, reply) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Q Proxy — Demo Tool</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8fafc;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 32px;
      padding: 24px;
    }
    .logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      background: #6366f1;
      color: #fff;
      border-radius: 16px;
      font-size: 26px;
      font-weight: 900;
      letter-spacing: -1px;
      box-shadow: 0 4px 14px rgba(99,102,241,0.4);
    }
    .card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 36px 40px;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 4px 24px rgba(0,0,0,0.07);
    }
    h1 {
      font-size: 20px;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 6px;
    }
    .subtitle {
      font-size: 14px;
      color: #64748b;
      margin-bottom: 24px;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 6px;
    }
    input[type="url"] {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      color: #1e293b;
      outline: none;
      transition: border-color 0.15s;
    }
    input[type="url"]:focus {
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
    }
    .btn-primary {
      display: block;
      width: 100%;
      margin-top: 12px;
      padding: 10px 0;
      background: #6366f1;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-primary:hover { background: #4f46e5; }
    .btn-secondary {
      display: block;
      width: 100%;
      margin-top: 8px;
      padding: 10px 0;
      background: #f1f5f9;
      color: #475569;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-secondary:hover { background: #e2e8f0; }
    .note {
      margin-top: 20px;
      padding: 12px 14px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      font-size: 12px;
      color: #15803d;
    }
    .divider {
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="logo">Q</div>
  <div class="card">
    <h1>Demo Q on Any Website</h1>
    <p class="subtitle">Enter a URL to inject Q's frustration detection and guidance engine into any site — no SDK installation needed.</p>

    <form method="GET" action="/proxy" onsubmit="handleSubmit(event)">
      <label for="url">Target URL</label>
      <input
        type="url"
        id="url"
        name="url"
        placeholder="https://example.com"
        required
      />
      <button type="submit" class="btn-primary">Start Demo &rarr;</button>
    </form>

    <hr class="divider" />

    <button class="btn-secondary" onclick="simulateFrustration()">
      &#9889; Simulate Frustration
    </button>

    <div class="note">
      Q will be injected automatically into the target site. Use "Simulate Frustration" to trigger the intervention flow without waiting for real signals.
    </div>
  </div>

  <script>
    function handleSubmit(e) {
      e.preventDefault();
      var url = document.getElementById('url').value.trim();
      if (url) window.location.href = '/proxy?url=' + encodeURIComponent(url);
    }

    function simulateFrustration() {
      if (window.__Q_SIMULATE__) {
        window.__Q_SIMULATE__();
      } else {
        alert('Open a proxied page first, then click Simulate Frustration.');
      }
    }
  </script>
</body>
</html>`;

    return reply.type('text/html').send(html);
  });

  // ---------------------------------------------------------------------------
  // GET /proxy?url=<encoded> — Proxy and rewrite target page
  // ---------------------------------------------------------------------------
  app.get<{ Querystring: { url?: string } }>('/proxy', async (request, reply) => {
    const { url } = request.query;

    if (!url) {
      return reply.code(400).send('Missing ?url= parameter');
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return reply.code(400).send('Only http/https URLs are supported.');
      }
    } catch {
      return reply.code(400).send('Invalid URL.');
    }

    // Fetch the target URL
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (compatible; Q-Proxy/1.0)',
        },
        redirect: 'follow',
      });
    } catch (err) {
      const errorHtml = buildErrorPage(url, String(err));
      return reply.code(502).type('text/html').send(errorHtml);
    }

    const contentType = response.headers.get('content-type') ?? '';

    if (!contentType.includes('text/html')) {
      // Non-HTML asset — proxy as-is
      const body = await response.arrayBuffer();
      return reply
        .code(response.status)
        .type(contentType || 'application/octet-stream')
        .send(Buffer.from(body));
    }

    // HTML response — rewrite and inject SDK
    const html = await response.text();
    const targetOrigin = parsedUrl.origin;
    const proxyBase = `http://localhost:${proxyConfig.port}`;

    const sdkSnippet = `
<script>
window.__Q_PROXY_MODE__ = true;
window.__Q_SIMULATE__ = function() {
  if (window.__q_observer__ && window.__q_observer__.simulateFrustration) {
    window.__q_observer__.simulateFrustration();
  } else if (window.Q && window.Q.simulate) {
    window.Q.simulate();
  }
};
</script>
<script src="${proxyBase}/sdk/q.min.js"></script>
<script>
if (typeof Q !== 'undefined') {
  Q.init(${JSON.stringify(proxyConfig.sdkKey)}, { backendUrl: ${JSON.stringify(proxyConfig.backendUrl)} });
}
</script>`;

    const rewritten = rewriteHtml(html, targetOrigin, proxyBase, sdkSnippet);
    return reply.type('text/html').send(rewritten);
  });

  // ---------------------------------------------------------------------------
  // GET /sdk/q.min.js — Serve the SDK bundle
  // ---------------------------------------------------------------------------
  app.get('/sdk/q.min.js', async (_request, reply) => {
    // In Docker the SDK is copied to ./sdk_dist; locally use the workspace path
    const candidates = [
      resolve(__dirname, '../../sdk_dist/q.min.js'),    // Docker
      resolve(__dirname, '../../../sdk/dist/q.min.js'),  // local monorepo
    ];

    for (const candidate of candidates) {
      try {
        const content = readFileSync(candidate);
        return reply.type('application/javascript').send(content);
      } catch {
        // try next
      }
    }

    return reply.code(404).send('// SDK not found');
  });

  // ---------------------------------------------------------------------------
  // GET /health
  // ---------------------------------------------------------------------------
  app.get('/health', async (_request, reply) => {
    return reply.send({ status: 'ok', mode: 'proxy' });
  });

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------
  try {
    await app.listen({ port: proxyConfig.port, host: '0.0.0.0' });
    console.log(`[Q-Proxy] Listening on port ${proxyConfig.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildErrorPage(url: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Q Proxy — Error</title>
  <style>
    body { font-family: sans-serif; background: #fef2f2; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
    .box { background: #fff; border: 1px solid #fca5a5; border-radius: 12px; padding: 32px; max-width: 480px; }
    h1 { color: #dc2626; margin-bottom: 12px; }
    p { color: #374151; font-size: 14px; line-height: 1.6; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 12px; word-break: break-all; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Could not load page</h1>
    <p>Q Proxy was unable to fetch <code>${escapeHtml(url)}</code>.</p>
    <p style="margin-top: 12px; color: #64748b;">${escapeHtml(message)}</p>
    <p style="margin-top: 16px;"><a href="/" style="color: #6366f1; font-weight: 600;">&larr; Back to Q Proxy</a></p>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
