import React, { useState } from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import CleanTextInput from '../src/CleanTextInput.js';
import { wrapText } from '../src/utils/input.js';

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

const Harness: React.FC = () => {
  const [val, setVal] = useState('');
  return <CleanTextInput value={val} onChange={setVal} />;
};

const makeCaptureHarness = (capture: (v: string) => void): React.FC => () => {
  const [val, setVal] = useState('');
  return <CleanTextInput value={val} onChange={(v) => { setVal(v); capture(v); }} />;
};

function typeChar(stdin: any, ch: string) {
  stdin.write(ch);
  return sleep(3);
}

function getLines(frame: string): string[] {
  const out = stripAnsi(frame);
  const lines = out.split('\n');
  // Remove the leading prompt from first line and the double-space from wrapped lines
  return lines.map((l, idx) => (idx === 0 ? l.replace(/^>\s/, '') : l.replace(/^\s{2}/, '')));
}

// Patch process.stdout.columns deterministically for this suite
let originalColumns: PropertyDescriptor | undefined;

describe('CleanTextInput: wrapping moment (char-by-char)', () => {
  beforeEach(() => {
    originalColumns = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
    Object.defineProperty(process.stdout, 'columns', { value: 27, configurable: true }); // maxWidth = 20
  });
  afterEach(() => {
    if (originalColumns) {
      Object.defineProperty(process.stdout, 'columns', originalColumns);
    }
  });

  it('wraps the full word exactly when overflow occurs', async () => {
    const width = 20; // due to columns-7
    const text = 'lorem ipsum dolor sit amet consectetur';

    // Find first index where wrapping occurs for the given width
    let wrapTriggerIndex = -1;
    let expectedFirstLine = '';
    for (let i = 1; i < text.length; i++) {
      const before = wrapText(text.slice(0, i), width);
      const after = wrapText(text.slice(0, i + 1), width);
      if (before.length === 1 && after.length > 1) {
        wrapTriggerIndex = i;
        expectedFirstLine = after[0].line; // should be a whole word
        break;
      }
    }
    expect(wrapTriggerIndex).toBeGreaterThan(0);

    const { stdin, lastFrame } = render(<Harness />);
    await sleep(60); // allow focus/paste mode setup

    // Type up to the character just before wrap
    for (let i = 0; i < wrapTriggerIndex; i++) {
      await typeChar(stdin, text[i]!);
    }
    let frame = lastFrame();
    expect(frame).toBeTruthy();
    let lines = getLines(frame!);
    // Still a single visual line
    expect(lines.length).toBe(1);

    // Type the character that causes the wrap
    await typeChar(stdin, text[wrapTriggerIndex]!);
    frame = lastFrame();
    lines = getLines(frame!);
    expect(lines.length).toBeGreaterThan(1);
    // First visual line must end at a full word boundary as computed by wrapText
    expect(lines[0]).toBe(expectedFirstLine);
  });
});

describe('CleanTextInput: cursor movement and multi-line', () => {
  let originalColumns2: PropertyDescriptor | undefined;
  beforeEach(() => {
    originalColumns2 = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
    Object.defineProperty(process.stdout, 'columns', { value: 80, configurable: true });
  });
  afterEach(() => {
    if (originalColumns2) {
      Object.defineProperty(process.stdout, 'columns', originalColumns2);
    }
  });

  const ESC = String.fromCharCode(27);
  function left(stdin: any, n = 1) { for (let i = 0; i < n; i++) { stdin.write(`${ESC}[D`); } return sleep(2); }
  function type(stdin: any, s: string) { stdin.write(s); return sleep(3); }

  it('left/right moves cursor and inserts at new position', async () => {
    let current = '';
    const Capturing = makeCaptureHarness((v) => { current = v; });
    const { stdin } = render(<Capturing />);
    await sleep(120);
    await type(stdin, 'hello world');
    await left(stdin, 6); // before 'world'
    await type(stdin, 'X');
    expect(current).toContain('hello Xworld');
  });

  it('accepts multi-line input via paste and preserves newlines', async () => {
    const { stdin, lastFrame } = render(<Harness />);
    await sleep(120);
    const lines = 'line1\nline2 with words';
    // Simulate paste by writing multi-line content directly
    stdin.write(lines);
    await sleep(200);
    const out = lastFrame()!;
    const display = getLines(out);
    expect(display.join('\n')).toContain('line1\nline2 with words');
  });
});
