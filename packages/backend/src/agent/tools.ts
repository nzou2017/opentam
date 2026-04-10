// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';
import type { FunctionalMapEntry, Platform } from '@opentam/shared';
import { config } from '../config.js';

export type ToolName = 'lookup_functional_map' | 'search_docs' | 'search_workflows' | 'highlight_element' | 'deep_link' | 'show_message' | 'create_tour' | 'submit_feedback';

export const INTERVENTION_TOOLS = new Set<ToolName>([
  'highlight_element',
  'deep_link',
  'show_message',
  'create_tour',
]);

// Web tool definitions (default)
export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'search_docs',
    description:
      'Search ingested product documentation for how-to answers. Use when the functional map alone is insufficient to explain what the user should do.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Natural language question about how to use the product',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'lookup_functional_map',
    description:
      "Search the functional map for features matching the user's apparent intent. Use keywords from the current URL or DOM snapshot.",
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: "Keywords describing what the user seems to be looking for",
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_workflows',
    description:
      'Search for multi-step workflows/SOPs. Use when the user is attempting a multi-step process or asks "how do I" questions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Description of the task the user is trying to accomplish',
        },
        current_url: {
          type: 'string',
          description: 'User current URL for relevance ranking',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'highlight_element',
    description:
      'Highlight a specific UI element to guide the user. Use when you have identified the exact DOM selector from the functional map.',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector or element ID (e.g. #api-key-btn)' },
        message: {
          type: 'string',
          description: 'One-sentence friendly message explaining what the user should do',
        },
        confidence: {
          type: 'number',
          description: 'How confident you are this is the right intervention (0-1)',
        },
      },
      required: ['selector', 'message', 'confidence'],
    },
  },
  {
    name: 'deep_link',
    description:
      'Redirect the user to the correct page. Use when the user is on the wrong page entirely.',
    input_schema: {
      type: 'object' as const,
      properties: {
        href: { type: 'string', description: 'Target URL path (e.g. /settings/api-keys)' },
        message: {
          type: 'string',
          description: 'One-sentence friendly message explaining where you are sending them',
        },
        confidence: {
          type: 'number',
          description: 'How confident you are this is the right intervention (0-1)',
        },
      },
      required: ['href', 'message', 'confidence'],
    },
  },
  {
    name: 'show_message',
    description:
      'Show a helpful message when no specific element or page can be identified. Use as a last resort.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: {
          type: 'string',
          description: 'One-sentence friendly message asking if the user needs help',
        },
        confidence: {
          type: 'number',
          description: 'How confident you are this is useful (0-1)',
        },
      },
      required: ['message', 'confidence'],
    },
  },
  {
    name: 'create_tour',
    description: 'Create a multi-step guided tour when the task requires visiting multiple UI elements in sequence.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'Opening message introducing the tour' },
        workflow_id: { type: 'string', description: 'Optional ID of a stored workflow this tour is based on' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              selector: { type: 'string' },
              message: { type: 'string', description: 'Instruction for this step' },
              url_pattern: { type: 'string', description: 'URL pattern — if set, navigate here before highlighting' },
              action: { type: 'string', enum: ['click', 'navigate', 'input', 'wait', 'verify'], description: 'What the user should do at this step' },
            },
            required: ['selector', 'message'],
          },
          description: 'Ordered list of steps (2-5 steps max)',
          minItems: 2,
          maxItems: 5,
        },
        confidence: { type: 'number' },
      },
      required: ['message', 'steps', 'confidence'],
    },
  },
  {
    name: 'submit_feedback',
    description: 'Submit a feature request, bug report, or positive feedback on behalf of the user. Use when the user wants to report an issue, request a new feature, or share positive feedback about the product.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['feature_request', 'bug_report', 'positive_feedback'],
          description: 'The type of feedback',
        },
        title: {
          type: 'string',
          description: 'A concise title summarizing the feedback (max 100 chars)',
        },
        description: {
          type: 'string',
          description: 'Detailed description of the feature request, bug, or feedback',
        },
      },
      required: ['type', 'title', 'description'],
    },
  },
];

// OpenAI-compatible tool definitions (used for MiniMax and other OpenAI-format providers)
export const OPENAI_TOOL_DEFINITIONS: OpenAI.Chat.ChatCompletionTool[] = TOOL_DEFINITIONS.map(
  (t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as Record<string, unknown>,
    },
  }),
);

