#!/usr/bin/env node

/**
 * Standalone popup for choosing a single agent.
 * Styled to match the new prompt agent selector.
 */

import React, { useMemo, useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import * as fs from 'fs';
import { PopupContainer, PopupWrapper, writeSuccessAndExit } from './shared/index.js';
import { POPUP_CONFIG } from './config.js';
import {
  getAgentLabel,
  getAgentShortLabel,
  isAgentName,
  type AgentName,
} from '../../utils/agentLaunch.js';

interface AgentOption {
  id: AgentName;
  label?: string;
  description?: string;
  default?: boolean;
}

interface PopupData {
  title?: string;
  message?: string;
  options: AgentOption[];
}

interface SingleAgentChoicePopupProps {
  resultFile: string;
  data: PopupData;
}

const MAX_VISIBLE_ROWS = 10;

const SingleAgentChoicePopupApp: React.FC<SingleAgentChoicePopupProps> = ({
  resultFile,
  data,
}) => {
  const { exit } = useApp();
  const options = data.options;
  const defaultIndex = Math.max(0, options.findIndex((option) => option.default));
  const [selectedIndex, setSelectedIndex] = useState(defaultIndex);

  const visibleWindow = useMemo(() => {
    const total = options.length;
    const visibleCount = Math.min(MAX_VISIBLE_ROWS, total);

    if (visibleCount <= 0) {
      return { start: 0, end: 0, visibleCount: 0 };
    }

    const centeredStart = selectedIndex - Math.floor(visibleCount / 2);
    const boundedStart = Math.max(0, Math.min(centeredStart, total - visibleCount));
    const end = boundedStart + visibleCount;

    return { start: boundedStart, end, visibleCount };
  }, [options.length, selectedIndex]);

  useInput((_, key) => {
    if (options.length === 0) {
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(options.length - 1, prev + 1));
      return;
    }

    if (key.return) {
      const selected = options[selectedIndex];
      if (!selected) return;
      writeSuccessAndExit(resultFile, selected.id, exit);
    }
  });

  const visibleOptions = options.slice(visibleWindow.start, visibleWindow.end);
  const hasItemsAbove = visibleWindow.start > 0;
  const hasItemsBelow = visibleWindow.end < options.length;

  return (
    <PopupWrapper resultFile={resultFile}>
      <PopupContainer footer="↑↓ navigate • Enter select • ESC cancel">
        {data.message && (
          <Box marginBottom={1}>
            <Text dimColor>{data.message}</Text>
          </Box>
        )}

        {hasItemsAbove && (
          <Box>
            <Text dimColor>↑ more</Text>
          </Box>
        )}

        <Box flexDirection="column">
          {visibleOptions.map((option, visibleIndex) => {
            const index = visibleWindow.start + visibleIndex;
            const isSelected = index === selectedIndex;
            const marker = isSelected ? '◉' : '◎';

            return (
              <Box key={`${option.id}-${index}`}>
                <Text color={isSelected ? POPUP_CONFIG.successColor : 'white'} bold={isSelected}>
                  {marker}
                </Text>
                <Text
                  color={isSelected ? POPUP_CONFIG.titleColor : 'white'}
                  bold={isSelected}
                >
                  {' '}
                  {option.label || getAgentLabel(option.id)}
                </Text>
                <Text color={isSelected ? POPUP_CONFIG.titleColor : 'gray'}>
                  {' '}
                  {getAgentShortLabel(option.id)}
                </Text>
              </Box>
            );
          })}
        </Box>

        {hasItemsBelow && (
          <Box>
            <Text dimColor>↓ more</Text>
          </Box>
        )}
      </PopupContainer>
    </PopupWrapper>
  );
};

function main() {
  const resultFile = process.argv[2];
  const dataFile = process.argv[3];

  if (!resultFile || !dataFile) {
    console.error('Error: Result file and data file required');
    process.exit(1);
  }

  let parsed: PopupData;
  try {
    parsed = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  } catch {
    console.error('Error: Failed to parse data file');
    process.exit(1);
  }

  const validOptions = (parsed.options || []).filter((option) => isAgentName(option.id));

  render(
    <SingleAgentChoicePopupApp
      resultFile={resultFile}
      data={{
        ...parsed,
        options: validOptions,
      }}
    />
  );
}

main();
