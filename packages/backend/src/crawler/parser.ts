// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { parse } from '@babel/parser';
import type { Node, File, JSXElement, JSXOpeningElement, JSXAttribute, JSXIdentifier, JSXMemberExpression, StringLiteral, JSXText, JSXExpressionContainer } from '@babel/types';

export interface ExtractedElement {
  type: 'button' | 'link' | 'input' | 'form' | 'component';
  label?: string;
  selector?: string;
  href?: string;
  filePath: string;
  componentName?: string;
}

// --- Attribute helpers ---

function getAttrValue(attrs: JSXAttribute[], name: string): string | undefined {
  for (const attr of attrs) {
    if (attr.type !== 'JSXAttribute') continue;
    if (attr.name.type !== 'JSXIdentifier') continue;
    if (attr.name.name !== name) continue;

    if (!attr.value) return undefined;

    if (attr.value.type === 'StringLiteral') {
      return attr.value.value;
    }
    if (attr.value.type === 'JSXExpressionContainer') {
      const expr = attr.value.expression;
      if (expr.type === 'StringLiteral') return expr.value;
    }
  }
  return undefined;
}

function getJsxAttrs(opening: JSXOpeningElement): JSXAttribute[] {
  return opening.attributes.filter((a): a is JSXAttribute => a.type === 'JSXAttribute');
}

function getJsxElementName(opening: JSXOpeningElement): string {
  const name = opening.name;
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression') {
    return `${(name.object as JSXIdentifier).name}.${name.property.name}`;
  }
  return '';
}

// --- Text extraction from JSX children ---

function extractTextFromChildren(element: JSXElement): string {
  const parts: string[] = [];

  for (const child of element.children) {
    if (child.type === 'JSXText') {
      const trimmed = child.value.replace(/\s+/g, ' ').trim();
      if (trimmed) parts.push(trimmed);
    } else if (child.type === 'JSXExpressionContainer') {
      if (child.expression.type === 'StringLiteral') {
        parts.push(child.expression.value);
      }
    } else if (child.type === 'JSXElement') {
      // Recurse into child elements (e.g. <button><span>Click me</span></button>)
      const nested = extractTextFromChildren(child);
      if (nested) parts.push(nested);
    }
  }

  return parts.join(' ').trim();
}

// --- AST walker ---

interface WalkerContext {
  filePath: string;
  elements: ExtractedElement[];
  currentComponent: string | undefined;
}

function visitNode(node: Node | null | undefined, ctx: WalkerContext): void {
  if (!node || typeof node !== 'object') return;

  switch (node.type) {
    case 'File': {
      visitNode(node.program, ctx);
      break;
    }

    case 'Program': {
      for (const stmt of node.body) {
        visitNode(stmt, ctx);
      }
      break;
    }

    case 'ExportDefaultDeclaration':
    case 'ExportNamedDeclaration': {
      visitNode(node.declaration ?? null, ctx);
      break;
    }

    case 'FunctionDeclaration': {
      const prevComponent = ctx.currentComponent;
      if (node.id?.name) {
        ctx.currentComponent = node.id.name;
      }
      visitNode(node.body, ctx);
      ctx.currentComponent = prevComponent;
      break;
    }

    case 'VariableDeclaration': {
      for (const decl of node.declarations) {
        visitNode(decl, ctx);
      }
      break;
    }

    case 'VariableDeclarator': {
      const prevComponent = ctx.currentComponent;
      if (node.id.type === 'Identifier') {
        ctx.currentComponent = node.id.name;
      }
      visitNode(node.init ?? null, ctx);
      ctx.currentComponent = prevComponent;
      break;
    }

    case 'ArrowFunctionExpression':
    case 'FunctionExpression': {
      visitNode(node.body, ctx);
      break;
    }

    case 'BlockStatement': {
      for (const stmt of node.body) {
        visitNode(stmt, ctx);
      }
      break;
    }

    case 'ReturnStatement': {
      visitNode(node.argument ?? null, ctx);
      break;
    }

    case 'JSXElement': {
      visitJsxElement(node, ctx);
      // Recurse into children
      for (const child of node.children) {
        visitNode(child, ctx);
      }
      break;
    }

    case 'JSXFragment': {
      for (const child of node.children) {
        visitNode(child, ctx);
      }
      break;
    }

    case 'ExpressionStatement': {
      visitNode(node.expression, ctx);
      break;
    }

    case 'CallExpression': {
      // Handle immediately invoked functions or helper calls that return JSX
      visitNode(node.callee, ctx);
      for (const arg of node.arguments) {
        visitNode(arg as Node, ctx);
      }
      break;
    }

    case 'ConditionalExpression': {
      visitNode(node.consequent, ctx);
      visitNode(node.alternate, ctx);
      break;
    }

    case 'LogicalExpression': {
      visitNode(node.left, ctx);
      visitNode(node.right, ctx);
      break;
    }

    default:
      break;
  }
}

