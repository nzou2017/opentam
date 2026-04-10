// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import Anthropic from '@anthropic-ai/sdk';
import type { FrustrationEvent, FunctionalMapEntry, InterventionCommand, Platform } from '@opentam/shared';
import { config } from '../config.js';
import {
  INTERVENTION_TOOLS,
  getToolDefinitions,
  executeLookup,
  executeSearchDocs,
  executeSearchWorkflows,
  executeSubmitFeedback,
  parseIntervention,
} from './tools.js';

const WEB_SYSTEM_PROMPT = `You are Q, a non-intrusive user guidance agent embedded in a web application.
A user is showing signs of frustration. Your job is to determine the single best intervention.

Guidelines:
- First, optionally call lookup_functional_map if you need to find the right feature.
- Optionally call search_docs to find how-to answers from product documentation when the functional map doesn't have enough context.
- Use search_workflows when the user appears stuck in a multi-step task (repeated navigation, config/settings page frustration, "how do I" questions).
- When search_workflows returns a matching workflow, use create_tour with the workflow steps. Prefer workflow-based tours over ad-hoc tours when a published workflow matches.
- Then call exactly ONE intervention tool: highlight_element, deep_link, show_message, or create_tour.
- Prefer highlight_element when you have a clear selector match.
- Use deep_link when the user is on the wrong page entirely.
- Use create_tour when the user needs to navigate through multiple steps to complete a task.
- Use show_message only as a last resort when nothing maps clearly.
- Keep messages to one sentence, friendly and direct. No jargon.
- Set confidence >= 0.7 only when you have a clear match in the functional map.`;

const IOS_SYSTEM_PROMPT = `You are Q, a non-intrusive user guidance agent embedded in an iOS application.
A user is showing signs of frustration. Your job is to determine the single best intervention.

Guidelines:
- First, optionally call lookup_functional_map if you need to find the right feature.
- Optionally call search_docs to find how-to answers from product documentation when the functional map doesn't have enough context.
- Use search_workflows when the user appears stuck in a multi-step task.
- When search_workflows returns a matching workflow, use create_tour with the workflow steps.
- Then call exactly ONE intervention tool: highlight_element, deep_link, show_message, or create_tour.
- Prefer highlight_element when you have a clear accessibility identifier match.
- Use deep_link when the user is on the wrong screen entirely.
- Use create_tour when the user needs to navigate through multiple screens to complete a task.
- Use show_message only as a last resort when nothing maps clearly.
- Keep messages to one sentence, friendly and direct. No jargon.
- Set confidence >= 0.7 only when you have a clear match in the functional map.
- Selectors are iOS accessibility identifiers (e.g. "settings-profile-button"), NOT CSS selectors.
- URLs are screen routes (e.g. "settings/profile"), NOT web URLs.`;

const ANDROID_SYSTEM_PROMPT = `You are Q, a non-intrusive user guidance agent embedded in an Android application.
A user is showing signs of frustration. Your job is to determine the single best intervention.

Guidelines:
- First, optionally call lookup_functional_map if you need to find the right feature.
- Optionally call search_docs to find how-to answers from product documentation when the functional map doesn't have enough context.
- Use search_workflows when the user appears stuck in a multi-step task.
- When search_workflows returns a matching workflow, use create_tour with the workflow steps.
- Then call exactly ONE intervention tool: highlight_element, deep_link, show_message, or create_tour.
- Prefer highlight_element when you have a clear content description or view ID match.
- Use deep_link when the user is on the wrong screen entirely.
- Use create_tour when the user needs to navigate through multiple screens to complete a task.
- Use show_message only as a last resort when nothing maps clearly.
- Keep messages to one sentence, friendly and direct. No jargon.
- Set confidence >= 0.7 only when you have a clear match in the functional map.
- Selectors are Android content descriptions or view IDs (e.g. "settings_profile_btn"), NOT CSS selectors.
- URLs are destination names (e.g. "settings/profile"), NOT web URLs.`;

