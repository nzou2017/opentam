'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getWorkflow, updateWorkflow, updateWorkflowSteps, publishWorkflow, getMapEntries } from '@/lib/api';

interface StepInput {
  id: string;
  urlPattern: string;
  selector: string;
  action: 'click' | 'navigate' | 'input' | 'wait' | 'verify';
  contextHint: string;
  expectedSelectors?: string[];
  mapEntryId?: string;
}

interface Workflow {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  status: string;
  source: string;
  tags?: string[];
  version: number;
}

interface MapEntry {
  id: string;
  feature: string;
  url: string;
  selector: string;
}

const ACTIONS = ['click', 'navigate', 'input', 'wait', 'verify'] as const;

export default function WorkflowEditorPage() {
  const params = useParams();
  const router = useRouter();
  const workflowId = params.id as string;

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [steps, setSteps] = useState<StepInput[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mapEntries, setMapEntries] = useState<MapEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [workflowId]);

  async function loadData() {
    setLoading(true);
    try {
      const [wfData, entries] = await Promise.all([
        getWorkflow(workflowId),
        getMapEntries().then(d => d.entries).catch(() => []),
      ]);
      setWorkflow(wfData.workflow);
      setName(wfData.workflow.name);
      setDescription(wfData.workflow.description);
      setSteps(
        wfData.steps.map((s: StepInput & { stepIndex: number; workflowId: string }) => ({
          id: s.id,
          urlPattern: s.urlPattern,
          selector: s.selector,
          action: s.action,
          contextHint: s.contextHint,
          expectedSelectors: s.expectedSelectors,
          mapEntryId: s.mapEntryId,
        })),
      );
      setMapEntries(entries);
    } catch (err) {
      setError('Failed to load workflow');
    } finally {
      setLoading(false);
    }
  }

  function addStep() {
    setSteps([
      ...steps,
      {
        id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        urlPattern: '/',
        selector: '',
        action: 'click',
        contextHint: '',
      },
    ]);
  }

  function removeStep(index: number) {
    setSteps(steps.filter((_, i) => i !== index));
  }

  function updateStep(index: number, patch: Partial<StepInput>) {
    setSteps(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function importFromMap(index: number, entryId: string) {
    const entry = mapEntries.find((e) => e.id === entryId);
    if (!entry) return;
    updateStep(index, {
      urlPattern: entry.url,
      selector: entry.selector,
      contextHint: entry.feature,
      mapEntryId: entry.id,
    });
  }

  function moveStep(from: number, to: number) {
    if (to < 0 || to >= steps.length) return;
    const updated = [...steps];
    const [moved] = updated.splice(from, 1);
    updated.splice(to, 0, moved);
    setSteps(updated);
  }

  async function handleSave() {
    if (!name.trim() || steps.length === 0) return;
    setSaving(true);
    setError('');
    try {
      await updateWorkflow(workflowId, { name: name.trim(), description: description.trim() });
      await updateWorkflowSteps(workflowId, steps);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    await handleSave();
    try {
      const data = await publishWorkflow(workflowId);
      setWorkflow(data.workflow);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish');
    }
  }

  if (loading) return <div className="p-8 text-gray-500 dark:text-gray-400">Loading...</div>;
  if (!workflow) return <div className="p-8 text-red-600 dark:text-red-400">{error || 'Workflow not found'}</div>;

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit Workflow</h1>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            workflow.status === 'published'
              ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
              : workflow.status === 'draft'
                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
          }`}
        >
          {workflow.status}
        </span>
      </div>

      {/* Metadata */}
      <div className="space-y-3 mb-8">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Name"
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-label="Description"
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
            rows={2}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Steps ({steps.length})</h2>
      </div>

      <div className="space-y-4 mb-6">
        {steps.map((step, i) => (
          <div key={step.id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                  {i + 1}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => moveStep(i, i - 1)}
                    disabled={i === 0}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30"
                    aria-label="Move step up"
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveStep(i, i + 1)}
                    disabled={i === steps.length - 1}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30"
                    aria-label="Move step down"
                    title="Move down"
                  >
                    ↓
                  </button>
                </div>
              </div>
              <button
                onClick={() => removeStep(i)}
                aria-label="Remove step"
                className="text-xs text-red-500 hover:text-red-700"
              >
                Remove
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">URL Pattern</label>
                <input
                  type="text"
                  value={step.urlPattern}
                  onChange={(e) => updateStep(i, { urlPattern: e.target.value })}
                  placeholder="/settings/*"
                  aria-label="URL pattern"
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Selector</label>
                <input
                  type="text"
                  value={step.selector}
                  onChange={(e) => updateStep(i, { selector: e.target.value })}
                  placeholder="#my-button"
                  aria-label="Selector"
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Action</label>
                <select
                  value={step.action}
                  onChange={(e) => updateStep(i, { action: e.target.value as StepInput['action'] })}
                  aria-label="Select action"
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm"
                >
                  {ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Import from Map</label>
                <select
                  value=""
                  onChange={(e) => importFromMap(i, e.target.value)}
                  aria-label="Select map entry"
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm"
                >
                  <option value="">Select entry...</option>
                  {mapEntries.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.feature}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Context Hint</label>
              <textarea
                value={step.contextHint}
                onChange={(e) => updateStep(i, { contextHint: e.target.value })}
                placeholder="Paste the HEC token you copied from Splunk"
                aria-label="Context hint"
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm"
                rows={2}
              />
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={addStep}
        aria-label="Add step"
        className="mb-6 w-full rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 py-2 text-sm text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400"
      >
        + Add Step
      </button>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          aria-label="Save draft"
          className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Draft'}
        </button>
        <button
          onClick={handlePublish}
          disabled={saving}
          aria-label="Publish workflow"
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          Publish
        </button>
        <button
          onClick={() => router.push('/workflows')}
          aria-label="Back to workflows"
          className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Back
        </button>
      </div>
    </div>
  );
}