function visitJsxElement(element: JSXElement, ctx: WalkerContext): void {
  const opening = element.openingElement;
  const tagName = getJsxElementName(opening);
  const attrs = getJsxAttrs(opening);

  const lowerTag = tagName.toLowerCase();

  if (lowerTag === 'button' || tagName === 'Button') {
    const label =
      extractTextFromChildren(element) ||
      getAttrValue(attrs, 'aria-label') ||
      getAttrValue(attrs, 'data-testid');

    if (!label && !getAttrValue(attrs, 'id') && !getAttrValue(attrs, 'data-testid')) {
      return; // nothing useful
    }

    const testId = getAttrValue(attrs, 'data-testid');
    const id = getAttrValue(attrs, 'id');
    const selector = testId
      ? `[data-testid="${testId}"]`
      : id
      ? `#${id}`
      : undefined;

    ctx.elements.push({
      type: 'button',
      label: label || undefined,
      selector,
      filePath: ctx.filePath,
      componentName: ctx.currentComponent,
    });
  } else if (lowerTag === 'a' || tagName === 'Link') {
    const href =
      getAttrValue(attrs, 'href') || getAttrValue(attrs, 'to');

    const label = extractTextFromChildren(element) || getAttrValue(attrs, 'aria-label');

    if (!href && !label) return;

    ctx.elements.push({
      type: 'link',
      label: label || undefined,
      href: href || undefined,
      filePath: ctx.filePath,
      componentName: ctx.currentComponent,
    });
  } else if (lowerTag === 'input' || lowerTag === 'textarea') {
    const id = getAttrValue(attrs, 'id');
    const testId = getAttrValue(attrs, 'data-testid');
    const placeholder = getAttrValue(attrs, 'placeholder');
    const ariaLabel = getAttrValue(attrs, 'aria-label');
    const name = getAttrValue(attrs, 'name');

    const selector = id
      ? `#${id}`
      : testId
      ? `[data-testid="${testId}"]`
      : name
      ? `[name="${name}"]`
      : undefined;

    const label = placeholder || ariaLabel || name;

    if (!selector && !label) return;

    ctx.elements.push({
      type: 'input',
      label: label || undefined,
      selector,
      filePath: ctx.filePath,
      componentName: ctx.currentComponent,
    });
  } else if (lowerTag === 'form') {
    const id = getAttrValue(attrs, 'id');
    const testId = getAttrValue(attrs, 'data-testid');

    if (!id && !testId) return;

    const selector = id ? `#${id}` : `[data-testid="${testId}"]`;

    ctx.elements.push({
      type: 'form',
      selector,
      filePath: ctx.filePath,
      componentName: ctx.currentComponent,
    });
  }
}

export function extractUiElements(code: string, filePath: string): ExtractedElement[] {
  let ast: File;

  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true,
    });
  } catch {
    // If parsing fails, return empty
    return [];
  }

  const ctx: WalkerContext = {
    filePath,
    elements: [],
    currentComponent: undefined,
  };

  visitNode(ast, ctx);

  return ctx.elements;
}
