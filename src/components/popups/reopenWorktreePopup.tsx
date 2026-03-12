#!/usr/bin/env node

/**
 * Popup for reopening closed worktrees
 * Shows a list of orphaned worktrees that can be reopened
 */

import React, { useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { PopupContainer, PopupWrapper, writeSuccessAndExit } from './shared/index.js';
import { PopupFooters, POPUP_CONFIG } from './config.js';

interface OrphanedWorktree {
  slug: string;
  path: string;
  lastModified: string; // ISO date string
  branch: string;
  hasUncommittedChanges: boolean;
}

interface ReopenWorktreePopupProps {
  resultFile: string;
  projectName?: string;
  worktrees: OrphanedWorktree[];
}

const MAX_VISIBLE_WORKTREES = 8;

/**
 * Format relative time (e.g., "2 hours ago", "3 days ago")
 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  }
  if (diffHours > 0) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }
  if (diffMinutes > 0) {
    return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
  }
  return 'just now';
}

function getVisibleWindow(totalItems: number, selectedIndex: number, maxVisible: number) {
  let startIndex = 0;
  let endIndex = Math.min(maxVisible, totalItems);

  if (selectedIndex >= endIndex) {
    endIndex = selectedIndex + 1;
    startIndex = Math.max(0, endIndex - maxVisible);
  } else if (selectedIndex < startIndex) {
    startIndex = selectedIndex;
    endIndex = Math.min(startIndex + maxVisible, totalItems);
  }

  if (selectedIndex >= maxVisible / 2 && totalItems > maxVisible) {
    startIndex = Math.max(0, selectedIndex - Math.floor(maxVisible / 2));
    endIndex = Math.min(startIndex + maxVisible, totalItems);
    startIndex = Math.max(0, endIndex - maxVisible);
  }

  return { startIndex, endIndex };
}

function getWorktreeDetails(worktree: OrphanedWorktree): string {
  const details: string[] = [];

  if (worktree.branch !== worktree.slug) {
    details.push(`branch:${worktree.branch}`);
  }

  if (worktree.hasUncommittedChanges) {
    details.push('dirty');
  }

  return details.join('  ');
}

export const ReopenWorktreePopupApp: React.FC<ReopenWorktreePopupProps> = ({
  resultFile,
  projectName,
  worktrees,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      setSelectedIndex(Math.min(worktrees.length - 1, selectedIndex + 1));
    } else if (key.return && worktrees.length > 0) {
      // User selected a worktree to reopen
      const selected = worktrees[selectedIndex];
      writeSuccessAndExit(resultFile, { slug: selected.slug, path: selected.path }, exit);
    }
  });

  if (worktrees.length === 0) {
    return (
      <PopupWrapper resultFile={resultFile}>
        <PopupContainer footer="Press ESC to close">
          <Box flexDirection="column">
            <Text>No closed worktrees found{projectName ? ` in ${projectName}` : ''}.</Text>
            <Text dimColor>All worktrees have active panes.</Text>
          </Box>
        </PopupContainer>
      </PopupWrapper>
    );
  }

  const totalWorktrees = worktrees.length;
  const { startIndex, endIndex } = getVisibleWindow(
    totalWorktrees,
    selectedIndex,
    MAX_VISIBLE_WORKTREES
  );
  const visibleWorktrees = worktrees.slice(startIndex, endIndex);
  const emptyRows = Math.max(0, MAX_VISIBLE_WORKTREES - visibleWorktrees.length);
  const moreAbove = startIndex > 0;
  const moreBelow = endIndex < totalWorktrees;

  return (
    <PopupWrapper resultFile={resultFile}>
      <PopupContainer footer={PopupFooters.choice()}>
        <Text>Please select a previously closed worktree to reopen.</Text>

        <Box
          flexDirection="column"
          borderStyle={POPUP_CONFIG.inputBorderStyle}
          borderColor={POPUP_CONFIG.borderColor}
          paddingX={1}
          marginTop={1}
          width="100%"
        >
          <Box>
            <Box width={34} paddingRight={1}>
              <Text dimColor>Worktree</Text>
            </Box>
            <Box width={16} paddingRight={1}>
              <Text dimColor>Last worked</Text>
            </Box>
            <Text dimColor>Status</Text>
          </Box>

          {visibleWorktrees.map((worktree, idx) => {
            const index = startIndex + idx;
            const isSelected = index === selectedIndex;
            const details = getWorktreeDetails(worktree);

            return (
              <Box key={worktree.slug}>
                <Box width={34} paddingRight={1}>
                  <Text
                    color={isSelected ? POPUP_CONFIG.titleColor : 'white'}
                    bold={isSelected}
                    wrap="truncate-end"
                  >
                    {isSelected ? '▶ ' : '  '}{worktree.slug}
                  </Text>
                </Box>
                <Box width={16} paddingRight={1}>
                  <Text
                    color={isSelected ? POPUP_CONFIG.titleColor : undefined}
                    dimColor={!isSelected}
                    wrap="truncate-end"
                  >
                    {formatRelativeTime(worktree.lastModified)}
                  </Text>
                </Box>
                <Text
                  color={worktree.hasUncommittedChanges ? 'yellow' : undefined}
                  dimColor={!worktree.hasUncommittedChanges}
                  wrap="truncate-end"
                >
                  {details || ' '}
                </Text>
              </Box>
            );
          })}

          {Array.from({ length: emptyRows }).map((_, index) => (
            <Box key={`empty-${index}`}>
              <Text> </Text>
            </Box>
          ))}

          <Box>
            <Text dimColor>
              {totalWorktrees} reopenable worktree{totalWorktrees === 1 ? '' : 's'}
              {moreAbove ? `  •  ${startIndex} above` : ''}
              {moreBelow ? `  •  ${totalWorktrees - endIndex} below` : ''}
            </Text>
          </Box>
        </Box>
      </PopupContainer>
    </PopupWrapper>
  );
};

// Entry point
function main() {
  const resultFile = process.argv[2];
  const dataFile = process.argv[3];

  if (!resultFile || !dataFile) {
    console.error('Error: Result file and data file required');
    process.exit(1);
  }

  let data: {
    projectName?: string;
    worktrees: OrphanedWorktree[];
  };

  try {
    const dataJson = fs.readFileSync(dataFile, 'utf-8');
    data = JSON.parse(dataJson);
  } catch (error) {
    console.error('Error: Failed to read or parse data file');
    process.exit(1);
  }

  render(
    <ReopenWorktreePopupApp
      resultFile={resultFile}
      projectName={data.projectName}
      worktrees={data.worktrees}
    />
  );
}

const entryPointHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entryPointHref) {
  main();
}
