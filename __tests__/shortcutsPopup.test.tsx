import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import { ShortcutsPopupApp } from '../src/components/popups/shortcutsPopup.js';

describe('ShortcutsPopupApp', () => {
  it('shows the focused-pane menu shortcut as Alt+Shift+M', () => {
    const { lastFrame } = render(
      <ShortcutsPopupApp
        resultFile="/tmp/dmux-shortcuts-result.json"
        hasSidebarLayout={true}
        isDevMode={false}
      />
    );

    const output = stripAnsi(lastFrame() ?? '');

    expect(output).toContain('[Alt+Shift+M]');
    expect(output).toContain('Open the pane menu for the focused tmux pane');
    expect(output).toContain('Press Alt+Shift+M in any focused pane');
    expect(output).not.toContain('[M-D]');
  });
});
