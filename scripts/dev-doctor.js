#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
  });
  return {
    ok: result.status === 0,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    status: result.status,
  };
}

function getProjectRoot() {
  const wt = run('git', ['worktree', 'list', '--porcelain']);
  if (wt.ok && wt.stdout) {
    const firstLine = wt.stdout.split('\n')[0] || '';
    if (firstLine.startsWith('worktree ')) {
      return firstLine.slice('worktree '.length).trim();
    }
  }

  const top = run('git', ['rev-parse', '--show-toplevel']);
  if (top.ok && top.stdout) {
    return top.stdout;
  }

  return process.cwd();
}

function buildSessionName(projectRoot) {
  const projectName = path.basename(projectRoot);
  const projectHash = createHash('md5').update(projectRoot).digest('hex').slice(0, 8);
  return `dmux-${`${projectName}-${projectHash}`.replace(/\./g, '-')}`;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function parsePaneRows(output) {
  if (!output) return [];

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [paneId, paneCurrentPath, paneCurrentCommand, ...rest] = line.split('\t');
      return {
        paneId,
        paneCurrentPath,
        paneCurrentCommand,
        paneStartCommand: rest.join('\t'),
      };
    });
}

function status(level, label, details) {
  const tag = level === 'ok' ? '[ok]' : level === 'warn' ? '[warn]' : '[fail]';
  console.log(`${tag} ${label}${details ? `: ${details}` : ''}`);
}

function pathEq(a, b) {
  if (!a || !b) return false;
  try {
    return path.resolve(a) === path.resolve(b);
  } catch {
    return a === b;
  }
}

const projectRoot = getProjectRoot();
const cwd = process.cwd();
const sessionName = buildSessionName(projectRoot);
const configPath = path.join(projectRoot, '.dmux', 'dmux.config.json');
const config = readJson(configPath);

console.log('dmux dev doctor');
console.log(`project root: ${projectRoot}`);
console.log(`working dir:  ${cwd}`);
console.log(`session:      ${sessionName}`);
console.log(`config:       ${configPath}`);
console.log('');

let hasCriticalIssue = false;

if (config) {
  status('ok', 'Config file', 'loaded');
} else {
  status('fail', 'Config file', 'missing or invalid JSON');
  hasCriticalIssue = true;
}

const hasSession = run('tmux', ['has-session', '-t', sessionName]).ok;
if (hasSession) {
  status('ok', 'tmux session', 'present');
} else {
  status('fail', 'tmux session', 'not running');
  hasCriticalIssue = true;
}

let panes = [];
if (hasSession) {
  const paneRows = run('tmux', [
    'list-panes',
    '-t',
    sessionName,
    '-F',
    '#{pane_id}\t#{pane_current_path}\t#{pane_current_command}\t#{pane_start_command}',
  ]);

  if (paneRows.ok) {
    panes = parsePaneRows(paneRows.stdout);
    status('ok', 'tmux panes', `${panes.length} pane(s)`);
  } else {
    status('fail', 'tmux panes', paneRows.stderr || 'unable to list panes');
    hasCriticalIssue = true;
  }
}

const controlPaneId = typeof config?.controlPaneId === 'string' ? config.controlPaneId : '';
const controlPane = controlPaneId ? panes.find((pane) => pane.paneId === controlPaneId) : undefined;

if (!controlPaneId) {
  status('warn', 'Control pane', 'not set in config');
  hasCriticalIssue = true;
} else if (!controlPane) {
  status('fail', 'Control pane', `${controlPaneId} not found in session`);
  hasCriticalIssue = true;
} else {
  status('ok', 'Control pane', `${controlPaneId} (${controlPane.paneCurrentCommand || 'unknown'})`);
}

const sourcePath = controlPane?.paneCurrentPath || projectRoot;
const sourceLabel = pathEq(sourcePath, projectRoot)
  ? 'root'
  : `worktree (${path.relative(projectRoot, sourcePath) || sourcePath})`;
status('ok', 'Active source', `${sourcePath} [${sourceLabel}]`);

const watchMarkers = [
  'dev:watch',
  'node --watch dist/index.js',
  'tsx --watch src/index.ts',
];
const controlStartCommand = controlPane?.paneStartCommand || '';
const watchInControl = watchMarkers.some((marker) => controlStartCommand.includes(marker));
const watchInAnyPane = panes.some((pane) =>
  watchMarkers.some((marker) => (pane.paneStartCommand || '').includes(marker))
);

if (watchInControl) {
  status('ok', 'Watch loop', 'control pane is running dev watch');
} else if (watchInAnyPane) {
  status('warn', 'Watch loop', 'watch found in session, but not on control pane');
} else {
  status('fail', 'Watch loop', 'no dev watch command detected');
  hasCriticalIssue = true;
}

const generatedDocsCandidates = [
  path.join(cwd, 'src', 'utils', 'generated-agents-doc.ts'),
  path.join(projectRoot, 'src', 'utils', 'generated-agents-doc.ts'),
];
const generatedDocsPath = generatedDocsCandidates.find((candidate) => fs.existsSync(candidate));
if (generatedDocsPath) {
  status('ok', 'Generated hooks docs', generatedDocsPath);
} else {
  status('fail', 'Generated hooks docs', 'src/utils/generated-agents-doc.ts not found');
  hasCriticalIssue = true;
}

const hookDirCandidates = [
  path.join(cwd, '.dmux-hooks'),
  path.join(projectRoot, '.dmux-hooks'),
];
const hookDir = hookDirCandidates.find((candidate) => fs.existsSync(candidate));
if (!hookDir) {
  status('warn', 'Local hooks', '.dmux-hooks not found');
} else {
  const requiredHooks = ['worktree_created', 'pre_merge'];
  const missingHooks = requiredHooks.filter((hook) => !fs.existsSync(path.join(hookDir, hook)));
  if (missingHooks.length === 0) {
    status('ok', 'Local hooks', `${hookDir} (worktree_created, pre_merge)`);
  } else {
    status('warn', 'Local hooks', `${hookDir} missing: ${missingHooks.join(', ')}`);
  }
}

console.log('');
if (hasCriticalIssue) {
  console.log('Suggested fixes:');
  console.log('1. Run `pnpm dev` from the dmux worktree you want to use as source.');
  console.log('2. In dmux DEV mode, use [DEV] Use as Source (or S) to toggle source/root.');
  console.log('3. Re-run `pnpm dev:doctor` to confirm watch + source health.');
  process.exitCode = 1;
} else {
  console.log('All core dev checks passed.');
}
