// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, registerAndGetToken } from './setup.js';
import { resolveKbLanguageName, buildMultilingualDirective, DEFAULT_KB_LANGUAGE } from '../agent/language.js';

describe('resolveKbLanguageName', () => {
  it('defaults to English when unset or blank', () => {
    expect(resolveKbLanguageName(undefined)).toBe(DEFAULT_KB_LANGUAGE);
    expect(resolveKbLanguageName(null)).toBe(DEFAULT_KB_LANGUAGE);
    expect(resolveKbLanguageName('   ')).toBe(DEFAULT_KB_LANGUAGE);
  });

  it('maps language codes to names, case-insensitively', () => {
    expect(resolveKbLanguageName('es')).toBe('Spanish');
    expect(resolveKbLanguageName('ZH-CN')).toBe('Chinese (Simplified)');
    expect(resolveKbLanguageName('fr')).toBe('French');
  });

  it('passes through an already-human-readable name', () => {
    expect(resolveKbLanguageName('Spanish')).toBe('Spanish');
    expect(resolveKbLanguageName('Klingon')).toBe('Klingon');
  });
});

describe('buildMultilingualDirective', () => {
  it('instructs replying in the user language but searching in the KB language', () => {
    const directive = buildMultilingualDirective('Spanish');
    // References the KB language for search/query translation.
    expect(directive).toContain('Spanish');
    expect(directive.toLowerCase()).toContain('search');
    // Reinforces that non-KB-language questions are still in scope.
    expect(directive.toLowerCase()).toContain('in scope');
    // Reply is in the user's own language.
    expect(directive.toLowerCase()).toContain("user's");
  });
});

describe('Knowledge base language setting', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('persists and returns the configured language, and resets to default when cleared', async () => {
    const { token } = await registerAndGetToken(app, { email: `kb-lang-${Date.now()}@example.com` });
    const auth = { Authorization: `Bearer ${token}` };

    const put = await app.inject({
      method: 'PUT',
      url: '/api/v1/tenant/settings',
      headers: auth,
      payload: { knowledgeBaseLanguage: 'Spanish' },
    });
    expect(put.statusCode).toBe(200);

    const get = await app.inject({ method: 'GET', url: '/api/v1/tenant/settings', headers: auth });
    expect(get.statusCode).toBe(200);
    expect(JSON.parse(get.body).knowledgeBaseLanguage).toBe('Spanish');

    // Clearing it should reset to the (English) default — stored as absent.
    const clear = await app.inject({
      method: 'PUT',
      url: '/api/v1/tenant/settings',
      headers: auth,
      payload: { knowledgeBaseLanguage: '' },
    });
    expect(clear.statusCode).toBe(200);
    const after = await app.inject({ method: 'GET', url: '/api/v1/tenant/settings', headers: auth });
    // Cleared value is falsy (SQLite → undefined, in-memory → ''); either way
    // resolveKbLanguageName() treats it as the English default.
    const cleared = JSON.parse(after.body).knowledgeBaseLanguage;
    expect(cleared).toBeFalsy();
    expect(resolveKbLanguageName(cleared)).toBe(DEFAULT_KB_LANGUAGE);
  });
});
