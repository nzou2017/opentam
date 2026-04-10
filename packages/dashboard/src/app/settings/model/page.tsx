'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useState, useEffect } from 'react';
import { backendConfig } from '@/lib/config';

export default function ModelSettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [form, setForm] = useState({
    llmProvider: '',
    llmApiKey: '',
    llmBaseUrl: '',
    llmModel: '',
    sttBaseUrl: '',
    sttApiKey: '',
    sttModel: '',
    sttPath: '',
    embeddingProvider: '',
    openaiApiKey: '',
    ollamaUrl: '',
    ollamaEmbeddingModel: '',
    chromaUrl: '',
    chromaCollection: '',
    embeddingDimensions: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch(`${backendConfig.backendUrl}/api/v1/tenant/settings`, {
      headers: { Authorization: `Bearer ${backendConfig.secretKey}` },
    })
      .then(r => r.json())
      .then(data => {
        setSettings(data);
        setForm({
          llmProvider: data.llmProvider ?? '',
          llmApiKey: '',
          llmBaseUrl: data.llmBaseUrl ?? '',
          llmModel: data.llmModel ?? '',
          sttBaseUrl: data.sttBaseUrl ?? '',
          sttApiKey: '',
          sttModel: data.sttModel ?? '',
          sttPath: data.sttPath ?? '',
          embeddingProvider: data.embeddingProvider ?? '',
          openaiApiKey: '',
          ollamaUrl: data.ollamaUrl ?? '',
          ollamaEmbeddingModel: data.ollamaEmbeddingModel ?? '',
          chromaUrl: data.chromaUrl ?? '',
          chromaCollection: data.chromaCollection ?? '',
          embeddingDimensions: data.embeddingDimensions?.toString() ?? '',
        });
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage('');
    const body: Record<string, string | number> = {};
    if (form.llmProvider) body.llmProvider = form.llmProvider;
    if (form.llmApiKey) body.llmApiKey = form.llmApiKey;
    if (form.llmBaseUrl) body.llmBaseUrl = form.llmBaseUrl;
    if (form.llmModel) body.llmModel = form.llmModel;
    if (form.sttBaseUrl) body.sttBaseUrl = form.sttBaseUrl;
    if (form.sttApiKey) body.sttApiKey = form.sttApiKey;
    if (form.sttModel) body.sttModel = form.sttModel;
    if (form.sttPath) body.sttPath = form.sttPath;
    if (form.embeddingProvider) body.embeddingProvider = form.embeddingProvider;
    if (form.openaiApiKey) body.openaiApiKey = form.openaiApiKey;
    if (form.ollamaUrl) body.ollamaUrl = form.ollamaUrl;
    if (form.ollamaEmbeddingModel) body.ollamaEmbeddingModel = form.ollamaEmbeddingModel;
    if (form.chromaUrl) body.chromaUrl = form.chromaUrl;
    if (form.chromaCollection) body.chromaCollection = form.chromaCollection;
    if (form.embeddingDimensions) body.embeddingDimensions = parseInt(form.embeddingDimensions, 10);

    try {
      const res = await fetch(`${backendConfig.backendUrl}/api/v1/tenant/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${backendConfig.secretKey}`,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) setMessage('Saved');
      else setMessage('Failed to save');
    } catch { setMessage('Failed to save'); }
    setSaving(false);
  }

  const inputCls = 'w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500';

  return (
    <div className="max-w-lg space-y-6">
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <h2 className="mb-4 text-base font-medium text-gray-800 dark:text-gray-200">LLM Provider</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Provider</label>
            <select value={form.llmProvider} onChange={e => setForm(f => ({ ...f, llmProvider: e.target.value }))}
              aria-label="Select provider" className={inputCls}>
              <option value="">Server default</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Gemini</option>
              <option value="openai">OpenAI-compatible</option>
              <option value="minimax">MiniMax</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Model</label>
            <input type="text" value={form.llmModel} onChange={e => setForm(f => ({ ...f, llmModel: e.target.value }))}
              placeholder="e.g. claude-sonnet-4-6" aria-label="Model" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              API Key <span className="text-gray-400">(leave blank to keep current)</span>
            </label>
            <input type="password" value={form.llmApiKey} onChange={e => setForm(f => ({ ...f, llmApiKey: e.target.value }))}
              placeholder={settings?.llmApiKey ?? 'Not set'} aria-label="LLM API key" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Base URL</label>
            <input type="url" value={form.llmBaseUrl} onChange={e => setForm(f => ({ ...f, llmBaseUrl: e.target.value }))}
              placeholder="https://api.openai.com/v1" aria-label="LLM base URL" className={inputCls} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <h2 className="mb-4 text-base font-medium text-gray-800 dark:text-gray-200">Speech-to-Text</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">STT Model</label>
            <input type="text" value={form.sttModel} onChange={e => setForm(f => ({ ...f, sttModel: e.target.value }))}
              placeholder="whisper-1" aria-label="STT model" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">STT Base URL</label>
            <input type="url" value={form.sttBaseUrl} onChange={e => setForm(f => ({ ...f, sttBaseUrl: e.target.value }))}
              aria-label="STT base URL" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              STT API Key <span className="text-gray-400">(leave blank to keep current)</span>
            </label>
            <input type="password" value={form.sttApiKey} onChange={e => setForm(f => ({ ...f, sttApiKey: e.target.value }))}
              placeholder={settings?.sttApiKey ?? 'Not set'} aria-label="STT API key" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">STT Path</label>
            <input type="text" value={form.sttPath} onChange={e => setForm(f => ({ ...f, sttPath: e.target.value }))}
              placeholder="/audio/transcriptions" aria-label="STT path" className={inputCls} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <h2 className="mb-4 text-base font-medium text-gray-800 dark:text-gray-200">Embedding Provider</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Provider</label>
            <select value={form.embeddingProvider} onChange={e => setForm(f => ({ ...f, embeddingProvider: e.target.value }))}
              aria-label="Embedding provider" className={inputCls}>
              <option value="">Server default</option>
              <option value="openai">OpenAI</option>
              <option value="minimax">MiniMax</option>
              <option value="ollama">Ollama</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              OpenAI API Key <span className="text-gray-400">(for OpenAI embeddings)</span>
            </label>
            <input type="password" value={form.openaiApiKey} onChange={e => setForm(f => ({ ...f, openaiApiKey: e.target.value }))}
              placeholder={settings?.openaiApiKey ?? 'Not set'} aria-label="OpenAI API key" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Embedding Dimensions</label>
            <input type="number" value={form.embeddingDimensions} onChange={e => setForm(f => ({ ...f, embeddingDimensions: e.target.value }))}
              placeholder="Provider default" aria-label="Embedding dimensions" className={inputCls} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <h2 className="mb-4 text-base font-medium text-gray-800 dark:text-gray-200">Ollama</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Ollama URL</label>
            <input type="url" value={form.ollamaUrl} onChange={e => setForm(f => ({ ...f, ollamaUrl: e.target.value }))}
              placeholder="http://localhost:11434" aria-label="Ollama URL" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Embedding Model</label>
            <input type="text" value={form.ollamaEmbeddingModel} onChange={e => setForm(f => ({ ...f, ollamaEmbeddingModel: e.target.value }))}
              placeholder="nomic-embed-text" aria-label="Ollama embedding model" className={inputCls} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <h2 className="mb-4 text-base font-medium text-gray-800 dark:text-gray-200">ChromaDB</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Chroma URL</label>
            <input type="url" value={form.chromaUrl} onChange={e => setForm(f => ({ ...f, chromaUrl: e.target.value }))}
              placeholder="http://localhost:8000" aria-label="ChromaDB URL" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Collection Name</label>
            <input type="text" value={form.chromaCollection} onChange={e => setForm(f => ({ ...f, chromaCollection: e.target.value }))}
              placeholder="Auto (q_tenant_{id})" aria-label="Chroma collection" className={inputCls} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          aria-label="Save model settings" className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-amber-400 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save'}
        </button>
        {message && <span className="text-sm text-green-600">{message}</span>}
      </div>
    </div>
  );
}
