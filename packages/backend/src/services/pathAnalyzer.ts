// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import Anthropic from '@anthropic-ai/sdk';
import type { Workflow, WorkflowStep } from '@opentam/shared';
import { config } from '../config.js';
import { getStore } from '../db/index.js';

interface PathEvent {
  url: string;
  selector: string;
  timestamp: number;
}

interface AnalyzedWorkflow {
  name: string;
  description: string;
  steps: Array<{
    urlPattern: string;
    selector: string;
    action: string;
    contextHint: string;
  }>;
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Analyze accumulated anonymized navigation paths to identify recurring workflows.
 * Uses Claude to identify patterns, stores results as draft workflows.
 */
export async function analyzePaths(
  tenantId: string,
  sessions: PathEvent[][],
): Promise<void> {
  if (!config.anthropicApiKey) {
    console.warn('[Q] Path analysis skipped — no Anthropic API key configured');
    return;
  }

  // Format sessions for the LLM
  const formatted = sessions.map((session, i) =>
    `Session ${i + 1}:\n${session.map((e) => `  ${e.url} → ${e.selector}`).join('\n')}`,
  ).join('\n\n');

  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const response = await client.messages.create({
    model: config.model,
    max_tokens: 2048,
    system: `You analyze anonymized user navigation paths to identify recurring multi-step workflows.
Output valid JSON only — an array of workflow objects.
Each workflow: { "name": string, "description": string, "steps": [{ "urlPattern": string, "selector": string, "action": "click"|"navigate"|"input", "contextHint": string }] }
Only include workflows that appear in at least 2 sessions. Merge similar paths into canonical workflows.`,
    messages: [
      {
        role: 'user',
        content: `Given these ${sessions.length} anonymized user navigation paths, identify recurring multi-step workflows:\n\n${formatted}`,
      },
    ],
  });

  // Parse the response
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') return;

  let workflows: AnalyzedWorkflow[];
  try {
    // Extract JSON from the response (may be wrapped in markdown code blocks)
    const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    workflows = JSON.parse(jsonMatch[0]);
  } catch {
    console.warn('[Q] Failed to parse path analysis response');
    return;
  }

  // Store as draft workflows
  const store = getStore();
  const now = new Date().toISOString();

  for (const wf of workflows) {
    if (!wf.name || !wf.steps || wf.steps.length === 0) continue;

    const workflowId = generateId('wf');
    const workflow: Workflow = {
      id: workflowId,
      tenantId,
      name: wf.name,
      description: wf.description || 'Learned from user navigation patterns',
      status: 'draft',
      source: 'learned',
      tags: ['auto-learned'],
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const steps: WorkflowStep[] = wf.steps.map((s, i) => ({
      id: generateId('step'),
      workflowId,
      stepIndex: i,
      urlPattern: s.urlPattern,
      selector: s.selector,
      action: (s.action as WorkflowStep['action']) || 'click',
      contextHint: s.contextHint || `Step ${i + 1}`,
    }));

    await store.createWorkflow(workflow, steps);
  }
}
