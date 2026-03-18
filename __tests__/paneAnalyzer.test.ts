import { describe, expect, it } from 'vitest';
import { normalizePaneContentForAnalysis } from '../src/services/PaneAnalyzer.js';

describe('PaneAnalyzer content normalization', () => {
  it('keeps only the last 50 lines after trimming blank edges', () => {
    const content = [
      '',
      '',
      ...Array.from({ length: 55 }, (_, index) => `line ${index + 1}`),
      '',
      '',
    ].join('\n');

    expect(normalizePaneContentForAnalysis(content).split('\n')).toEqual(
      Array.from({ length: 50 }, (_, index) => `line ${index + 6}`)
    );
  });

  it('drops blank boundary lines left after slicing the final window', () => {
    const content = [
      'discard me',
      '',
      ...Array.from({ length: 49 }, (_, index) => `keep ${index + 1}`),
    ].join('\n');

    expect(normalizePaneContentForAnalysis(content).split('\n')).toEqual(
      Array.from({ length: 49 }, (_, index) => `keep ${index + 1}`)
    );
  });
});
