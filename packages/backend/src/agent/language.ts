// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Multilingual support for the chat agent.
 *
 * End users may write in any language, but a tenant's knowledge base (docs,
 * workflows, feature/selector names) is typically ingested in a single
 * language. If the agent searched in the user's language it would miss the
 * indexed content and wrongly fall back to the out-of-scope reply. So we tell
 * the agent to translate its *search queries* into the knowledge-base language
 * while still replying to the user in the user's own language.
 */

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  zh: 'Chinese',
  'zh-cn': 'Chinese (Simplified)',
  'zh-tw': 'Chinese (Traditional)',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  ko: 'Korean',
  pt: 'Portuguese',
  'pt-br': 'Portuguese (Brazil)',
  it: 'Italian',
  ru: 'Russian',
  ar: 'Arabic',
  hi: 'Hindi',
  nl: 'Dutch',
  pl: 'Polish',
  tr: 'Turkish',
  vi: 'Vietnamese',
  id: 'Indonesian',
};

export const DEFAULT_KB_LANGUAGE = 'English';

/**
 * Resolve a configured knowledge-base language (a code like `es` / `zh-CN`, or
 * a plain name like `Spanish`) to a human-readable name for the prompt.
 * Falls back to English when unset.
 */
export function resolveKbLanguageName(configured?: string | null): string {
  const raw = configured?.trim();
  if (!raw) return DEFAULT_KB_LANGUAGE;
  return LANGUAGE_NAMES[raw.toLowerCase()] ?? raw;
}

/**
 * A directive appended to the chat system prompt that makes the agent
 * language-aware: reply in the user's language, but search and file feedback
 * in the knowledge-base language.
 */
export function buildMultilingualDirective(kbLanguageName: string): string {
  return `

LANGUAGE (multilingual support):
- The user may write in ANY language. Detect the language of the user's latest message and write your ENTIRE user-facing reply in that same language — including follow-up questions, the out-of-scope sentence, and every \`message\` you pass to a tool (show_message, highlight_element, deep_link, create_tour).
- The knowledge base — ingested docs, workflows, and feature/selector names — is written in ${kbLanguageName}. Whenever you call search_docs, search_workflows, or lookup_functional_map, write the \`query\` argument in ${kbLanguageName} (translate the user's request as needed) so it matches the indexed content. Do not search in the user's language when it differs from ${kbLanguageName}.
- A product question is IN SCOPE no matter what language it is written in. NEVER use the out-of-scope reply merely because a message is not in ${kbLanguageName} — only genuine non-product requests are out of scope.
- When filing feedback with submit_feedback, write \`title\` and \`description\` in ${kbLanguageName} so the product team reads them consistently, then confirm to the user in the user's own language.`;
}
