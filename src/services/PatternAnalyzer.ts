/**
 * Deterministic pattern-based terminal state analyzer.
 *
 * This replaces LLM-based analysis for the autopilot action path.
 * Terminal content is UNTRUSTED - an attacker controlling terminal output
 * could craft content that tricks an LLM into returning arbitrary options
 * and keystrokes. Regex patterns are immune to prompt injection because
 * they match fixed structural patterns, not semantic meaning.
 *
 * The LLM (PaneAnalyzer) remains used for display-only purposes (summaries)
 * but NEVER drives autopilot key-sending.
 */

import type { AgentName } from '../utils/agentLaunch.js';
import { LogService } from './LogService.js';

export interface PatternMatch {
  state: 'option_dialog' | 'open_prompt' | 'in_progress';
  question?: string;
  options?: Array<{
    action: string;
    keys: string[];
  }>;
  /** True only when matched by a deterministic pattern (safe for autopilot). */
  deterministic: true;
}

interface OptionPattern {
  /** Regex applied to the last N lines of terminal content. */
  pattern: RegExp;
  /** Extract structured options from the matched content. */
  extract: (content: string, match: RegExpMatchArray) => Pick<PatternMatch, 'question' | 'options'>;
}

interface AgentPatternSet {
  /** Patterns that indicate the agent is working (already handled by PaneWorker, but here as backup). */
  working: RegExp[];
  /** Patterns that match known option dialogs with deterministic responses. */
  optionDialogs: OptionPattern[];
  /** Patterns that indicate an idle/open prompt. */
  idle: RegExp[];
}

// ─── Claude Code patterns ────────────────────────────────────────────

const CLAUDE_YN_PATTERN = /\?\s*\(([yY])\/([nN])\)\s*$/m;
const CLAUDE_YN_BARE = /\?\s*\[([yYnN])\/([yYnN])\]\s*$/m;

// Claude's bracket-letter options: [A]ccept, [R]eject, [E]dit
// Matches lines like: "  [A]ccept edits  [R]eject  [E]dit manually"
const CLAUDE_BRACKET_OPTIONS = /\[([A-Z])\]\w+(?:\s+\w+)*(?:[,\s]+\[([A-Z])\]\w+(?:\s+\w+)*)+/;

// Claude numbered menu: "❯ 1. Yes, proceed" / "  2. No, exit"
const CLAUDE_NUMBERED_MENU = /(?:❯\s*)?(\d)\.\s+(.+?)(?:\n|$)/g;
const CLAUDE_NUMBERED_MENU_DETECT = /❯\s*\d\.\s+/m;

// Claude "Do you want to..." with y/n
const CLAUDE_DO_YOU_WANT = /Do you want to .+\?\s*$/m;

// ─── OpenCode patterns ───────────────────────────────────────────────

// OpenCode uses similar y/n patterns
const OPENCODE_YN = /\?\s*\[([yY])\/([nN])\]\s*$/m;

// ─── Generic patterns (work across agents) ───────────────────────────

// Simple "Continue? [y/n]" or "Proceed? (y/n)" at end of content
const GENERIC_YN_PAREN = /[?:]\s*\(([yY])\/([nN])\)\s*$/m;
const GENERIC_YN_BRACKET = /[?:]\s*\[([yY])\/([nN])\]\s*$/m;

// ─── Working indicators ─────────────────────────────────────────────

