#!/usr/bin/env node

/**
 * Popup for reopening closed worktrees
 * Shows a list of orphaned worktrees that can be reopened
 */

import React, { useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import * as fs from 'fs';
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
  worktrees: OrphanedWorktree[];
}

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

const ReopenWorktreePopupApp: React.FC<ReopenWorktreePopupProps> = ({
  resultFile,
  worktrees,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { exit } = useApp();
  const maxVisible = 8;

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
            <Text dimColor>No closed worktrees found.</Text>
            <Text dimColor>All worktrees have active panes.</Text>
          </Box>
        </PopupContainer>
      </PopupWrapper>
    );
  }

  const totalWorktrees = worktrees.length;
  let startIndex = 0;
  let endIndex = Math.min(maxVisible, totalWorktrees);

  if (selectedIndex >= endIndex) {
    endIndex = selectedIndex + 1;
    startIndex = Math.max(0, endIndex - maxVisible);
  } else if (selectedIndex < startIndex) {
    startIndex = selectedIndex;
    endIndex = Math.min(startIndex + maxVisible, totalWorktrees);
  }

  if (selectedIndex >= maxVisible / 2 && totalWorktrees > maxVisible) {
    startIndex = Math.max(0, selectedIndex - Math.floor(maxVisible / 2));
    endIndex = Math.min(startIndex + maxVisible, totalWorktrees);
    startIndex = Math.max(0, endIndex - maxVisible);
  }

  const visibleWorktrees = worktrees.slice(startIndex, endIndex);
  const showScrollIndicators = totalWorktrees > maxVisible;

  return (
    <PopupWrapper resultFile={resultFile}>
      <PopupContainer footer={PopupFooters.choice()}>
        <Box marginBottom={1}>
          <Text dimColor>Select a worktree to reopen:</Text>
        </Box>

        {showScrollIndicators && startIndex > 0 && (
          <Box marginBottom={1}>
            <Text dimColor>↑ {startIndex} more above</Text>
          </Box>
        )}

        {/* Worktree list */}
        <Box flexDirection="column">
          {visibleWorktrees.map((worktree, idx) => {
            const index = startIndex + idx;
            const isSelected = index === selectedIndex;
            return (
              <Box key={worktree.slug} marginBottom={idx < visibleWorktrees.length - 1 ? 1 : 0}>
                <Box flexDirection="column">
                  <Text
                    color={isSelected ? POPUP_CONFIG.titleColor : 'white'}
                    bold={isSelected}
                  >
                    {isSelected ? '▶ ' : '  '}
                    {worktree.slug}
                    {worktree.hasUncommittedChanges && (
                      <Text color="yellow"> *</Text>
                    )}
                  </Text>
                  <Box marginLeft={3}>
                    <Text dimColor>
                      {formatRelativeTime(worktree.lastModified)}
                      {worktree.branch !== worktree.slug && ` • branch: ${worktree.branch}`}
                    </Text>
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>

        {showScrollIndicators && endIndex < totalWorktrees && (
          <Box marginTop={1}>
            <Text dimColor>↓ {totalWorktrees - endIndex} more below</Text>
          </Box>
        )}

        {/* Legend */}
        <Box marginTop={1}>
          <Text dimColor italic>* = has uncommitted changes</Text>
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

  let data: { worktrees: OrphanedWorktree[] };

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
      worktrees={data.worktrees}
    />
  );
}

main();
