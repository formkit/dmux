import { describe, expect, it } from 'vitest';

import {
  getFooterTips,
  getNextFooterTipIndex,
  getRandomFooterTipIndex,
} from '../src/utils/footerTips.js';

describe('footer tips', () => {
  it('includes extra tips in dev mode', () => {
    expect(getFooterTips(true).length).toBeGreaterThan(getFooterTips(false).length);
  });

  it('wraps to the first tip after the last tip', () => {
    expect(getNextFooterTipIndex(2, 3)).toBe(0);
  });

  it('returns the first tip for invalid current indexes', () => {
    expect(getNextFooterTipIndex(-1, 3)).toBe(0);
    expect(getNextFooterTipIndex(99, 3)).toBe(0);
  });

  it('maps random values into a valid tip index', () => {
    expect(getRandomFooterTipIndex(4, 0)).toBe(0);
    expect(getRandomFooterTipIndex(4, 0.51)).toBe(2);
    expect(getRandomFooterTipIndex(4, 0.99)).toBe(3);
  });
});
