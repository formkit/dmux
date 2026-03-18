#!/usr/bin/env node

/**
 * Popup for resuming local or remote branches.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { PopupContainer, PopupWrapper, writeSuccessAndExit } from './shared/index.js';
import { POPUP_CONFIG } from './config.js';
import { getResumableBranches } from '../../utils/resumeBranches.js';

export interface ResumableBranch {
  branchName: string;
  slug?: string;
  path?: string;
  lastModified?: string; // ISO date string
  hasUncommittedChanges: boolean;
  hasWorktree: boolean;
  hasLocalBranch: boolean;
  hasRemoteBranch: boolean;
  isRemote: boolean;
}

export interface ReopenWorktreePopupState {
  includeWorktrees: boolean;
  includeLocalBranches: boolean;
  includeRemoteBranches: boolean;
  remoteLoaded: boolean;
  filterQuery: string;
}

export type ReopenWorktreePopupResult =
  {
    action: 'select';
    candidate: ResumableBranch;
  };

interface ReopenWorktreePopupProps {
  resultFile: string;
  projectName?: string;
  worktrees: ResumableBranch[];
  initialState: ReopenWorktreePopupState;
  projectRoot?: string;
  activePaneSlugs?: string[];
  loadRemoteBranches?: (projectRoot: string, activePaneSlugs: string[]) => ResumableBranch[];
}

const MAX_VISIBLE_WORKTREES = 8;
const CONTENT_BOX_WIDTH = 72;
const CONTENT_INNER_WIDTH = CONTENT_BOX_WIDTH - 4;
const BRANCH_COLUMN_WIDTH = 34;
const LAST_WORKED_COLUMN_WIDTH = 16;
const SOURCE_FILTERS = [
  { key: 'worktrees', label: 'Worktrees' },
  { key: 'local', label: 'Local' },
  { key: 'remote', label: 'Remote' },
] as const;

type SourceFilterKey = typeof SOURCE_FILTERS[number]['key'];
type FocusArea = 'list' | 'sources';

function toPopupBranch(
  worktree: ReturnType<typeof getResumableBranches>[number]
): ResumableBranch {
  return {
    branchName: worktree.branchName,
    slug: worktree.slug,
    path: worktree.path,
    lastModified: worktree.lastModified?.toISOString(),
    hasUncommittedChanges: worktree.hasUncommittedChanges,
    hasWorktree: worktree.hasWorktree,
    hasLocalBranch: worktree.hasLocalBranch,
    hasRemoteBranch: worktree.hasRemoteBranch,
    isRemote: worktree.isRemote,
  };
}

function loadRemoteResumableBranches(
  projectRoot: string,
  activePaneSlugs: string[]
): ResumableBranch[] {
  return getResumableBranches(projectRoot, activePaneSlugs, {
    includeRemoteBranches: true,
  }).map((candidate) => toPopupBranch(candidate));
}

function isFilterTypingInput(input: string, key: Record<string, boolean>): boolean {
  if (!input) {
    return false;
  }

  if (key.ctrl || key.meta || key.return || key.tab || key.escape) {
    return false;
  }

  if (
    key.upArrow
    || key.downArrow
    || key.leftArrow
    || key.rightArrow
    || key.pageUp
    || key.pageDown
  ) {
    return false;
  }

  return true;
}

/**
 * Format relative time (e.g., "2 hours ago", "3 days ago")
 */
function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) {
    return '--';
  }

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

