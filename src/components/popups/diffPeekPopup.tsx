#!/usr/bin/env node

/**
 * Standalone popup for file diff peeking.
 * Opens from merge uncommitted popup and closes back to the caller.
 */

import React, { useMemo, useState } from 'react';
import { render, Box, Text, useInput, useApp, useStdout } from 'ink';
import {
  PopupContainer,
  PopupWrapper,
  writeCancelAndExit,
} from './shared/index.js';
import { POPUP_CONFIG } from './config.js';

interface DiffPeekPopupData {
  filePath: string;
  targetBranch: string;
  diffMode: 'working-tree' | 'target-branch';
  diffText: string;
}

interface DiffPeekPopupProps {
  resultFile: string;
  data: DiffPeekPopupData;
}

function getLineColor(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'yellow';
  if (line.startsWith('+')) return 'green';
  if (line.startsWith('-')) return 'red';
  if (line.startsWith('@@')) return 'cyan';
  if (line.startsWith('diff --git') || line.startsWith('index ')) return POPUP_CONFIG.titleColor;
  return 'white';
}

const DiffPeekPopupApp: React.FC<DiffPeekPopupProps> = ({ resultFile, data }) => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [scrollOffset, setScrollOffset] = useState(0);

  const lines = useMemo(() => {
    const rawLines = data.diffText.split('\n');
    if (rawLines.length === 0 || (rawLines.length === 1 && rawLines[0] === '')) {
      return ['No diff output available.'];
    }
    return rawLines;
  }, [data.diffText]);

  const maxVisibleLines = Math.max(8, (stdout?.rows || 30) - 10);
  const maxOffset = Math.max(0, lines.length - maxVisibleLines);
  const visibleLines = lines.slice(scrollOffset, scrollOffset + maxVisibleLines);

  useInput((input, key) => {
    if (key.upArrow) {
      setScrollOffset((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setScrollOffset((prev) => Math.min(maxOffset, prev + 1));
      return;
    }

    if (key.pageUp) {
      setScrollOffset((prev) => Math.max(0, prev - maxVisibleLines));
      return;
    }

    if (key.pageDown) {
      setScrollOffset((prev) => Math.min(maxOffset, prev + maxVisibleLines));
      return;
    }

    if (input === 'q' || input === ' ' || key.return) {
      writeCancelAndExit(resultFile, exit);
    }
  });

  const comparatorLabel = data.diffMode === 'target-branch'
    ? `Compared to ${data.targetBranch}`
    : 'Compared to working tree base';

  return (
    <PopupWrapper resultFile={resultFile}>
      <PopupContainer footer="↑↓ scroll • PgUp/PgDn • Space/Enter/ESC close">
        <Box marginBottom={1} flexDirection="column">
          <Text bold color={POPUP_CONFIG.titleColor} wrap="truncate-end">
            {data.filePath}
          </Text>
          <Text dimColor>{comparatorLabel}</Text>
          <Text dimColor>
            Lines {Math.min(scrollOffset + 1, lines.length)}-{Math.min(scrollOffset + maxVisibleLines, lines.length)} of {lines.length}
          </Text>
        </Box>

        <Box flexDirection="column">
          {visibleLines.map((line, index) => (
            <Text
              key={`${scrollOffset + index}`}
              color={getLineColor(line)}
              wrap="truncate-end"
            >
              {line.length > 0 ? line : ' '}
            </Text>
          ))}
        </Box>
      </PopupContainer>
    </PopupWrapper>
  );
};

function main() {
  const resultFile = process.argv[2];
  const payloadArg = process.argv[3];

  if (!resultFile || !payloadArg) {
    console.error('Error: Result file and payload required');
    process.exit(1);
  }

  let data: DiffPeekPopupData;
  try {
    const parsed = JSON.parse(payloadArg) as Partial<DiffPeekPopupData>;
    data = {
      filePath: parsed.filePath || '(unknown file)',
      targetBranch: parsed.targetBranch || 'HEAD',
      diffMode: parsed.diffMode === 'target-branch' ? 'target-branch' : 'working-tree',
      diffText: parsed.diffText || 'No diff output available.',
    };
  } catch {
    console.error('Error: Failed to parse diff payload');
    process.exit(1);
  }

  render(<DiffPeekPopupApp resultFile={resultFile} data={data} />);
}

main();