const UNIVERSAL_WORKING = /\(esc\s+to\s+interrupt/i;
const CLAUDE_WORKING = /·\s+\w+ing[.…]+.*\(esc\s+to\s+interrupt/i;
const OPENCODE_WORKING_1 = /working\.\.\./i;
const OPENCODE_WORKING_2 = /⏳.*processing/i;

// ─── Idle indicators ─────────────────────────────────────────────────

const CLAUDE_IDLE = /^>\s*$/m;
const OPENCODE_IDLE = /^❯\s*$/m;
const GENERIC_PROMPT = /^[\$#%>❯]\s*$/m;

/**
 * Build the pattern set for a given agent.
 */
function buildAgentPatterns(agent: AgentName): AgentPatternSet {
  switch (agent) {
    case 'claude':
      return {
        working: [UNIVERSAL_WORKING, CLAUDE_WORKING],
        optionDialogs: [
          // (y/n) prompt
          {
            pattern: CLAUDE_YN_PATTERN,
            extract: (content, match) => {
              const questionMatch = content.match(/([^\n]+\?\s*\([yY]\/[nN]\))/);
              return {
                question: questionMatch ? questionMatch[1].trim() : 'Confirm?',
                options: [
                  { action: 'Yes', keys: ['y'] },
                  { action: 'No', keys: ['n'] },
                ],
              };
            },
          },
          // [y/n] prompt
          {
            pattern: CLAUDE_YN_BARE,
            extract: (content, match) => {
              const questionMatch = content.match(/([^\n]+\?\s*\[[yYnN]\/[yYnN]\])/);
              return {
                question: questionMatch ? questionMatch[1].trim() : 'Confirm?',
                options: [
                  { action: 'Yes', keys: ['y'] },
                  { action: 'No', keys: ['n'] },
                ],
              };
            },
          },
          // [A]ccept, [R]eject, [E]dit pattern
          {
            pattern: CLAUDE_BRACKET_OPTIONS,
            extract: (content, match) => {
              const letters: string[] = [];
              const actions: string[] = [];
              // Re-scan to get all bracket options
              const re = /\[([A-Z])\](\w+(?:\s+\w+)*)/g;
              let m: RegExpExecArray | null;
              while ((m = re.exec(content)) !== null) {
                letters.push(m[1]);
                actions.push(m[1] + m[2]);
              }
              return {
                question: 'Choose action',
                options: letters.map((letter, i) => ({
                  action: actions[i] || letter,
                  keys: [letter.toLowerCase()],
                })),
              };
            },
          },
          // Numbered menu: ❯ 1. Yes, proceed / 2. No, exit
          {
            pattern: CLAUDE_NUMBERED_MENU_DETECT,
            extract: (content) => {
              const options: Array<{ action: string; keys: string[] }> = [];
              const re = /(?:❯\s*)?(\d)\.\s+(.+?)(?:\n|$)/g;
              let m: RegExpExecArray | null;
              while ((m = re.exec(content)) !== null) {
                options.push({
                  action: m[2].trim(),
                  keys: [m[1]],
                });
              }
              return {
                question: 'Select option',
                options,
              };
            },
          },
        ],
        idle: [CLAUDE_IDLE, GENERIC_PROMPT],
      };

    case 'opencode':
      return {
        working: [UNIVERSAL_WORKING, OPENCODE_WORKING_1, OPENCODE_WORKING_2],
        optionDialogs: [
          {
            pattern: OPENCODE_YN,
            extract: (content, match) => {
              const questionMatch = content.match(/([^\n]+\?\s*\[[yYnN]\/[yYnN]\])/);
              return {
                question: questionMatch ? questionMatch[1].trim() : 'Confirm?',
                options: [
                  { action: 'Yes', keys: ['y'] },
                  { action: 'No', keys: ['n'] },
                ],
              };
            },
          },
        ],
        idle: [OPENCODE_IDLE, GENERIC_PROMPT],
      };

    case 'codex':
    case 'cline':
    case 'gemini':
    case 'qwen':
    case 'amp':
    case 'pi':
    case 'cursor':
    case 'copilot':
    case 'crush':
    default:
      // Generic patterns only - no agent-specific autopilot support.
      // These agents won't get auto-accepted unless they happen to use
      // a universal pattern.
      return {
        working: [UNIVERSAL_WORKING],
        optionDialogs: [
          {
            pattern: GENERIC_YN_PAREN,
            extract: (content) => {
              const questionMatch = content.match(/([^\n]+[?:]\s*\([yY]\/[nN]\))/);
              return {
                question: questionMatch ? questionMatch[1].trim() : 'Confirm?',
                options: [
                  { action: 'Yes', keys: ['y'] },
                  { action: 'No', keys: ['n'] },
                ],
              };
            },
          },
          {
            pattern: GENERIC_YN_BRACKET,
            extract: (content) => {
              const questionMatch = content.match(/([^\n]+[?:]\s*\[[yY]\/[nN]\])/);
              return {
                question: questionMatch ? questionMatch[1].trim() : 'Confirm?',
                options: [
                  { action: 'Yes', keys: ['y'] },
                  { action: 'No', keys: ['n'] },
                ],
              };
            },
          },
        ],
        idle: [GENERIC_PROMPT],
      };
  }
}

/**
 * Analyze terminal content using deterministic regex patterns.
 *
 * Returns a PatternMatch if a known pattern is detected, or null if
 * no pattern matched (fall back to LLM for display-only analysis).
 *
 * IMPORTANT: The result of this function is the ONLY thing that should
 * drive autopilot key-sending. LLM results must never trigger keystrokes.
 */
export function analyzeWithPatterns(
  content: string,
  agent?: AgentName,
): PatternMatch | null {
  const logService = LogService.getInstance();

  if (!content || !agent) {
    return null;
  }

  const patterns = buildAgentPatterns(agent);

  // Focus on last 15 lines for state detection (like the LLM does with "last 10 lines")
  const lines = content.split('\n');
  const tail = lines.slice(-15).join('\n');

  // 1. Check working indicators
  for (const re of patterns.working) {
    if (re.test(tail)) {
      logService.debug(`PatternAnalyzer: Working pattern matched for agent "${agent}"`, 'patternAnalyzer');
      return { state: 'in_progress', deterministic: true };
    }
  }

  // 2. Check option dialogs (only on tail to avoid matching old content)
  for (const optPattern of patterns.optionDialogs) {
    const match = tail.match(optPattern.pattern);
    if (match) {
      const extracted = optPattern.extract(tail, match);
      if (extracted.options && extracted.options.length > 0) {
        logService.debug(
          `PatternAnalyzer: Option dialog matched for agent "${agent}": ${extracted.question}`,
          'patternAnalyzer',
        );
        return {
          state: 'option_dialog',
          question: extracted.question,
          options: extracted.options,
          deterministic: true,
        };
      }
    }
  }

  // 3. Check idle indicators
  for (const re of patterns.idle) {
    if (re.test(tail)) {
      logService.debug(`PatternAnalyzer: Idle pattern matched for agent "${agent}"`, 'patternAnalyzer');
      return { state: 'open_prompt', deterministic: true };
    }
  }

  // No pattern matched - return null (LLM can still analyze for display)
  return null;
}