function getWorktreeDetails(worktree: ResumableBranch): string {
  const details: string[] = [];

  if (worktree.hasRemoteBranch) {
    details.push('remote');
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
  initialState,
  projectRoot,
  activePaneSlugs = [],
  loadRemoteBranches = loadRemoteResumableBranches,
}) => {
  const [availableWorktrees, setAvailableWorktrees] = useState(worktrees);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filterQuery, setFilterQuery] = useState(initialState.filterQuery);
  const [includeWorktrees, setIncludeWorktrees] = useState(initialState.includeWorktrees);
  const [includeLocalBranches, setIncludeLocalBranches] = useState(initialState.includeLocalBranches);
  const [includeRemoteBranches, setIncludeRemoteBranches] = useState(initialState.includeRemoteBranches);
  const [remoteLoaded, setRemoteLoaded] = useState(initialState.remoteLoaded);
  const [isLoadingRemote, setIsLoadingRemote] = useState(false);
  const [remoteLoadError, setRemoteLoadError] = useState<string | null>(null);
  const [focusedSourceIndex, setFocusedSourceIndex] = useState(0);
  const [focusArea, setFocusArea] = useState<FocusArea>('list');
  const { exit } = useApp();

  useEffect(() => {
    setAvailableWorktrees(worktrees);
  }, [worktrees]);

  useEffect(() => {
    if (!includeRemoteBranches || remoteLoaded || !projectRoot) {
      return;
    }

    let cancelled = false;
    setIsLoadingRemote(true);
    setRemoteLoadError(null);

    const timer = setTimeout(() => {
      try {
        const remoteBranches = loadRemoteBranches(projectRoot, activePaneSlugs);

        if (cancelled) {
          return;
        }

        setAvailableWorktrees(remoteBranches);
        setRemoteLoaded(true);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setRemoteLoadError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setIsLoadingRemote(false);
        }
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    activePaneSlugs,
    includeRemoteBranches,
    loadRemoteBranches,
    projectRoot,
    remoteLoaded,
  ]);

  const sourceFilteredWorktrees = useMemo(() => (
    availableWorktrees.filter((worktree) => (
      (includeWorktrees && worktree.hasWorktree)
      || (includeLocalBranches && worktree.hasLocalBranch)
      || (includeRemoteBranches && worktree.hasRemoteBranch)
    ))
  ), [availableWorktrees, includeLocalBranches, includeRemoteBranches, includeWorktrees]);

  const filteredWorktrees = useMemo(() => {
    const normalizedQuery = filterQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return sourceFilteredWorktrees;
    }

    return sourceFilteredWorktrees.filter((worktree) => {
      const branchName = worktree.branchName.toLowerCase();
      const slug = worktree.slug?.toLowerCase() || '';
      return branchName.includes(normalizedQuery) || slug.includes(normalizedQuery);
    });
  }, [filterQuery, sourceFilteredWorktrees]);

  useEffect(() => {
    setSelectedIndex((current) => Math.min(
      current,
      Math.max(0, filteredWorktrees.length - 1)
    ));
  }, [filteredWorktrees.length]);

  const toggleSourceFilter = (sourceKey: SourceFilterKey) => {
    if (sourceKey === 'worktrees') {
      setIncludeWorktrees((current) => !current);
      setSelectedIndex(0);
      return;
    }

    if (sourceKey === 'local') {
      setIncludeLocalBranches((current) => !current);
      setSelectedIndex(0);
      return;
    }

    setIncludeRemoteBranches((current) => !current);
    setSelectedIndex(0);
  };

  useInput((input, key) => {
    if (key.tab) {
      setFocusArea((current) => current === 'list' ? 'sources' : 'list');
      return;
    }

    if (focusArea === 'sources') {
      if (key.leftArrow) {
        setFocusedSourceIndex((current) => Math.max(0, current - 1));
      } else if (key.rightArrow) {
        setFocusedSourceIndex((current) => Math.min(SOURCE_FILTERS.length - 1, current + 1));
      } else if (key.downArrow) {
        setFocusArea('list');
      } else if (input === '1') {
        setFocusedSourceIndex(0);
        toggleSourceFilter('worktrees');
      } else if (input === '2') {
        setFocusedSourceIndex(1);
        toggleSourceFilter('local');
      } else if (input === '3') {
        setFocusedSourceIndex(2);
        toggleSourceFilter('remote');
      } else if (input === ' ' || key.return) {
        toggleSourceFilter(SOURCE_FILTERS[focusedSourceIndex]?.key ?? 'worktrees');
      }
      return;
    }

    if (key.backspace || key.delete) {
      setFilterQuery((current) => current.slice(0, -1));
      setSelectedIndex(0);
    } else if (isFilterTypingInput(input, key)) {
      setFilterQuery((current) => `${current}${input}`);
      setSelectedIndex(0);
    } else if (key.leftArrow || (key.upArrow && selectedIndex === 0)) {
      setFocusArea('sources');
    } else if (key.upArrow) {
      setSelectedIndex((current) => Math.max(0, current - 1));
    } else if (key.downArrow) {
      setSelectedIndex((current) => (
        filteredWorktrees.length === 0
          ? 0
          : Math.min(filteredWorktrees.length - 1, current + 1)
      ));
    } else if (key.return && filteredWorktrees.length > 0 && !isLoadingRemote) {
      const selected = filteredWorktrees[selectedIndex];
      writeSuccessAndExit<ReopenWorktreePopupResult>(resultFile, {
        action: 'select',
        candidate: selected,
      }, exit);
    }
  });

  const totalWorktrees = availableWorktrees.length;
  const totalSourceFilteredWorktrees = sourceFilteredWorktrees.length;
  const totalFilteredWorktrees = filteredWorktrees.length;
  const showEmptyState = totalFilteredWorktrees === 0;
  const { startIndex, endIndex } = getVisibleWindow(
    totalFilteredWorktrees,
    selectedIndex,
    MAX_VISIBLE_WORKTREES
  );
  const visibleWorktrees = filteredWorktrees.slice(startIndex, endIndex);
  const emptyRows = showEmptyState
    ? 0
    : Math.max(0, MAX_VISIBLE_WORKTREES - visibleWorktrees.length);
  const moreAbove = startIndex > 0;
  const moreBelow = endIndex < totalFilteredWorktrees;
  const filterActive = filterQuery.trim().length > 0;
  const filterDisplay = filterQuery || 'Search branches';
  const filterCursor = focusArea === 'list' ? '|' : '';
  const searchFocused = focusArea === 'list';
  const footer = focusArea === 'sources'
    ? '←→ move • Space toggle • ↓ back • 1/2/3 quick toggle • ESC cancel'
    : 'Type filter • ↑↓ navigate • ↑/← filters • Enter resume • ESC cancel';
  const filterMessage = isLoadingRemote
    ? 'Loading remote branches...'
    : remoteLoadError
      ? `Remote scan failed: ${remoteLoadError}`
      : filterActive
        ? `No matches for "${filterQuery}"`
        : totalSourceFilteredWorktrees === 0 && !remoteLoaded && !includeRemoteBranches
          ? 'No local branches or worktrees. Enable remote to scan remotes.'
          : 'No branches match the selected sources.';
  const remoteLabel = isLoadingRemote ? 'Remote…' : 'Remote';
  const remoteLabelColor = remoteLoadError
    ? POPUP_CONFIG.errorColor
    : isLoadingRemote
      ? POPUP_CONFIG.titleColor
      : undefined;

  return (
    <PopupWrapper resultFile={resultFile}>
      <PopupContainer footer={footer}>
        <Box
          borderStyle={POPUP_CONFIG.inputBorderStyle}
          borderColor={searchFocused ? POPUP_CONFIG.inputBorderColor : POPUP_CONFIG.borderColor}
          paddingX={1}
          marginTop={1}
          width={CONTENT_BOX_WIDTH}
          flexDirection="column"
        >
          <Box width={CONTENT_INNER_WIDTH}>
            <Text bold color={searchFocused ? POPUP_CONFIG.inputBorderColor : POPUP_CONFIG.borderColor}>
              {' '}
            </Text>
            <Text
              color={searchFocused ? 'white' : undefined}
              dimColor={!filterQuery}
              wrap="truncate-end"
            >
              {`${filterDisplay}${filterCursor}`}
            </Text>
          </Box>
        </Box>

        <Box
          borderStyle={POPUP_CONFIG.inputBorderStyle}
          borderColor={focusArea === 'sources' ? POPUP_CONFIG.inputBorderColor : POPUP_CONFIG.borderColor}
          paddingX={1}
          marginTop={1}
          width={CONTENT_BOX_WIDTH}
          flexDirection="column"
        >
          <Box width={CONTENT_INNER_WIDTH}>
            {SOURCE_FILTERS.map((source, index) => {
              const isFocused = focusArea === 'sources' && focusedSourceIndex === index;
              const isEnabled = source.key === 'worktrees'
                ? includeWorktrees
                : source.key === 'local'
                  ? includeLocalBranches
                  : includeRemoteBranches;
              const marker = isEnabled ? '◉' : '◎';
              const label = source.key === 'remote' ? remoteLabel : source.label;
              const color = source.key === 'remote' && remoteLabelColor
                ? remoteLabelColor
                : isFocused
                  ? POPUP_CONFIG.titleColor
                  : 'white';

              return (
                <Box key={source.key} marginRight={2}>
                  <Text color={isEnabled ? POPUP_CONFIG.successColor : POPUP_CONFIG.dimColor} bold={isEnabled}>
                    {marker}
                  </Text>
                  <Text
                    color={color}
                    bold={isFocused}
                  >
                    {' '}{label}
                  </Text>
                </Box>
              );
            })}
          </Box>
        </Box>

        <Box
          flexDirection="column"
          borderStyle={POPUP_CONFIG.inputBorderStyle}
          borderColor={POPUP_CONFIG.borderColor}
          paddingX={1}
          marginTop={1}
          width={CONTENT_BOX_WIDTH}
        >
          <Box width={CONTENT_INNER_WIDTH}>
            <Box width={BRANCH_COLUMN_WIDTH} paddingRight={1}>
              <Text dimColor>Branch</Text>
            </Box>
            <Box width={LAST_WORKED_COLUMN_WIDTH} paddingRight={1}>
              <Text dimColor>Last worked</Text>
            </Box>
            <Box flexGrow={1}>
              <Text dimColor>Status</Text>
            </Box>
          </Box>

          {showEmptyState ? (
            <Box width={CONTENT_INNER_WIDTH}>
              <Text dimColor wrap="truncate-end">
                {filterMessage}
              </Text>
            </Box>
          ) : (
            visibleWorktrees.map((worktree, idx) => {
              const index = startIndex + idx;
              const isSelected = index === selectedIndex;
              const details = getWorktreeDetails(worktree);

              return (
                <Box key={worktree.branchName} width={CONTENT_INNER_WIDTH}>
                  <Box width={BRANCH_COLUMN_WIDTH} paddingRight={1}>
                    <Text
                      color={isSelected ? POPUP_CONFIG.titleColor : 'white'}
                      bold={isSelected}
                      wrap="truncate-end"
                    >
                      {isSelected ? '▶ ' : '  '}{worktree.branchName}
                    </Text>
                  </Box>
                  <Box width={LAST_WORKED_COLUMN_WIDTH} paddingRight={1}>
                    <Text
                      color={isSelected ? POPUP_CONFIG.titleColor : undefined}
                      dimColor={!isSelected}
                      wrap="truncate-end"
                    >
                      {formatRelativeTime(worktree.lastModified)}
                    </Text>
                  </Box>
                  <Box flexGrow={1}>
                    <Text
                      color={worktree.hasUncommittedChanges ? 'yellow' : undefined}
                      dimColor={!worktree.hasUncommittedChanges}
                      wrap="truncate-end"
                    >
                      {details || ' '}
                    </Text>
                  </Box>
                </Box>
              );
            })
          )}

          {Array.from({ length: emptyRows }).map((_, index) => (
            <Box key={`empty-${index}`} width={CONTENT_INNER_WIDTH}>
              <Text> </Text>
            </Box>
          ))}

          <Box width={CONTENT_INNER_WIDTH}>
            <Text dimColor>
              {totalFilteredWorktrees} of {totalWorktrees} resumable branch{totalWorktrees === 1 ? '' : 'es'}
              {moreAbove ? `  •  ${startIndex} above` : ''}
              {moreBelow ? `  •  ${totalFilteredWorktrees - endIndex} below` : ''}
              {filterActive ? '  •  filtered' : ''}
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
    worktrees: ResumableBranch[];
    initialState?: ReopenWorktreePopupState;
    projectRoot?: string;
    activePaneSlugs?: string[];
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
      initialState={data.initialState ?? {
        includeWorktrees: true,
        includeLocalBranches: true,
        includeRemoteBranches: false,
        remoteLoaded: false,
        filterQuery: '',
      }}
      projectRoot={data.projectRoot}
      activePaneSlugs={data.activePaneSlugs}
    />
  );
}

const entryPointHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entryPointHref) {
  main();
}
