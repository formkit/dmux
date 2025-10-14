import { describe, it, expect } from 'vitest';
import { calculateOptimalColumns, MIN_COMFORTABLE_WIDTH, MIN_COMFORTABLE_HEIGHT } from '../src/utils/tmux.js';

describe('layout calculation', () => {
  describe('calculateOptimalColumns', () => {
    it('returns 1 column for single pane', () => {
      const cols = calculateOptimalColumns(1, 119, 40);
      expect(cols).toBe(1);
    });

    it('prefers 2 columns for 3 panes when height is limited (avoids cramped vertical stack)', () => {
      // 160x40 terminal with 40-char sidebar = 119x40 content area
      // 1 column = 119x12 per pane (too short!)
      // 2 columns = 59x19 per pane (much better)
      const cols = calculateOptimalColumns(3, 119, 40);
      expect(cols).toBe(2);
    });

    it('prefers 1 column when width is limited and height is sufficient', () => {
      // Narrow but tall terminal
      // 1 column = 80x26 per pane (comfortable height)
      // 2 columns = 39x39 per pane (too narrow)
      const cols = calculateOptimalColumns(3, 80, 80);
      expect(cols).toBe(1);
    });

    it('handles wide terminals by using multiple columns', () => {
      // Very wide terminal: 200x40 content area
      // Can comfortably fit 3 columns side by side
      const cols = calculateOptimalColumns(3, 200, 40);
      expect(cols).toBe(3);
    });

    it('falls back to best height when no perfect layout exists', () => {
      // Extremely narrow content area
      // No configuration meets MIN_COMFORTABLE_WIDTH, so use fallback
      const cols = calculateOptimalColumns(3, 50, 40);
      // Should choose layout that maximizes height (more columns = fewer rows = more height)
      expect(cols).toBeGreaterThan(0);
    });

    it('respects MIN_COMFORTABLE_HEIGHT threshold', () => {
      // Test the original problem: 3 panes stacked vertically = 12 lines each
      // This is below MIN_COMFORTABLE_HEIGHT (15), so should prefer 2 columns
      const contentHeight = 40;
      const numPanes = 3;

      // Calculate what height we'd get with 1 column
      const rows1Col = Math.ceil(numPanes / 1);
      const height1Col = Math.floor((contentHeight - (rows1Col - 1)) / rows1Col);

      // Verify our test scenario is correct
      expect(height1Col).toBeLessThan(MIN_COMFORTABLE_HEIGHT);

      // Now verify the function prefers 2 columns
      const cols = calculateOptimalColumns(numPanes, 119, contentHeight);
      expect(cols).toBe(2);

      // And verify 2 columns gives comfortable height
      const rows2Col = Math.ceil(numPanes / 2);
      const height2Col = Math.floor((contentHeight - (rows2Col - 1)) / rows2Col);
      expect(height2Col).toBeGreaterThanOrEqual(MIN_COMFORTABLE_HEIGHT);
    });

    it('handles edge case of exactly MIN_COMFORTABLE dimensions', () => {
      // Panes at exactly minimum comfortable size should be accepted
      const contentWidth = MIN_COMFORTABLE_WIDTH * 2 + 1; // Exactly fits 2 columns
      const contentHeight = MIN_COMFORTABLE_HEIGHT * 2 + 1; // Exactly fits 2 rows

      const cols = calculateOptimalColumns(4, contentWidth, contentHeight);
      expect(cols).toBe(2); // Should use 2x2 grid
    });

    it('prefers balanced layouts with better height scores', () => {
      // Large content area where multiple configurations work
      // Should prefer configuration with better height (closer to MIN_COMFORTABLE_HEIGHT * 1.5)
      const cols = calculateOptimalColumns(6, 240, 60);

      // Verify a reasonable column count (2 or 3)
      expect(cols).toBeGreaterThanOrEqual(2);
      expect(cols).toBeLessThanOrEqual(3);
    });

    it('handles many panes gracefully', () => {
      // 10 panes in reasonable space
      const cols = calculateOptimalColumns(10, 200, 80);

      // Should find some multi-column layout
      expect(cols).toBeGreaterThan(1);
      expect(cols).toBeLessThanOrEqual(10);
    });

    it('returns fallback when content area is impossibly small', () => {
      // Tiny content area that can't fit comfortable panes
      const cols = calculateOptimalColumns(5, 30, 20);

      // Should still return a valid column count (fallback mode)
      expect(cols).toBeGreaterThan(0);
      expect(cols).toBeLessThanOrEqual(5);
    });
  });
});