/**
 * Returns platform-adapted tool definitions.
 * iOS/Android tools use the same names but different descriptions so the LLM
 * generates accessibility identifiers / view IDs instead of CSS selectors.
 */
export function getToolDefinitions(platform: Platform): Anthropic.Tool[] {
  if (platform === 'web') return TOOL_DEFINITIONS;

  const selectorDesc = platform === 'ios'
    ? 'Accessibility identifier (e.g. settings-profile-button)'
    : 'Content description or view ID (e.g. settings_profile_btn)';

  const hrefDesc = platform === 'ios'
    ? 'Screen route (e.g. settings/profile)'
    : 'Destination name (e.g. settings/profile)';

  const selectorType = platform === 'ios' ? 'accessibility identifier' : 'content description or view ID';

  return TOOL_DEFINITIONS.map(tool => {
    if (tool.name === 'highlight_element') {
      return {
        ...tool,
        description: `Highlight a specific UI element to guide the user. Use when you have identified the exact ${selectorType} from the functional map.`,
        input_schema: {
          ...tool.input_schema,
          properties: {
            ...(tool.input_schema as Record<string, unknown>).properties as Record<string, unknown>,
            selector: { type: 'string', description: selectorDesc },
          },
        },
      };
    }
    if (tool.name === 'deep_link') {
      return {
        ...tool,
        description: `Navigate the user to the correct screen. Use when the user is on the wrong screen entirely.`,
        input_schema: {
          ...tool.input_schema,
          properties: {
            ...(tool.input_schema as Record<string, unknown>).properties as Record<string, unknown>,
            href: { type: 'string', description: hrefDesc },
          },
        },
      };
    }
    if (tool.name === 'create_tour') {
      return {
        ...tool,
        description: `Create a multi-step guided tour when the task requires visiting multiple UI elements or screens in sequence.`,
        input_schema: {
          ...tool.input_schema,
          properties: {
            ...(tool.input_schema as Record<string, unknown>).properties as Record<string, unknown>,
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  selector: { type: 'string', description: selectorDesc },
                  message: { type: 'string', description: 'Instruction for this step' },
                  url_pattern: { type: 'string', description: `${hrefDesc} — if set, navigate here before highlighting` },
                  action: { type: 'string', enum: ['click', 'navigate', 'input', 'wait', 'verify'], description: 'What the user should do at this step' },
                },
                required: ['selector', 'message'],
              },
              description: 'Ordered list of steps (2-5 steps max)',
              minItems: 2,
              maxItems: 5,
            },
          },
        },
      };
    }
    if (tool.name === 'lookup_functional_map') {
      const mapDesc = platform === 'ios'
        ? "Search the functional map for features matching the user's apparent intent. Use keywords from the current screen or view hierarchy."
        : "Search the functional map for features matching the user's apparent intent. Use keywords from the current screen or view hierarchy.";
      return { ...tool, description: mapDesc };
    }
    return tool;
  });
}

export function getOpenAIToolDefinitions(platform: Platform): OpenAI.Chat.ChatCompletionTool[] {
  return getToolDefinitions(platform).map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as Record<string, unknown>,
    },
  }));
}

export function parseIntervention(
  toolName: string,
  input: Record<string, unknown>,
): import('@opentam/shared').InterventionCommand {
  if (toolName === 'highlight_element' && input.selector) {
    return {
      action: 'overlay_highlight',
      elementId: input.selector as string,
      message: input.message as string,
      confidence: input.confidence as number,
    };
  }
  if (toolName === 'deep_link' && input.href) {
    return {
      action: 'deep_link',
      href: input.href as string,
      message: input.message as string,
      confidence: input.confidence as number,
    };
  }
  if (toolName === 'create_tour' && Array.isArray(input.steps)) {
    return {
      action: 'tour',
      message: input.message as string,
      confidence: input.confidence as number,
      workflowId: input.workflow_id as string | undefined,
      steps: (input.steps as Array<{ selector: string; message: string; url_pattern?: string; action?: string }>).map((s) => ({
        selector: s.selector,
        message: s.message,
        urlPattern: s.url_pattern,
        action: s.action as import('@opentam/shared').WorkflowStepAction | undefined,
      })),
    };
  }
  return {
    action: 'message_only',
    message: input.message as string,
    confidence: (input.confidence as number) ?? 0.5,
  };
}

