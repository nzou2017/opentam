#!/usr/bin/env node
// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as client from './client.js';

const server = new McpServer({ name: 'Q', version: '1.0.0' });

// Tool 1: crawl_repository
server.tool(
  'crawl_repository',
  'Crawl a GitHub repository to extract UI elements and add them to OpenTAM\'s functional map',
  {
    repoUrl: z.string().describe('GitHub repository URL, e.g. https://github.com/owner/repo'),
    accessToken: z.string().optional().describe('GitHub personal access token for private repos'),
    branch: z.string().optional().describe('Branch to crawl (default: main)'),
    autoApply: z.boolean().optional().describe('If true, immediately save candidates to the functional map'),
  },
  async ({ repoUrl, accessToken, branch, autoApply }) => {
    try {
      const result = await client.crawlRepo({ repoUrl, accessToken, branch, autoApply });
      const text = [
        `Crawl complete for ${repoUrl}`,
        `Files processed: ${result.filesProcessed}`,
        `UI elements found: ${result.elementsFound}`,
        `Map candidates: ${result.candidates.length}`,
        `Applied to map: ${result.applied}`,
      ].join('\n');
      return { content: [{ type: 'text', text }] };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  },
);

// Tool 2: ingest_document
server.tool(
  'ingest_document',
  "Ingest a URL or text document into OpenTAM's knowledge base for RAG",
  {
    type: z.enum(['url', 'text']).describe("Ingestion type: 'url' to fetch a URL, 'text' to provide raw content"),
    url: z.string().optional().describe('URL to fetch and ingest (required when type=url)'),
    docId: z.string().optional().describe('Document identifier (required when type=text)'),
    text: z.string().optional().describe('Raw document text/markdown/html (required when type=text)'),
    mimeType: z
      .enum(['text/markdown', 'text/html', 'text/plain'])
      .optional()
      .describe('Content MIME type (required when type=text)'),
  },
  async ({ type, url, docId, text, mimeType }) => {
    try {
      if (type === 'url') {
        if (!url) {
          return { content: [{ type: 'text', text: 'Error: url is required when type=url' }], isError: true };
        }
        const result = await client.ingestUrl(url);
        return {
          content: [
            { type: 'text', text: `Ingested URL: ${url}\nDoc ID: ${result.docId}\nChunks: ${result.chunks}` },
          ],
        };
      } else {
        if (!docId || !text || !mimeType) {
          return {
            content: [{ type: 'text', text: 'Error: docId, text, and mimeType are required when type=text' }],
            isError: true,
          };
        }
        const result = await client.ingestText(docId, text, mimeType);
        return {
          content: [{ type: 'text', text: `Ingested text doc: ${docId}\nChunks: ${result.chunks}` }],
        };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  },
);

// Tool 3: search_documentation
server.tool(
  'search_documentation',
  "Search OpenTAM's ingested documentation for answers",
  {
    query: z.string().describe('Natural language question to search documentation'),
  },
  async ({ query }) => {
    try {
      const results = await client.searchDocs(query);
      return { content: [{ type: 'text', text: results }] };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  },
);

// Tool 4: add_map_entry
server.tool(
  'add_map_entry',
  "Manually add a feature → selector mapping to OpenTAM's functional map",
  {
    feature: z.string().describe('Feature name, e.g. "Create Project"'),
    url: z.string().describe('Page URL path where this feature lives, e.g. "/dashboard"'),
    selector: z.string().describe('CSS selector for the UI element, e.g. "#create-project-btn"'),
    description: z.string().describe('Human-readable description of what this element does'),
    preconditions: z.array(z.string()).optional().describe('Optional list of preconditions'),
  },
  async ({ feature, url, selector, description, preconditions }) => {
    try {
      const entry = await client.addMapEntry({
        feature,
        url,
        selector,
        description,
        preconditions,
        source: 'manual',
      });
      return {
        content: [
          {
            type: 'text',
            text: `Added map entry:\nID: ${entry.id}\nFeature: ${entry.feature}\nURL: ${entry.url}\nSelector: ${entry.selector}`,
          },
        ],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  },
);

// Tool 5: list_map_entries
server.tool(
  'list_map_entries',
  'List all current functional map entries',
  {},
  async () => {
    try {
      const entries = await client.getMapEntries();
      if (entries.length === 0) {
        return { content: [{ type: 'text', text: 'No functional map entries found.' }] };
      }
      const text = entries
        .map(
          (e, i) =>
            `${i + 1}. [${e.id}] ${e.feature}\n   URL: ${e.url}\n   Selector: ${e.selector}\n   Source: ${e.source}\n   ${e.description}`,
        )
        .join('\n\n');
      return { content: [{ type: 'text', text: `Functional Map Entries (${entries.length}):\n\n${text}` }] };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
