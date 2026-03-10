import { describe, expect, it } from 'vitest';
import {
  hasAgentWorkingIndicators,
  isLikelyUserTyping,
} from '../src/utils/paneAttentionHeuristics.js';

describe('paneAttentionHeuristics', () => {
  it('detects interrupt-based working indicators', () => {
    expect(hasAgentWorkingIndicators('Planning changes\n(esc to interrupt)')).toBe(true);
  });

  it('detects generic progress lines for non-claude agents', () => {
    expect(hasAgentWorkingIndicators('● Working... collecting files', 'codex')).toBe(true);
    expect(hasAgentWorkingIndicators('⏳ Processing repository state', 'gemini')).toBe(true);
  });

  it('detects small prompt edits as user typing', () => {
    expect(isLikelyUserTyping('> fix auth bug', '> fix auth bug please')).toBe(true);
    expect(isLikelyUserTyping('│ > add tests', '│ > add tests now')).toBe(true);
    expect(isLikelyUserTyping('', '> start here')).toBe(true);
  });

  it('does not treat large multi-line changes as user typing', () => {
    const previous = [
      'Reading files',
      'Checking auth.ts',
      '> fix auth bug',
    ].join('\n');
    const current = [
      'Updated auth.ts',
      'Added tests',
      'Build succeeded',
    ].join('\n');

    expect(isLikelyUserTyping(previous, current)).toBe(false);
  });
});
