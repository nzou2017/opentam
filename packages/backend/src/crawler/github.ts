// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

export interface GitHubFile {
  path: string;
  content: string; // decoded from base64
}

interface GitHubTreeItem {
  path: string;
  type: string;
  sha: string;
  url: string;
}

interface GitHubTreeResponse {
  tree: GitHubTreeItem[];
  truncated: boolean;
}

interface GitHubBlobResponse {
  content: string;
  encoding: string;
}

const MAX_FILES = 80;
const MAX_DOC_FILES = 50;
const FETCH_DELAY_MS = 50;

const UI_EXTENSIONS = ['.tsx', '.jsx'];
const DOC_EXTENSIONS = ['.md', '.mdx'];
const SKIP_PATTERNS = ['.test.', '.spec.', '.stories.'];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHeaders(accessToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (accessToken) {
    headers['Authorization'] = `token ${accessToken}`;
  }
  return headers;
}

function isUiFile(path: string, srcPath: string): boolean {
  const hasUiExt = UI_EXTENSIONS.some((ext) => path.endsWith(ext));
  if (!hasUiExt) return false;

  const hasSkipPattern = SKIP_PATTERNS.some((pat) => path.includes(pat));
  if (hasSkipPattern) return false;

  return path.startsWith(srcPath + '/') || path.startsWith(srcPath);
}

function isDocFile(path: string): boolean {
  return DOC_EXTENSIONS.some((ext) => path.endsWith(ext));
}

/**
 * Parse a GitHub URL like:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/main/src
 *   https://github.com/owner/repo/tree/main
 */
export function parseGitHubUrl(url: string): {
  owner: string;
  repo: string;
  branch: string;
  srcPath: string;
} {
  const clean = url.replace(/\/$/, '');
  const match = clean.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)(?:\/(.+))?)?/,
  );

  if (!match) {
    throw new Error(`Cannot parse GitHub URL: ${url}`);
  }

  const owner = match[1];
  const repo = match[2];
  const branch = match[3] ?? 'main';
  const srcPath = match[4] ?? 'src';

  return { owner, repo, branch, srcPath };
}

async function fetchBlob(item: GitHubTreeItem, headers: Record<string, string>): Promise<GitHubFile | null> {
  const blobRes = await fetch(item.url, { headers });

  if (blobRes.status === 403) return null; // Rate limited
  if (!blobRes.ok) return null;

  const blob = (await blobRes.json()) as GitHubBlobResponse;
  if (blob.encoding !== 'base64') return null;

  const decoded = Buffer.from(blob.content.replace(/\n/g, ''), 'base64').toString('utf-8');
  return { path: item.path, content: decoded };
}

/**
 * Fetch the file tree for a repo and return decoded content for UI and doc files.
 */
export async function fetchRepoFiles(
  owner: string,
  repo: string,
  branch: string,
  accessToken?: string,
  srcPath = 'src',
): Promise<{ uiFiles: GitHubFile[]; docFiles: GitHubFile[] }> {
  const headers = buildHeaders(accessToken);

  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const treeRes = await fetch(treeUrl, { headers });

  if (treeRes.status === 403) {
    throw new Error(`GitHub API rate limit or access denied (403) for ${owner}/${repo}`);
  }
  if (treeRes.status === 404) {
    throw new Error(`Repository or branch not found (404): ${owner}/${repo}@${branch}`);
  }
  if (!treeRes.ok) {
    throw new Error(`GitHub API error ${treeRes.status}: ${treeRes.statusText}`);
  }

  const treeData = (await treeRes.json()) as GitHubTreeResponse;

  // Filter to UI-relevant files
  const uiItems = treeData.tree
    .filter((item) => item.type === 'blob' && isUiFile(item.path, srcPath))
    .slice(0, MAX_FILES);

  // Filter to doc files
  const docItems = treeData.tree
    .filter((item) => item.type === 'blob' && isDocFile(item.path))
    .slice(0, MAX_DOC_FILES);

  const uiFiles: GitHubFile[] = [];
  const docFiles: GitHubFile[] = [];

  // Fetch UI files
  for (const item of uiItems) {
    await sleep(FETCH_DELAY_MS);
    const file = await fetchBlob(item, headers);
    if (file) uiFiles.push(file);
    else if (!file && uiItems.indexOf(item) === uiItems.length - 1) break; // Rate limited
  }

  // Fetch doc files
  for (const item of docItems) {
    await sleep(FETCH_DELAY_MS);
    const file = await fetchBlob(item, headers);
    if (file) docFiles.push(file);
  }

  return { uiFiles, docFiles };
}
