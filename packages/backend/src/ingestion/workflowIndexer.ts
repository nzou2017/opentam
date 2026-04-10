// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { ChromaClient } from 'chromadb';
import type { Workflow, WorkflowStep } from '@opentam/shared';
import { config } from '../config.js';
import { embedTexts, embedQuery } from './embedder.js';

function collectionName(tenantId: string): string {
  return `q_workflows_${tenantId.replace(/[^a-z0-9_-]/gi, '_')}`;
}

function getClient(): ChromaClient {
  return new ChromaClient({ path: config.chromaUrl });
}

async function getCollection(tenantId: string) {
  const client = getClient();
  return client.getOrCreateCollection({
    name: collectionName(tenantId),
    metadata: { 'hnsw:space': 'cosine' },
  });
}

/**
 * Index a workflow and its steps into ChromaDB for semantic search.
 */
export async function indexWorkflow(
  tenantId: string,
  workflow: Workflow,
  steps: WorkflowStep[],
): Promise<void> {
  const collection = await getCollection(tenantId);

  // Build texts: workflow summary + per-step descriptions
  const texts: string[] = [];
  const ids: string[] = [];
  const metadatas: Record<string, string | number>[] = [];

  // Workflow-level embedding
  const summaryText = `${workflow.name}: ${workflow.description}. Tags: ${(workflow.tags ?? []).join(', ')}`;
  texts.push(summaryText);
  ids.push(`${workflow.id}-summary`);
  metadatas.push({
    tenantId,
    workflowId: workflow.id,
    stepIndex: -1,
    workflowName: workflow.name,
    status: workflow.status,
  });

  // Per-step embeddings
  for (const step of steps) {
    const stepText = `Step ${step.stepIndex + 1} of '${workflow.name}': ${step.contextHint}. URL: ${step.urlPattern}. Action: ${step.action} on ${step.selector}`;
    texts.push(stepText);
    ids.push(`${workflow.id}-step-${step.stepIndex}`);
    metadatas.push({
      tenantId,
      workflowId: workflow.id,
      stepIndex: step.stepIndex,
      workflowName: workflow.name,
      status: workflow.status,
    });
  }

  const embeddings = await embedTexts(texts);

  // Upsert in batches of 100
  const BATCH = 100;
  for (let i = 0; i < texts.length; i += BATCH) {
    await collection.upsert({
      ids: ids.slice(i, i + BATCH),
      embeddings: embeddings.slice(i, i + BATCH),
      documents: texts.slice(i, i + BATCH),
      metadatas: metadatas.slice(i, i + BATCH),
    });
  }
}

export interface WorkflowSearchResult {
  workflowId: string;
  workflowName: string;
  score: number;
  matchedStepIndices: number[];
}

/**
 * Search workflows by semantic similarity, grouping results by workflow.
 */
export async function searchWorkflows(
  tenantId: string,
  queryEmbedding: number[],
  topK = 5,
): Promise<WorkflowSearchResult[]> {
  let collection;
  try {
    collection = await getCollection(tenantId);
  } catch {
    return [];
  }

  const result = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: topK * 3, // fetch more to group by workflow
  });

  const docs = result.documents[0] ?? [];
  const distances = result.distances?.[0] ?? [];
  const metadatas = result.metadatas[0] ?? [];

  // Group by workflowId
  const grouped = new Map<string, { name: string; bestScore: number; steps: number[] }>();

  for (let i = 0; i < docs.length; i++) {
    const meta = metadatas[i] as Record<string, string | number> | null;
    if (!meta) continue;

    const workflowId = meta.workflowId as string;
    const workflowName = meta.workflowName as string;
    const stepIndex = meta.stepIndex as number;
    const dist = distances[i];
    const score = dist != null ? 1 - dist : 0;

    const existing = grouped.get(workflowId);
    if (existing) {
      existing.bestScore = Math.max(existing.bestScore, score);
      if (stepIndex >= 0) existing.steps.push(stepIndex);
    } else {
      grouped.set(workflowId, {
        name: workflowName,
        bestScore: score,
        steps: stepIndex >= 0 ? [stepIndex] : [],
      });
    }
  }

  return [...grouped.entries()]
    .map(([workflowId, data]) => ({
      workflowId,
      workflowName: data.name,
      score: data.bestScore,
      matchedStepIndices: data.steps.sort((a, b) => a - b),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Delete all vectors for a workflow from the tenant's workflow collection.
 */
export async function deleteWorkflowVectors(
  tenantId: string,
  workflowId: string,
): Promise<void> {
  try {
    const collection = await getCollection(tenantId);
    await collection.delete({ where: { workflowId } });
  } catch {
    // Collection may not exist yet — safe to ignore
  }
}
