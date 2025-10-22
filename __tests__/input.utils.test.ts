import { describe, it, expect } from 'vitest';
import { preprocessPastedContent, wrapText, findCursorInWrappedLines } from '../src/utils/input.js';

describe('input utils: paste sanitation', () => {
  it('removes ANSI and box drawing chars, normalizes newlines', () => {
    const dirty = '\x1b[31mred\x1b[0m box: ╭─╮\r\n next';
    const cleaned = preprocessPastedContent(dirty);
    expect(cleaned).toBe('red box:\nnext');
    expect(cleaned.includes('╭')).toBe(false);
  });
});

describe('input utils: wrapText', () => {
  it('wraps by words, returns multiple lines', () => {
    const text = 'alpha beta gamma delta epsilon zeta';
    const lines = wrapText(text, 12);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0].line.length).toBeLessThanOrEqual(12);
  });

  it('wraps at the exact moment of overflow on full word boundary', () => {
    const width = 10;
    const text = 'hello world'; // 11 chars incl space
    // Find the first index where wrapping occurs when adding the next char
    let breakIndex = -1;
    for (let i = 1; i < text.length; i++) {
      const before = wrapText(text.slice(0, i), width);
      const after = wrapText(text.slice(0, i + 1), width);
      if (before.length === 1 && after.length === 2) {
        breakIndex = i;
        // First wrapped line should be the full first word
        expect(after[0].line).toBe('hello');
        break;
      }
    }
    expect(breakIndex).toBeGreaterThan(0);
  });

  it('verifies char-by-char that wrap occurs only when adding the overflowing character', () => {
    const width = 20;
    const text = 'lorem ipsum dolor sit amet consectetur';

    // derive expected first-line after the first wrap
    let trigger = -1;
    let expectedFirst = '';
    for (let i = 1; i < text.length; i++) {
      const before = wrapText(text.slice(0, i), width);
      const after = wrapText(text.slice(0, i + 1), width);
      if (before.length === 1 && after.length > 1) {
        trigger = i;
        expectedFirst = after[0].line;
        break;
      }
    }
    expect(trigger).toBeGreaterThan(0);

    // For each i < trigger: single line, no premature wrap
    for (let i = 1; i < trigger; i++) {
      const wrapped = wrapText(text.slice(0, i), width);
      expect(wrapped.length).toBe(1);
    }

    // At trigger: wrap occurs and first line matches the computed full word
    const wrappedAtTrigger = wrapText(text.slice(0, trigger + 1), width);
    expect(wrappedAtTrigger.length).toBeGreaterThan(1);
    expect(wrappedAtTrigger[0].line).toBe(expectedFirst);
  });
});

describe('input utils: cursor mapping', () => {
  it('finds cursor position within wrapped lines', () => {
    const text = 'hello world this wraps nicely';
    const wrapped = wrapText(text, 10);
    // Cursor after 12 chars => second wrapped line
    const pos = findCursorInWrappedLines(wrapped, 12);
    expect(pos.line).toBeGreaterThan(0);
    expect(pos.col).toBeGreaterThanOrEqual(0);
  });
});
