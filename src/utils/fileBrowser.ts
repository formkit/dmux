import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { highlight } from 'cli-highlight';

export type BrowserSortMode = 'name' | 'modified' | 'status';
export type BrowserFilterMode = 'all' | 'diffed';
export type BrowserNodeType = 'file' | 'directory';

export interface BrowserFileRecord {
  path: string;
  name: string;
  parentPath: string | null;
  exists: boolean;
  changed: boolean;
  statusCode: string;
  statusLabel: string;
}

export interface BrowserSnapshot {
  rootPath: string;
  files: BrowserFileRecord[];
}

export interface BrowserTreeNode {
  path: string;
  name: string;
  parentPath: string | null;
  type: BrowserNodeType;
  exists: boolean;
  changed: boolean;
  statusLabel: string;
  sortModifiedAt: number;
  children: BrowserTreeNode[];
}

export interface BrowserVisibleEntry {
  path: string;
  name: string;
  parentPath: string | null;
  type: BrowserNodeType;
  exists: boolean;
  changed: boolean;
  statusLabel: string;
  isExpanded: boolean;
  displayLabel: string;
}

export interface BrowserTreeOptions {
  sortMode: BrowserSortMode;
  filterMode: BrowserFilterMode;
  modifiedTimes?: Map<string, number>;
  filterQuery?: string;
  activePath?: string | null;
}

interface FlattenBrowserTreeOptions {
  forceExpandDirectories?: boolean;
}

interface BrowserSearchEntryRecord {
  path: string;
  name: string;
  parentPath: string | null;
  type: BrowserNodeType;
  exists: boolean;
  changed: boolean;
  statusLabel: string;
  sortModifiedAt: number;
}

const MAX_GIT_BUFFER = 16 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 200_000;
const DEPENDENCY_DIR_NAMES = new Set([
  'node_modules',
  'vendor',
  '.pnpm',
  '.pnpm-store',
  '.yarn',
  'bower_components',
]);

const STATUS_RANK: Record<string, number> = {
  U: 100,
  D: 90,
  R: 80,
  C: 75,
  A: 70,
  M: 60,
  T: 50,
  '??': 65,
  '!!': 10,
  '': 0,
};

function runGitText(
  rootPath: string,
  args: string[],
  options?: { allowFailure?: boolean }
): string {
  const result = spawnSync('git', args, {
    cwd: rootPath,
    encoding: 'utf-8',
    maxBuffer: MAX_GIT_BUFFER,
  });

  if (result.status === 0) {
    return result.stdout || '';
  }

  if (options?.allowFailure) {
    return result.stdout || '';
  }

  throw new Error(result.stderr || `git ${args.join(' ')} failed`);
}

function decodeGitPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }

  return trimmed;
}

function normalizeStatusLabel(rawCode: string): string {
  const trimmed = rawCode.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed === '??' || trimmed === '!!') {
    return trimmed;
  }

  const compact = rawCode.replace(/\s/g, '');
  return compact.slice(0, 2);
}

function getStatusRank(label: string): number {
  if (!label) {
    return 0;
  }

  if (label === '??' || label === '!!') {
    return STATUS_RANK[label];
  }

  return label
    .split('')
    .reduce((highest, code) => Math.max(highest, STATUS_RANK[code] || 0), 0);
}

function pickDominantStatus(labels: string[]): string {
  let best = '';
  let bestRank = 0;

  for (const label of labels) {
    const rank = getStatusRank(label);
    if (rank > bestRank) {
      best = label;
      bestRank = rank;
    }
  }

  return best;
}

function hasDependencySegment(relativePath: string): boolean {
  return relativePath
    .split('/')
    .some((segment) => DEPENDENCY_DIR_NAMES.has(segment));
}

function shouldIncludeDependencyPaths(
  filterQuery?: string,
  activePath?: string | null
): boolean {
  const normalizedQuery = (filterQuery || '').toLowerCase();
  if (
    normalizedQuery
    && Array.from(DEPENDENCY_DIR_NAMES).some((name) => normalizedQuery.includes(name.toLowerCase()))
  ) {
    return true;
  }

  return !!activePath && hasDependencySegment(activePath);
}