function getSystemPrompt(platform: Platform): string {
  switch (platform) {
    case 'ios': return IOS_SYSTEM_PROMPT;
    case 'android': return ANDROID_SYSTEM_PROMPT;
    default: return WEB_SYSTEM_PROMPT;
  }
}

function buildUserMessage(event: FrustrationEvent, entries: FunctionalMapEntry[], platform: Platform): string {
  const isWeb = platform === 'web';
  const signals = [
    event.signals.rageClicks > 0 && `${isWeb ? 'rage clicks' : 'rapid taps'}: ${event.signals.rageClicks}`,
    event.signals.deadEndLoops > 0 && `${isWeb ? 'dead-end loops' : 'navigation loops'}: ${event.signals.deadEndLoops}`,
    event.signals.dwellSeconds > 0 && `dwell time: ${event.signals.dwellSeconds}s`,
    event.signals.cursorEntropy > 0 && `${isWeb ? 'cursor entropy' : 'touch entropy'}: ${event.signals.cursorEntropy.toFixed(2)}`,
  ]
    .filter(Boolean)
    .join(', ');

  const locationLabel = isWeb ? 'Current URL' : 'Current screen';
  const snapshotLabel = isWeb ? 'DOM snapshot' : 'View hierarchy';

  return `Frustration event:
- ${locationLabel}: ${event.currentUrl}${event.screenName ? ` (${event.screenName})` : ''}
- Signals: ${signals}
- ${snapshotLabel}: ${event.domSnapshot}
- Documentation search: ${config.openaiApiKey ? 'available (call search_docs)' : 'not configured'}

Available functional map (${entries.length} entries):
${JSON.stringify(entries, null, 2)}

Determine the best intervention now.`;
}


const FALLBACK: InterventionCommand = {
  action: 'message_only',
  message: "It looks like you might be stuck — can I help you find what you're looking for?",
  confidence: 0.4,
};

/**
 * Runs a Plan-Act-Observe loop using Claude tool use to determine the best intervention.
 * The loop continues until Claude calls an intervention tool (highlight_element,
 * deep_link, or show_message), or until a safety limit of 5 iterations is reached.
 */
export async function runInterventionAgent(
  event: FrustrationEvent,
  entries: FunctionalMapEntry[],
  model: string,
  platform: Platform = 'web',
): Promise<InterventionCommand> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const toolDefs = getToolDefinitions(platform);

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: buildUserMessage(event, entries, platform) },
  ];

  const MAX_ITERATIONS = 5;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: getSystemPrompt(platform),
      tools: toolDefs,
      messages,
    });

    // Add the assistant's response to the conversation
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      // Claude responded without calling a tool — unexpected but handle gracefully
      return FALLBACK;
    }

    if (response.stop_reason !== 'tool_use') {
      return FALLBACK;
    }

    // Process all tool calls in this response
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let interventionCommand: InterventionCommand | null = null;

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      const toolName = block.name as string;
      const input = block.input as Record<string, unknown>;

      if (INTERVENTION_TOOLS.has(toolName as 'highlight_element' | 'deep_link' | 'show_message' | 'create_tour')) {
        // This is a terminal tool — capture the intervention
        interventionCommand = parseIntervention(toolName, input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: 'Intervention delivered.',
        });
      } else if (toolName === 'lookup_functional_map') {
        const result = executeLookup(input as { query: string }, entries);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      } else if (toolName === 'search_docs') {
        const result = await executeSearchDocs(input as { query: string }, event.tenantId);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      } else if (toolName === 'search_workflows') {
        const result = await executeSearchWorkflows(input as { query: string; current_url?: string }, event.tenantId);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      } else if (toolName === 'submit_feedback') {
        const result = await executeSubmitFeedback(input as { type: string; title: string; description: string }, event.tenantId);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      }
    }

    // If an intervention tool was called, we're done
    if (interventionCommand) {
      return interventionCommand;
    }

    // Otherwise, add tool results and continue the loop
    messages.push({ role: 'user', content: toolResults });
  }

  return FALLBACK;
}
