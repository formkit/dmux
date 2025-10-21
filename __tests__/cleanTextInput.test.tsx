import React, { useState } from 'react';
import React, { useState } from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import CleanTextInput from '../src/components/inputs/CleanTextInput.js';
import { wrapText } from '../src/utils/input.js';

const ESC = String.fromCharCode(27);
const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

async function type(stdin: any, str: string) {
  stdin.write(str);
  await sleep(5);
}

async function left(stdin: any, n = 1) {
  for (let i = 0; i < n; i++) { stdin.write(`${ESC}[D`); await sleep(2); }
}
async function right(stdin: any, n = 1) {
  for (let i = 0; i < n; i++) { stdin.write(`${ESC}[C`); await sleep(2); }
}
async function up(stdin: any, n = 1) {
  for (let i = 0; i < n; i++) { stdin.write(`${ESC}[A`); await sleep(2); }
}
async function down(stdin: any, n = 1) {
  for (let i = 0; i < n; i++) { stdin.write(`${ESC}[B`); await sleep(2); }
}
async function enter(stdin: any) { stdin.write('\r'); await sleep(5); }
async function backspace(stdin: any, n = 1) {
  for (let i = 0; i < n; i++) { stdin.write('\x7f'); await sleep(2); }
}

const Harness: React.FC<{ initial?: string, onSubmit?: (v?: string) => void }>= ({ initial = '', onSubmit }) => {
  const [val, setVal] = useState(initial);
  return (
    <CleanTextInput value={val} onChange={setVal} onSubmit={onSubmit} />
  );
};

describe('CleanTextInput basic editing', () => {
  it.skip('inserts and left/right arrows move cursor for insertion', async () => {
    const { stdin, lastFrame } = render(<Harness />);
    await sleep(80); // allow focus & bracketed paste mode setup
    await type(stdin, 'hello world');
    await left(stdin, 6); // before 'world'
    await type(stdin, 'X');
    // Value should be 'hello Xworld'
    const frame = stripAnsi(lastFrame()!);
    // Debug frame output
    // eslint-disable-next-line no-console
    console.log('FRAME-1', JSON.stringify(frame));
    expect(frame.includes('> hello Xworld')).toBe(true);
  });

  it.skip('backspace deletes before cursor', async () => {
    const { stdin, lastFrame } = render(<Harness initial="abc" />);
    await sleep(20);
    await backspace(stdin);
    const frame = stripAnsi(lastFrame()!);
    expect(frame.includes('> ab')).toBe(true);
  });
});

describe('CleanTextInput wrapping and movement', () => {
  it.skip('wraps long lines by word boundaries', async () => {
    const long = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua';
    const { stdin, lastFrame } = render(<Harness />);
    await sleep(50);
    await type(stdin, long);
    await sleep(20);
    const frame = stripAnsi(lastFrame()!);
    // Expect multiple visual lines indicated by prompt prefix on first line and spaces on wrapped ones
    expect(frame.split('\n').length).toBeGreaterThan(1);
    expect(frame.startsWith('> ')).toBe(true);
  });

  it.skip('up/down maintain approximate column across wrapped lines', async () => {
    const base = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty';
    const { stdin, lastFrame } = render(<Harness />);
    await sleep(50);
    await type(stdin, base);
    // Move cursor far left then down/up should not error and allow insertion
    await left(stdin, 10);
    await up(stdin);
    await type(stdin, 'X');
    const f = stripAnsi(lastFrame()!);
    expect(f.includes('X')).toBe(true);
  });
});

describe('CleanTextInput submit vs newline', () => {
  it.skip('enter submits current (expanded) value', async () => {
    let submitted: string | undefined;
    const { stdin } = render(<Harness initial="hello" onSubmit={(v) => submitted = v} />);
    await sleep(30);
    await enter(stdin);
    expect(submitted).toBe('hello');
  });
});

describe('CleanTextInput paste handling', () => {
  it.skip('bracketed paste small content inserts sanitized text', async () => {
    const { stdin, lastFrame } = render(<Harness />);
    await sleep(30);
    const dirty = `${PASTE_START}\x1b[31mred${ESC}[0m and box: ╭─╮${PASTE_END}`;
    // Write as actual sequences
    stdin.write(dirty.replace(/\\x1b/g, '\x1b'));
    await sleep(50);
    const f = stripAnsi(lastFrame()!);
    expect(f.includes('> red and box: ')).toBe(true);
    expect(f.includes('╭')).toBe(false);
  });

  it.skip('large multi-line paste injects tag then expands on submit', async () => {
    let submitted: string | undefined;
    const { stdin, lastFrame } = render(<Harness onSubmit={(v) => submitted = v} />);
    await sleep(30);
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i+1}`).join('\n');
    const seq = `${PASTE_START}${lines}${PASTE_END}`;
    stdin.write(seq);
    await sleep(50);
    let f = stripAnsi(lastFrame()!);
    // Expect a tag like [#1 Pasted, 20 lines]
    expect(f.includes('Pasted, 20 lines')).toBe(true);

    // Now submit and expect expansion to full content
    await enter(stdin);
    expect(submitted).toContain('line 20');
    expect(submitted?.split('\n').length).toBe(20);
  });
});