function parseGitStatus(rootPath: string): Map<string, string> {
  const output = runGitText(rootPath, ['status', '--porcelain=v1', '--untracked-files=all'], {
    allowFailure: true,
  });
  const statuses = new Map<string, string>();

  for (const line of output.split('\n')) {
    if (!line.trim()) {
      continue;
    }

    const statusCode = line.slice(0, 2);
    let filePath = line.slice(3);

    if ((statusCode.includes('R') || statusCode.includes('C')) && filePath.includes(' -> ')) {
      filePath = filePath.split(' -> ').pop() || filePath;
    }

    const normalizedPath = decodeGitPath(filePath);
    if (!normalizedPath || normalizedPath.startsWith('.git/') || normalizedPath.startsWith('.dmux/')) {
      continue;
    }

    statuses.set(normalizedPath, statusCode);
  }

  return statuses;
}

function listRepositoryFiles(rootPath: string): string[] {
  const output = runGitText(rootPath, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    allowFailure: true,
  });

  return output
    .split('\0')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .filter((entry) => !entry.startsWith('.git/') && !entry.startsWith('.dmux/'));
}

export function loadBrowserSnapshot(rootPath: string): BrowserSnapshot {
  const repoFiles = new Set(listRepositoryFiles(rootPath));
  const statuses = parseGitStatus(rootPath);

  for (const filePath of statuses.keys()) {
    repoFiles.add(filePath);
  }

  const files = Array.from(repoFiles)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map((relativePath) => {
      const statusCode = statuses.get(relativePath) || '';
      const fullPath = path.join(rootPath, relativePath);
      const exists = fs.existsSync(fullPath);

      return {
        path: relativePath,
        name: path.basename(relativePath),
        parentPath: getParentPath(relativePath),
        exists,
        changed: normalizeStatusLabel(statusCode) !== '',
        statusCode,
        statusLabel: normalizeStatusLabel(statusCode),
      } satisfies BrowserFileRecord;
    });

  return {
    rootPath,
    files,
  };
}

export function computeModifiedTimes(
  rootPath: string,
  relativePaths: string[]
): Map<string, number> {
  const times = new Map<string, number>();

  for (const relativePath of relativePaths) {
    const fullPath = path.join(rootPath, relativePath);
    try {
      const stats = fs.statSync(fullPath);
      times.set(relativePath, stats.mtimeMs);
    } catch {
      times.set(relativePath, 0);
    }
  }

  return times;
}

function makeDirectoryNode(relativePath: string): BrowserTreeNode {
  return {
    path: relativePath,
    name: relativePath ? path.basename(relativePath) : '.',
    parentPath: getParentPath(relativePath),
    type: 'directory',
    exists: true,
    changed: false,
    statusLabel: '',
    sortModifiedAt: 0,
    children: [],
  };
}

function ensureDirectory(
  relativePath: string,
  nodeMap: Map<string, BrowserTreeNode>
): BrowserTreeNode {
  const existing = nodeMap.get(relativePath);
  if (existing) {
    return existing;
  }

  const node = makeDirectoryNode(relativePath);
  nodeMap.set(relativePath, node);

  if (relativePath) {
    const parent = ensureDirectory(getParentPath(relativePath) || '', nodeMap);
    parent.children.push(node);
  }

  return node;
}

