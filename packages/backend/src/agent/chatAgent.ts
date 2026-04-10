// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import Anthropic from '@anthropic-ai/sdk';
import type { FunctionalMapEntry, InterventionCommand, Platform } from '@opentam/shared';
import { config } from '../config.js';
import { getStore } from '../db/index.js';
import { getToolDefinitions, executeLookup, executeSearchDocs, executeSearchWorkflows, executeSubmitFeedback, parseIntervention } from './tools.js';
import { runChatAgentOpenAI } from './chatAgentOpenAI.js';

const INTERVENTION_TOOL_NAMES = new Set(['highlight_element', 'deep_link', 'show_message', 'create_tour']);

const WEB_CHAT_SYSTEM_PROMPT = `You are Q, a guidance assistant embedded in a web application.
Your ONLY purpose is to help users navigate and use THIS application. You answer questions about the product's features, UI, and workflows.

STRICT SCOPE — you MUST refuse any request that falls outside product guidance and feedback:
- Do NOT write code, scripts, queries, or any programming content.
- Do NOT answer general knowledge questions, math, trivia, or anything unrelated to the product.
- Do NOT act as a general-purpose AI assistant.
- If a request is out of scope, reply: "I can only help with navigating and using this application. What can I help you find?"

You can also help users submit feedback:
- Use submit_feedback when a user wants to report a bug, request a feature, or share positive feedback.
- Ask clarifying questions to form a clear title and description before submitting.
- After submitting, confirm to the user that their feedback was recorded.

Answer the user's question using search_docs, lookup_functional_map, and search_workflows as needed.
Be concise: 1-3 sentences max.
No filler phrases. No "certainly" or "of course".

Guidance rules:
- ONLY use selectors from the "Selector reference" provided in the user message. NEVER invent or guess CSS selectors. If no selector matches, use show_message.
- Always prefer the MOST SPECIFIC entry. For example, for LLM settings use "Settings > Model" (a[aria-label="Navigate to Model"]), NOT the generic "Settings" (a[href="/settings"]).
- **Proactive guidance**: If the user's question implies they want to find, configure, or navigate to a feature, ALWAYS provide navigation guidance (tour or highlight) alongside your text answer. Don't just describe where it is — show them.
- **2+ clicks = tour**: If reaching the destination requires 2+ clicks (e.g., sidebar → sub-tab like Settings → Model), ALWAYS use create_tour. Step 1 selector = sidebar nav link. Step 2 selector = the sub-tab/element on that page. Both selectors MUST come from the selector reference.
- Use highlight_element ONLY when the target is reachable with a single click (e.g., a sidebar link that IS the final destination).
- Use search_workflows for multi-step tasks. Prefer workflow-based tours when a published workflow matches.
- Use deep_link only for single-page navigation when there is no nav element to highlight.
- Never combine highlight_element and deep_link for the same feature.`;

const IOS_CHAT_SYSTEM_PROMPT = `You are Q, a guidance assistant embedded in an iOS application.
Your ONLY purpose is to help users navigate and use THIS application. You answer questions about the product's features, UI, and workflows.

STRICT SCOPE — you MUST refuse any request that falls outside product guidance and feedback:
- Do NOT write code, scripts, queries, or any programming content.
- Do NOT answer general knowledge questions, math, trivia, or anything unrelated to the product.
- Do NOT act as a general-purpose AI assistant.
- If a request is out of scope, reply: "I can only help with navigating and using this application. What can I help you find?"

You can also help users submit feedback:
- Use submit_feedback when a user wants to report a bug, request a feature, or share positive feedback.
- Ask clarifying questions to form a clear title and description before submitting.
- After submitting, confirm to the user that their feedback was recorded.

Answer the user's question using search_docs, lookup_functional_map, and search_workflows as needed.
Be concise: 1-3 sentences max.
No filler phrases. No "certainly" or "of course".

Guidance rules:
- ONLY use identifiers from the "Selector reference" provided in the user message. NEVER invent or guess accessibility identifiers. If no identifier matches, use show_message.
- Selector reference format: Feature → accessibilityId (screen: route)
- Always prefer the MOST SPECIFIC entry.
- **Proactive guidance**: If the user's question implies they want to find, configure, or navigate to a feature, ALWAYS provide navigation guidance (tour or highlight) alongside your text answer.
- **2+ taps = tour**: If reaching the destination requires navigating through multiple screens, ALWAYS use create_tour.
- Use highlight_element ONLY when the target is on the current screen.
- Use search_workflows for multi-step tasks. Prefer workflow-based tours when a published workflow matches.
- Use deep_link when the user needs to navigate to a different screen entirely.
- Never combine highlight_element and deep_link for the same feature.`;

const ANDROID_CHAT_SYSTEM_PROMPT = `You are Q, a guidance assistant embedded in an Android application.
Your ONLY purpose is to help users navigate and use THIS application. You answer questions about the product's features, UI, and workflows.

STRICT SCOPE — you MUST refuse any request that falls outside product guidance and feedback:
- Do NOT write code, scripts, queries, or any programming content.
- Do NOT answer general knowledge questions, math, trivia, or anything unrelated to the product.
- Do NOT act as a general-purpose AI assistant.
- If a request is out of scope, reply: "I can only help with navigating and using this application. What can I help you find?"

You can also help users submit feedback:
- Use submit_feedback when a user wants to report a bug, request a feature, or share positive feedback.
- Ask clarifying questions to form a clear title and description before submitting.
- After submitting, confirm to the user that their feedback was recorded.

Answer the user's question using search_docs, lookup_functional_map, and search_workflows as needed.
Be concise: 1-3 sentences max.
No filler phrases. No "certainly" or "of course".

Guidance rules:
- ONLY use identifiers from the "Selector reference" provided in the user message. NEVER invent or guess view IDs or content descriptions. If no identifier matches, use show_message.
- Selector reference format: Feature → contentDescription:id (screen: destination)
- Always prefer the MOST SPECIFIC entry.
- **Proactive guidance**: If the user's question implies they want to find, configure, or navigate to a feature, ALWAYS provide navigation guidance (tour or highlight) alongside your text answer.
- **2+ taps = tour**: If reaching the destination requires navigating through multiple screens, ALWAYS use create_tour.
- Use highlight_element ONLY when the target is on the current screen.
- Use search_workflows for multi-step tasks. Prefer workflow-based tours when a published workflow matches.
- Use deep_link when the user needs to navigate to a different screen entirely.
- Never combine highlight_element and deep_link for the same feature.`;