export async function executeSearchDocs(
  input: { query: string },
  tenantId: string,
): Promise<string> {
  const ragReady = config.embeddingProvider === 'ollama'
    ? true
    : config.embeddingProvider === 'minimax'
      ? Boolean(config.minimaxApiKey)
      : Boolean(config.openaiApiKey);

  if (!ragReady) {
    return 'Documentation search is not configured.';
  }

  const { embedQuery } = await import('../ingestion/embedder.js');
  const { searchDocs } = await import('../ingestion/indexer.js');

  const queryEmbedding = await embedQuery(input.query);
  const results = await searchDocs(tenantId, queryEmbedding);

  if (results.length === 0) {
    return 'No relevant documentation found.';
  }

  return results
    .map(
      (r, i) =>
        `Result ${i + 1} (score: ${r.score.toFixed(2)}): ${r.text}`,
    )
    .join('\n\n');
}

export async function executeSearchWorkflows(
  input: { query: string; current_url?: string },
  tenantId: string,
): Promise<string> {
  const ragReady = config.embeddingProvider === 'ollama'
    ? true
    : config.embeddingProvider === 'minimax'
      ? Boolean(config.minimaxApiKey)
      : Boolean(config.openaiApiKey);

  if (!ragReady) {
    return 'Workflow search is not configured (no embedding provider).';
  }

  const { embedQuery } = await import('../ingestion/embedder.js');
  const { searchWorkflows } = await import('../ingestion/workflowIndexer.js');
  const { getStore } = await import('../db/index.js');

  const queryEmbedding = await embedQuery(input.query);
  const results = await searchWorkflows(tenantId, queryEmbedding);

  if (results.length === 0) {
    return 'No matching workflows found.';
  }

  // Load full workflow + steps for top results
  const store = getStore();
  const output: string[] = [];

  for (const result of results.slice(0, 3)) {
    const workflow = await store.getWorkflowById(result.workflowId, tenantId);
    if (!workflow) continue;
    const steps = await store.getWorkflowSteps(result.workflowId);

    output.push(`Workflow: ${workflow.name} (id: ${workflow.id}, score: ${result.score.toFixed(2)})
Description: ${workflow.description}
Steps:
${steps.map(s => `  ${s.stepIndex + 1}. [${s.action}] ${s.contextHint} (url: ${s.urlPattern}, selector: ${s.selector})`).join('\n')}`);
  }

  return output.join('\n\n');
}

export async function executeSubmitFeedback(
  input: { type: string; title: string; description: string },
  tenantId: string,
): Promise<string> {
  // Block feedback submission for Q admin tenant unless testing mode is enabled
  if (tenantId === 'tenant-q-admin' && !config.testingMode) {
    return 'Feedback submission is not available for the admin portal in production mode.';
  }

  const { getStore } = await import('../db/index.js');
  const { hasFeature } = await import('@opentam/shared');
  const store = getStore();

  const feedbackType = input.type as 'feature_request' | 'bug_report' | 'positive_feedback';

  // All feedback submission requires enterprise plan
  const tenant = await store.getTenantById(tenantId);
  const plan = (tenant?.plan ?? 'hobbyist') as 'hobbyist' | 'startup' | 'enterprise';
  if (!hasFeature(plan, 'feature_requests')) {
    return `Feedback submission (feature requests, bug reports, and feedback) is available on the Enterprise plan. Your current plan is "${plan}". To unlock this feature, contact q.cue.2026@gmail.com for an Enterprise license.`;
  }

  const id = `fr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await store.createFeatureRequest({
    id,
    tenantId,
    type: feedbackType,
    title: input.title.slice(0, 100),
    description: input.description,
    status: 'new',
    votes: 0,
    submittedBy: 'q-chat-agent',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const typeLabel = feedbackType === 'feature_request' ? 'Feature request' :
    feedbackType === 'bug_report' ? 'Bug report' : 'Feedback';

  return `${typeLabel} submitted successfully (ID: ${id}). Title: "${input.title}"`;
}

export function executeLookup(
  input: { query: string },
  entries: FunctionalMapEntry[],
): string {
  const lower = input.query.toLowerCase();
  const scored = entries.map((e) => {
    let score = 0;
    if (e.feature.toLowerCase().includes(lower)) score += 3;
    if (e.description.toLowerCase().includes(lower)) score += 2;
    if (e.url.toLowerCase().includes(lower)) score += 1;
    return { entry: e, score };
  });

  const matches = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.entry);

  return JSON.stringify(matches.length > 0 ? matches : entries.slice(0, 3));
}
