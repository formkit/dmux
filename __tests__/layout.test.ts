import { describe, it, expect } from 'vitest';
import { calculateOptimalColumns, MIN_COMFORTABLE_WIDTH, MIN_COMFORTABLE_HEIGHT, generateSidebarGridLayout } from '../src/utils/tmux.js';
import { calculateOptimalLayout, DEFAULT_LAYOUT_CONFIG } from '../src/utils/layoutManager.js';

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

  describe('generateSidebarGridLayout - checksum fixes', () => {
    // Tests for the critical checksum bug fixes

    it('generates valid 4-digit hex checksum', () => {
      const layout = generateSidebarGridLayout(
        '%0', // control pane
        ['%1', '%2', '%3', '%4', '%5'], // 5 content panes
        40, // sidebar width
        203, // window width
        60, // window height
        3, // columns
        80 // max comfortable width
      );

      // Checksum should be exactly 4 hex digits
      const checksumMatch = layout.match(/^([0-9a-f]{4}),/);
      expect(checksumMatch).toBeTruthy();
      expect(checksumMatch![1]).toHaveLength(4);
    });

    it('checksum includes leading zeros when needed', () => {
      // Generate several layouts and verify all have 4-digit checksums
      const testCases = [
        { width: 200, panes: ['%1', '%2', '%3'] },
        { width: 201, panes: ['%1', '%2', '%3', '%4', '%5'] },
        { width: 203, panes: ['%1', '%2'] },
      ];

      testCases.forEach(({ width, panes }) => {
        const layout = generateSidebarGridLayout(
          '%0',
          panes,
          40,
          width,
          60,
          2,
          80
        );

        const checksum = layout.split(',')[0];
        expect(checksum).toHaveLength(4);
        expect(checksum).toMatch(/^[0-9a-f]{4}$/);
      });
    });

    it('generates identical layout structure at same dimensions', () => {
      const layout1 = generateSidebarGridLayout(
        '%0',
        ['%1', '%2', '%3', '%4', '%5'],
        40,
        201,
        60,
        3,
        80
      );

      const layout2 = generateSidebarGridLayout(
        '%0',
        ['%1', '%2', '%3', '%4', '%5'],
        40,
        201,
        60,
        3,
        80
      );

      // Layouts should be identical (deterministic)
      expect(layout1).toBe(layout2);
    });

    it('handles width 201 correctly (regression test)', () => {
      // This specific width was failing before checksum fix
      const layout = generateSidebarGridLayout(
        '%0',
        ['%1', '%2', '%3', '%4', '%5'],
        40,
        201,
        60,
        3,
        80
      );

      expect(layout).toBeTruthy();
      expect(layout).toContain('201x60'); // Window dimensions
      expect(layout).toContain('40x60'); // Sidebar
      expect(layout).toContain('160x'); // Content area width
    });

    it('handles width 203 correctly (regression test)', () => {
      // Another problematic width before fix
      const layout = generateSidebarGridLayout(
        '%0',
        ['%1', '%2', '%3', '%4', '%5'],
        40,
        203,
        60,
        3,
        80
      );

      expect(layout).toBeTruthy();
      expect(layout).toContain('203x60'); // Window dimensions
      expect(layout).toContain('40x60'); // Sidebar
      expect(layout).toContain('162x'); // Content area width
    });

    it('correctly calculates pane widths with remainder distribution', () => {
      // 3 columns, 160 width content = 53.33 per pane
      // Should distribute as: 54, 53, 53 (first pane gets remainder)
      const layout = generateSidebarGridLayout(
        '%0',
        ['%1', '%2', '%3'],
        40,
        201,
        60,
        3,
        80
      );

      // First pane should be 54 wide
      expect(layout).toContain('54x');
      // Other panes should be 52 or 53 wide
      expect(layout).toMatch(/5[23]x/);
    });

    it('generates correct absolute coordinates', () => {
      const layout = generateSidebarGridLayout(
        '%0',
        ['%1', '%2'],
        40,
        200,
        60,
        2,
        80
      );

      // Content should start at X=41 (sidebar 40 + border 1)
      expect(layout).toContain(',41,');

      // Second pane should be roughly at X=121 (41 + 80)
      expect(layout).toMatch(/,1[12][0-9],/);
    });
  });

  describe('calculateOptimalLayout - spacer logic', () => {
    it('chooses appropriate layout for 5 panes at various widths', () => {
      const widths = [180, 200, 201, 203, 220, 240];

      widths.forEach(width => {
        const layout = calculateOptimalLayout(5, width, 60, DEFAULT_LAYOUT_CONFIG);

        // Should always produce valid layout
        expect(layout.cols).toBeGreaterThan(0);
        expect(layout.rows).toBeGreaterThan(0);
        expect(layout.windowWidth).toBeLessThanOrEqual(width);

        // Pane width should be reasonable
        expect(layout.actualPaneWidth).toBeGreaterThan(0);
      });
    });

    it('prefers 3x2 grid for 5 panes in wide terminal', () => {
      const layout = calculateOptimalLayout(5, 200, 60, DEFAULT_LAYOUT_CONFIG);

      expect(layout.cols).toBe(3);
      expect(layout.rows).toBe(2);
    });

    it('constrains window width to avoid panes exceeding MAX_COMFORTABLE_WIDTH', () => {
      // Very wide terminal - should cap window width
      const layout = calculateOptimalLayout(2, 500, 60, DEFAULT_LAYOUT_CONFIG);

      // Window should be constrained, not full 500
      expect(layout.windowWidth).toBeLessThan(500);

      // Pane width should not exceed MAX_COMFORTABLE_WIDTH
      expect(layout.actualPaneWidth).toBeLessThanOrEqual(DEFAULT_LAYOUT_CONFIG.MAX_COMFORTABLE_WIDTH);
    });

    it('distributes panes evenly across columns', () => {
      const layout = calculateOptimalLayout(5, 200, 60, DEFAULT_LAYOUT_CONFIG);

      // 5 panes in 3 cols = [2, 2, 1]
      expect(layout.paneDistribution).toEqual([2, 2, 1]);
    });

    it('handles single pane (welcome screen)', () => {
      const layout = calculateOptimalLayout(0, 200, 60, DEFAULT_LAYOUT_CONFIG);

      expect(layout.cols).toBe(0);
      expect(layout.rows).toBe(0);
      expect(layout.paneDistribution).toEqual([]);
    });

    it('allows single-row layout when max pane width is reduced below default min', () => {
      const config = {
        ...DEFAULT_LAYOUT_CONFIG,
        MAX_COMFORTABLE_WIDTH: 40,
      };

      // 6 panes at max width 40 + sidebar/borders fits exactly in one row:
      // 40 (sidebar) + 6*40 + 5 borders = 285
      const layout = calculateOptimalLayout(6, 285, 60, config);

      expect(layout.cols).toBe(6);
      expect(layout.rows).toBe(1);
      expect(layout.actualPaneWidth).toBeLessThanOrEqual(40);
    });
  });
});
