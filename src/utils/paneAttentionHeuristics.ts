import type { AgentName } from './agentLaunch.js';

const GENERIC_PROGRESS_WORDS = [
  'working',
  'thinking',
  'planning',
  'pondering',
  'crunching',
  'analyzing',
  'building',
  'testing',
  'running',
  'searching',
  'reviewing',
  'understanding',
  'loading',
  'processing',
  'writing',
  'reading',
  'editing',
  'patching',
  'generating',
  'reasoning',
  'compiling',
  'indexing',
  'summarizing',
  'executing',
  'refactoring',
  'fixing',
  'checking',
  'scanning',
];

const SPINNER_PREFIX = '[⠁-⣿◐◓◑◒◴◷◶◵●○◦•·⋯⋮✦✧✶✻✽⏳⌛]';
const PROMPT_PATTERNS = [
  /^\s*>\s*\S/,
  /^\s*\$\s*\S/,
  /^\s*❯\s*\S/,
  /^\s*›\s*\S/,
  /^\s*│\s*>\s*\S/,
  /^\s*>\s*$/,
  /^\s*❯\s*$/,
  /^\s*│\s*>\s*$/,
];

function recentRelevantLines(content: string, maxLines: number = 8): string[] {
  return content
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(-maxLines);
}

function commonPrefixLength(left: string, right: string): number {
  const maxLength = Math.min(left.length, right.length);
  let index = 0;
  while (index < maxLength && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

function looksLikePromptLine(line: string): boolean {
  return PROMPT_PATTERNS.some((pattern) => pattern.test(line));
}

export function hasAgentWorkingIndicators(content: string, agent?: AgentName): boolean {
  const lines = recentRelevantLines(content, 10);
  if (lines.length === 0) {
    return false;
  }

  const recentContent = lines.join('\n');
  if (/\besc\s+to\s+(interrupt|cancel|stop|abort)\b/i.test(recentContent)) {
    return true;
  }

  const progressWordPattern = new RegExp(
    `(?:${GENERIC_PROGRESS_WORDS.join('|')})(?:\\b|\\.\\.\\.|…|\\s)`,
    'i'
  );
  const spinnerLinePattern = new RegExp(
    `^${SPINNER_PREFIX}\\s*(?:${GENERIC_PROGRESS_WORDS.join('|')})(?:\\b|\\.\\.\\.|…|\\s)`,
    'i'
  );
  const progressSuffixPattern = new RegExp(
    `\\b(?:${GENERIC_PROGRESS_WORDS.join('|')})\\b.*(?:\\.\\.\\.|…|\\d{1,3}%|/\\d+)`,
    'i'
  );

  if (lines.some((line) => spinnerLinePattern.test(line) || progressSuffixPattern.test(line))) {
    return true;
  }

  switch (agent) {
    case 'claude':
      return lines.some((line) =>
        /claude\s+is\s+working/i.test(line)
        || /(?:germinating|thinking|planning|writing|reading|analyzing|building|testing|running|searching|reviewing|understanding)[.…]*$/i.test(line)
        || progressWordPattern.test(line)
      );
    case 'opencode':
    case 'codex':
    case 'gemini':
    case 'qwen':
    case 'cursor':
    case 'copilot':
    case 'cline':
    case 'amp':
    case 'pi':
    case 'crush':
      return lines.some((line) => progressWordPattern.test(line));
    default:
      return lines.some((line) => progressWordPattern.test(line));
  }
}

export function isLikelyUserTyping(previousContent: string, currentContent: string): boolean {
  if (!currentContent || previousContent === currentContent) {
    return false;
  }

  const previousLines = previousContent.split('\n');
  const currentLines = currentContent.split('\n');
  if (Math.abs(currentLines.length - previousLines.length) > 2) {
    return false;
  }

  const maxLength = Math.max(previousLines.length, currentLines.length);
  const changedIndices: number[] = [];

  for (let index = 0; index < maxLength; index += 1) {
    if ((previousLines[index] || '') !== (currentLines[index] || '')) {
      changedIndices.push(index);
    }
  }

  if (changedIndices.length === 0 || changedIndices.length > 3) {
    return false;
  }

  const bottomThreshold = maxLength - 4;
  if (changedIndices.some((index) => index < bottomThreshold)) {
    return false;
  }

  return changedIndices.some((index) => {
    const previousLine = previousLines[index] || '';
    const currentLine = currentLines[index] || '';
    const delta = Math.abs(currentLine.length - previousLine.length);
    const prefixLength = commonPrefixLength(previousLine, currentLine);
    const maxLengthForLine = Math.max(previousLine.length, currentLine.length);
    const mostlySharedPrefix = maxLengthForLine > 0 && prefixLength / maxLengthForLine >= 0.7;

    if (delta > 32) {
      return false;
    }

    if (
      (currentLine.startsWith(previousLine) || previousLine.startsWith(currentLine))
      && looksLikePromptLine(currentLine || previousLine)
    ) {
      return true;
    }

    return mostlySharedPrefix && looksLikePromptLine(currentLine || previousLine);
  });
}