function compareNodes(
  left: BrowserTreeNode,
  right: BrowserTreeNode,
  sortMode: BrowserSortMode
): number {
  if (left.type !== right.type) {
    return left.type === 'directory' ? -1 : 1;
  }

  if (sortMode === 'modified') {
    const modifiedDiff = right.sortModifiedAt - left.sortModifiedAt;
    if (modifiedDiff !== 0) {
      return modifiedDiff;
    }
  }

  if (sortMode === 'status') {
    const rankDiff = getStatusRank(right.statusLabel) - getStatusRank(left.statusLabel);
    if (rankDiff !== 0) {
      return rankDiff;
    }
  }

  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function compareSearchEntries(
  left: BrowserSearchEntryRecord,
  right: BrowserSearchEntryRecord,
  sortMode: BrowserSortMode
): number {
  if (left.type !== right.type) {
    return left.type === 'directory' ? -1 : 1;
  }

  if (sortMode === 'modified') {
    const modifiedDiff = right.sortModifiedAt - left.sortModifiedAt;
    if (modifiedDiff !== 0) {
      return modifiedDiff;
    }
  }

  if (sortMode === 'status') {
    const rankDiff = getStatusRank(right.statusLabel) - getStatusRank(left.statusLabel);
    if (rankDiff !== 0) {
      return rankDiff;
    }
  }

  return left.path.localeCompare(right.path, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function finalizeTree(
  node: BrowserTreeNode,
  sortMode: BrowserSortMode
): BrowserTreeNode {
  if (node.type === 'file') {
    return node;
  }

  node.children = node.children.map((child) => finalizeTree(child, sortMode));
  node.changed = node.children.some((child) => child.changed);
  node.statusLabel = pickDominantStatus(node.children.map((child) => child.statusLabel));
  node.sortModifiedAt = node.children.reduce(
    (highest, child) => Math.max(highest, child.sortModifiedAt),
    0
  );
  node.children.sort((left, right) => compareNodes(left, right, sortMode));

  return node;
}

function isFuzzyMatch(query: string, candidate: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const normalizedCandidate = candidate.toLowerCase();
  if (normalizedCandidate.includes(normalizedQuery)) {
    return true;
  }

  let queryIndex = 0;
  for (const char of normalizedCandidate) {
    if (char === normalizedQuery[queryIndex]) {
      queryIndex += 1;
      if (queryIndex === normalizedQuery.length) {
        return true;
      }
    }
  }

  return false;
}

function filterTreeNodes(
  nodes: BrowserTreeNode[],
  query: string
): BrowserTreeNode[] {
  const filtered: BrowserTreeNode[] = [];

  for (const node of nodes) {
    const matchesSelf = isFuzzyMatch(query, node.path || node.name);

    if (node.type === 'file') {
      if (matchesSelf) {
        filtered.push(node);
      }
      continue;
    }

    const filteredChildren = filterTreeNodes(node.children, query);
    if (matchesSelf) {
      filtered.push(node);
      continue;
    }

    if (filteredChildren.length > 0) {
      filtered.push({
        ...node,
        children: filteredChildren,
      });
    }
  }

  return filtered;
}

export function buildBrowserTree(
  snapshot: BrowserSnapshot,
  options: BrowserTreeOptions
): BrowserTreeNode[] {
  const rootNode = makeDirectoryNode('');
  const nodeMap = new Map<string, BrowserTreeNode>([['', rootNode]]);
  const modifiedTimes = options.modifiedTimes || new Map<string, number>();
  const filterQuery = options.filterQuery?.trim() || '';
  const includeDependencyPaths = shouldIncludeDependencyPaths(
    filterQuery,
    options.activePath
  );

  for (const file of snapshot.files) {
    if (options.filterMode === 'diffed' && !file.changed) {
      continue;
    }

    if (!includeDependencyPaths && hasDependencySegment(file.path)) {
      continue;
    }

    const parentPath = file.parentPath || '';
    const parent = ensureDirectory(parentPath, nodeMap);
    const fileNode: BrowserTreeNode = {
      path: file.path,
      name: file.name,
      parentPath: file.parentPath,
      type: 'file',
      exists: file.exists,
      changed: file.changed,
      statusLabel: file.statusLabel,
      sortModifiedAt: modifiedTimes.get(file.path) || 0,
      children: [],
    };

    parent.children.push(fileNode);
  }

  const finalizedChildren = finalizeTree(rootNode, options.sortMode).children;
  if (!filterQuery) {
    return finalizedChildren;
  }

  return filterTreeNodes(finalizedChildren, filterQuery);
}

export function buildBrowserSearchEntries(
  snapshot: BrowserSnapshot,
  options: BrowserTreeOptions
): BrowserVisibleEntry[] {
  const filterQuery = options.filterQuery?.trim() || '';
  if (!filterQuery) {
    return [];
  }

  const modifiedTimes = options.modifiedTimes || new Map<string, number>();
  const includeDependencyPaths = shouldIncludeDependencyPaths(
    filterQuery,
    options.activePath
  );
  const directoryEntries = new Map<string, BrowserSearchEntryRecord>();
  const fileEntries: BrowserSearchEntryRecord[] = [];

  for (const file of snapshot.files) {
    if (options.filterMode === 'diffed' && !file.changed) {
      continue;
    }

    if (!includeDependencyPaths && hasDependencySegment(file.path)) {
      continue;
    }

    const fileModifiedAt = modifiedTimes.get(file.path) || 0;

    if (isFuzzyMatch(filterQuery, file.path)) {
      fileEntries.push({
        path: file.path,
        name: file.name,
        parentPath: file.parentPath,
        type: 'file',
        exists: file.exists,
        changed: file.changed,
        statusLabel: file.statusLabel,
        sortModifiedAt: fileModifiedAt,
      });
    }

    let currentDirectory = file.parentPath;
    while (currentDirectory) {
      const existing = directoryEntries.get(currentDirectory);
      if (existing) {
        existing.changed = existing.changed || file.changed;
        existing.statusLabel = pickDominantStatus([existing.statusLabel, file.statusLabel]);
        existing.sortModifiedAt = Math.max(existing.sortModifiedAt, fileModifiedAt);
      } else {
        directoryEntries.set(currentDirectory, {
          path: currentDirectory,
          name: path.basename(currentDirectory),
          parentPath: getParentPath(currentDirectory),
          type: 'directory',
          exists: true,
          changed: file.changed,
          statusLabel: file.changed ? pickDominantStatus([file.statusLabel]) : '',
          sortModifiedAt: fileModifiedAt,
        });
      }

      currentDirectory = getParentPath(currentDirectory);
    }
  }

  const matches = [
    ...Array.from(directoryEntries.values()).filter((entry) => isFuzzyMatch(filterQuery, entry.path)),
    ...fileEntries,
  ].sort((left, right) => compareSearchEntries(left, right, options.sortMode));

  return matches.map((entry) => ({
    path: entry.path,
    name: entry.name,
    parentPath: entry.parentPath,
    type: entry.type,
    exists: entry.exists,
    changed: entry.changed,
    statusLabel: entry.type === 'directory' ? (entry.changed ? 'M' : '') : entry.statusLabel,
    isExpanded: false,
    displayLabel: entry.type === 'directory' ? `${entry.path}/` : entry.path,
  }));
}

function buildDisplayLabel(
  node: BrowserTreeNode,
  ancestorsHaveNext: boolean[],
  isLast: boolean,
  isExpanded: boolean
): string {
  const branchPrefix = ancestorsHaveNext
    .map((hasNext) => (hasNext ? '│  ' : '   '))
    .join('');
  const connector = isLast ? '└─' : '├─';

  if (node.type === 'directory') {
    const icon = isExpanded ? '' : '';
    return `${branchPrefix}${connector}${icon} ${node.name}/`;
  }

  const missingSuffix = node.exists ? '' : ' [missing]';
  return `${branchPrefix}${connector} ${node.name}${missingSuffix}`;
}

function flattenNodes(
  nodes: BrowserTreeNode[],
  expandedPaths: Set<string>,
  ancestorsHaveNext: boolean[] = [],
  options: FlattenBrowserTreeOptions = {}
): BrowserVisibleEntry[] {
  const rows: BrowserVisibleEntry[] = [];

  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const isExpanded = node.type === 'directory'
      && (options.forceExpandDirectories || expandedPaths.has(node.path));

    rows.push({
      path: node.path,
      name: node.name,
      parentPath: node.parentPath,
      type: node.type,
      exists: node.exists,
      changed: node.changed,
      statusLabel: node.type === 'directory' ? (node.changed ? 'M' : '') : node.statusLabel,
      isExpanded,
      displayLabel: buildDisplayLabel(node, ancestorsHaveNext, isLast, isExpanded),
    });

    if (node.type === 'directory' && isExpanded && node.children.length > 0) {
      rows.push(
        ...flattenNodes(
          node.children,
          expandedPaths,
          [...ancestorsHaveNext, !isLast],
          options
        )
      );
    }
  });

  return rows;
}

export function flattenBrowserTree(
  nodes: BrowserTreeNode[],
  expandedPaths: Set<string>,
  options: FlattenBrowserTreeOptions = {}
): BrowserVisibleEntry[] {
  return flattenNodes(nodes, expandedPaths, [], options);
}

export function getParentPath(relativePath: string): string | null {
  if (!relativePath) {
    return null;
  }

  const parent = path.dirname(relativePath);
  return parent === '.' ? null : parent;
}

export function getAncestorPaths(relativePath: string): string[] {
  const ancestors: string[] = [];
  let current = getParentPath(relativePath);

  while (current) {
    ancestors.unshift(current);
    current = getParentPath(current);
  }

  return ancestors;
}

function readPreviewChunk(
  fullPath: string
): { buffer: Buffer; truncated: boolean } {
  const stats = fs.statSync(fullPath);
  const fileSize = stats.size;
  const bytesToRead = Math.min(fileSize, MAX_PREVIEW_BYTES);
  const fd = fs.openSync(fullPath, 'r');

  try {
    const buffer = Buffer.alloc(bytesToRead);
    fs.readSync(fd, buffer, 0, bytesToRead, 0);
    return {
      buffer,
      truncated: fileSize > MAX_PREVIEW_BYTES,
    };
  } finally {
    fs.closeSync(fd);
  }
}

export function loadCodePreview(rootPath: string, relativePath: string): string[] {
  const fullPath = path.join(rootPath, relativePath);

  if (!fs.existsSync(fullPath)) {
    return ['File no longer exists in this worktree.', '', 'Press d to inspect its diff.'];
  }

  try {
    const { buffer, truncated } = readPreviewChunk(fullPath);

    if (buffer.includes(0)) {
      return ['Binary file preview is disabled.', '', 'Open the file externally if needed.'];
    }

    const sourceText = buffer.toString('utf-8');
    const highlighted = highlight(sourceText, {
      ignoreIllegals: true,
    });
    const suffix = truncated ? '\n\n[truncated preview]' : '';

    return `${highlighted}${suffix}`.split('\n');
  } catch (error) {
    return [
      `Failed to read ${relativePath}`,
      '',
      error instanceof Error ? error.message : String(error),
    ];
  }
}

function runGitPreview(
  rootPath: string,
  args: string[]
): string {
  const result = spawnSync('git', args, {
    cwd: rootPath,
    encoding: 'utf-8',
    maxBuffer: MAX_GIT_BUFFER,
  });

  if (result.status === 0) {
    return result.stdout || '';
  }

  return result.stdout || result.stderr || '';
}

export function loadDiffPreview(
  rootPath: string,
  relativePath: string,
  statusLabel: string
): string[] {
  const fullPath = path.join(rootPath, relativePath);

  let diffOutput = '';

  if (statusLabel === '??' && fs.existsSync(fullPath)) {
    diffOutput = runGitPreview(rootPath, [
      'diff',
      '--no-index',
      '--color=always',
      '--',
      '/dev/null',
      fullPath,
    ]);
  } else {
    diffOutput = runGitPreview(rootPath, [
      'diff',
      '--no-ext-diff',
      '--color=always',
      'HEAD',
      '--',
      relativePath,
    ]);
  }

  const trimmed = diffOutput.trimEnd();
  if (!trimmed) {
    return ['No diff against HEAD for this file.'];
  }

  return trimmed.split('\n');
}

export function getStatusColor(statusLabel: string): string | undefined {
  if (!statusLabel) {
    return undefined;
  }

  if (statusLabel === '??') {
    return 'cyan';
  }

  if (statusLabel.includes('U') || statusLabel.includes('D')) {
    return 'red';
  }

  if (statusLabel.includes('A')) {
    return 'green';
  }

  if (statusLabel.includes('R') || statusLabel.includes('C')) {
    return 'blue';
  }

  if (statusLabel.includes('M') || statusLabel.includes('T')) {
    return 'yellow';
  }

  return undefined;
}

export function getCurrentDirectoryPath(
  rootPath: string,
  entry?: Pick<BrowserVisibleEntry, 'type' | 'path' | 'parentPath'>
): string {
  if (!entry) {
    return rootPath;
  }

  if (entry.type === 'directory') {
    return path.join(rootPath, entry.path);
  }

  return path.join(rootPath, entry.parentPath || '');
}
