// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { ExtractedElement } from './parser.js';

// No Swift toolchain in the Docker image, so this is regex/heuristic
// pattern matching over the source text rather than a real AST walk —
// deliberately approximate. It looks for the handful of SwiftUI view
// constructors that map onto interactive UI (Button, NavigationLink,
// TextField/SecureField, Toggle) and, near each match, for an
// `.accessibilityIdentifier(...)`/`.accessibilityLabel(...)` modifier —
// XCUITest's lookup mechanism, the mobile analog of a CSS selector /
// data-testid.

const STRUCT_RE = /\bstruct\s+(\w+)\s*:\s*[^{]*\bView\b/g;

const CONSTRUCTOR_RE =
  /\b(Button|NavigationLink|TextField|SecureField|Toggle)\s*\(\s*(?:"([^"]*)")?/g;

// How far past a constructor's opening paren to look for its label (via a
// nested Text("...")) and any accessibility modifiers chained onto it.
// SwiftUI view bodies are usually short; this comfortably covers a
// multi-line trailing-closure form without spilling into unrelated code.
const LOOKAHEAD_CHARS = 400;

function typeForConstructor(name: string): ExtractedElement['type'] {
  switch (name) {
    case 'Button': return 'button';
    case 'NavigationLink': return 'link';
    case 'TextField':
    case 'SecureField': return 'input';
    case 'Toggle': return 'toggle';
    default: return 'component';
  }
}

function findComponentName(offset: number, structs: { name: string; index: number }[]): string | undefined {
  let current: string | undefined;
  for (const s of structs) {
    if (s.index > offset) break;
    current = s.name;
  }
  return current;
}

export function extractSwiftUiElements(code: string, filePath: string): ExtractedElement[] {
  const structs: { name: string; index: number }[] = [];
  for (const m of code.matchAll(STRUCT_RE)) {
    structs.push({ name: m[1], index: m.index ?? 0 });
  }

  const elements: ExtractedElement[] = [];

  for (const m of code.matchAll(CONSTRUCTOR_RE)) {
    const constructorName = m[1];
    const inlineLabel = m[2];
    const matchEnd = (m.index ?? 0) + m[0].length;
    const window = code.slice(matchEnd, matchEnd + LOOKAHEAD_CHARS);

    const label = inlineLabel || window.match(/\bText\s*\(\s*"([^"]*)"/)?.[1];
    const accessibilityId = window.match(/\.accessibilityIdentifier\s*\(\s*"([^"]*)"/)?.[1];
    const accessibilityLabel = window.match(/\.accessibilityLabel\s*\(\s*"([^"]*)"/)?.[1];

    const finalLabel = accessibilityLabel || label;
    if (!finalLabel && !accessibilityId) continue; // nothing useful to surface

    elements.push({
      type: typeForConstructor(constructorName),
      label: finalLabel || undefined,
      selector: accessibilityId,
      filePath,
      componentName: findComponentName(m.index ?? 0, structs),
    });
  }

  return elements;
}