function getChatSystemPrompt(platform: Platform): string {
  switch (platform) {
    case 'ios': return IOS_CHAT_SYSTEM_PROMPT;
    case 'android': return ANDROID_CHAT_SYSTEM_PROMPT;
    default: return WEB_CHAT_SYSTEM_PROMPT;
  }
}

export async function runChatAgent(
  message: string,
  tenantId: string,
  currentUrl: string,
  entries: FunctionalMapEntry[],
  model: string,
  history?: { role: 'user' | 'assistant'; content: string }[],
  platform: Platform = 'web',
  domSnapshot?: string,
): Promise<{ reply: string; intervention?: InterventionCommand }> {
  // Resolve per-tenant provider config
  const store = getStore();
  const tenantSettings = await store.getTenantSettings(tenantId);
  const provider = tenantSettings?.llmProvider ?? config.llmProvider;
  const resolvedModel = tenantSettings?.llmModel ?? model;

  // Gemini
  if (provider === 'gemini') {
    const geminiModel = resolvedModel.startsWith('claude') ? config.geminiModel : resolvedModel;
    return runChatAgentOpenAI(message, tenantId, currentUrl, entries, geminiModel, {
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      apiKey: tenantSettings?.llmApiKey ?? config.geminiApiKey,
    }, history, platform, domSnapshot);
  }

  // OpenAI-compatible (also handles 'minimax' which uses the same OpenAI-compatible path)
  if (provider === 'openai' || provider === 'minimax') {
    const openaiModel = resolvedModel.startsWith('claude') ? config.llmModel : resolvedModel;
    return runChatAgentOpenAI(message, tenantId, currentUrl, entries, openaiModel, {
      baseURL: tenantSettings?.llmBaseUrl ?? config.llmBaseUrl,
      apiKey: tenantSettings?.llmApiKey ?? config.llmApiKey,
    }, history, platform, domSnapshot);
  }

  // Anthropic (default)
  const client = new Anthropic({ apiKey: tenantSettings?.llmApiKey ?? config.anthropicApiKey });
  const toolDefs = getToolDefinitions(platform);
  const isWeb = platform === 'web';

  // Build compact selector reference — format varies by platform
  const selectorRef = entries
    .map(e => {
      if (platform === 'ios') return `${e.feature} → ${e.selector} (screen: ${e.url})`;
      if (platform === 'android') return `${e.feature} → ${e.selector} (screen: ${e.url})`;
      return `${e.feature} → ${e.selector} (${e.url})`;
    })
    .join('\n');

  const selectorLabel = isWeb ? 'selectors' : (platform === 'ios' ? 'accessibility identifiers' : 'view IDs / content descriptions');
  const locationLabel = isWeb ? 'User is currently on' : 'User is currently on screen';

  let contextMsg = `${locationLabel}: ${currentUrl}

Selector reference (use ONLY these ${selectorLabel} — never invent ${selectorLabel}):
${selectorRef}

User question: ${message}`;

  // Include view hierarchy / DOM snapshot if provided
  if (domSnapshot) {
    const snapshotLabel = isWeb ? 'DOM snapshot' : 'View hierarchy';
    contextMsg += `\n\n${snapshotLabel}:\n${domSnapshot}`;
  }

  // Build messages with conversation history for multi-turn context
  const messages: Anthropic.MessageParam[] = [];
  if (history && history.length > 0) {
    // Include up to last 10 turns to stay within token limits
    const recentHistory = history.slice(-10);
    for (const turn of recentHistory) {
      messages.push({ role: turn.role, content: turn.content });
    }
  }
  messages.push({ role: 'user', content: contextMsg });

  const MAX_ITERATIONS = 6;
  let reply = '';
  let intervention: InterventionCommand | undefined;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: resolvedModel,
      max_tokens: 512,
      system: getChatSystemPrompt(platform),
      tools: toolDefs,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        reply = block.text.trim();
      }
    }

    if (response.stop_reason === 'end_turn') break;
    if (response.stop_reason !== 'tool_use') break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const input = block.input as Record<string, unknown>;

      if (block.name === 'search_docs') {
        const result = await executeSearchDocs(input as { query: string }, tenantId);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      } else if (block.name === 'search_workflows') {
        const result = await executeSearchWorkflows(input as { query: string; current_url?: string }, tenantId);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      } else if (block.name === 'lookup_functional_map') {
        const result = executeLookup(input as { query: string }, entries);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      } else if (block.name === 'submit_feedback') {
        const result = await executeSubmitFeedback(input as { type: string; title: string; description: string }, tenantId);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      } else if (INTERVENTION_TOOL_NAMES.has(block.name)) {
        if (!intervention) {
          intervention = parseIntervention(block.name, input);
        }
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Guidance queued.' });
      }
    }

    messages.push({ role: 'user', content: toolResults });
  }

  return {
    reply: reply || "I couldn't find a specific answer. Could you give me more details?",
    intervention,
  };
}
