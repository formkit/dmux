import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import stringWidth from 'string-width';
import path from 'path';
import { spawn } from 'child_process';
import {
  buildBrowserSearchEntries,
  buildBrowserTree,
  computeModifiedTimes,
  flattenBrowserTree,
  getAncestorPaths,
  getCurrentDirectoryPath,
  getStatusColor,
  loadBrowserSnapshot,
  loadCodePreview,
  loadDiffPreview,
  type BrowserFilterMode,
  type BrowserSortMode,
  type BrowserVisibleEntry,
} from './utils/fileBrowser.js';
import { POPUP_CONFIG } from './components/popups/config.js';
import { COLORS } from './theme/colors.js';

type PreviewMode = 'code' | 'diff';

interface SortOption {
  id: string;
  label: string;
  description: string;
}

const SORT_OPTIONS: SortOption[] = [
  { id: 'sort-name', label: 'Sort by name', description: 'Alphabetical tree order' },
  { id: 'sort-modified', label: 'Sort by modified time', description: 'Recently touched files first' },
  { id: 'sort-status', label: 'Sort by git status', description: 'Changed files first' },
  { id: 'filter-all', label: 'Show all files', description: 'Tracked and untracked files' },
  { id: 'filter-diffed', label: 'Show changed files only', description: 'Only files with git changes' },
];

function clipToWidth(value: string, maxWidth: number): string {
  if (maxWidth <= 0 || stringWidth(value) <= maxWidth) {
    return maxWidth <= 0 ? '' : value;
  }

  let clipped = '';
  let width = 0;
  for (const char of value) {
    const charWidth = stringWidth(char);
    if (width + charWidth > Math.max(1, maxWidth - 1)) {
      break;
    }
    clipped += char;
    width += charWidth;
  }

  return `${clipped}…`;
}

function clipFromLeft(value: string, maxWidth: number): string {
  if (maxWidth <= 0 || stringWidth(value) <= maxWidth) {
    return maxWidth <= 0 ? '' : value;
  }

  const ellipsis = '…';
  let clipped = '';

  for (const char of Array.from(value).reverse()) {
    if (stringWidth(`${ellipsis}${clipped}`) + stringWidth(char) > maxWidth) {
      break;
    }

    clipped = `${char}${clipped}`;
  }

  return `${ellipsis}${clipped}`;
}

function clipPathToWidth(value: string, maxWidth: number): string {
  if (maxWidth <= 0 || stringWidth(value) <= maxWidth) {
    return maxWidth <= 0 ? '' : value;
  }

  const segments = value.split('/');
  let visibleTail = segments.pop() || value;

  while (segments.length > 0) {
    const candidate = `${segments[segments.length - 1]}/${visibleTail}`;
    if (stringWidth(`…/${candidate}`) > maxWidth) {
      break;
    }

    visibleTail = candidate;
    segments.pop();
  }

  const prefixed = `…/${visibleTail}`;
  if (stringWidth(prefixed) <= maxWidth) {
    return prefixed;
  }

  return clipFromLeft(value, maxWidth);
}

function getVisibleRange(selectedIndex: number, totalItems: number, maxVisible: number) {
  if (totalItems <= maxVisible) {
    return { start: 0, end: totalItems };
  }

  const half = Math.floor(maxVisible / 2);
  let start = Math.max(0, selectedIndex - half);
  let end = Math.min(totalItems, start + maxVisible);

  if (end - start < maxVisible) {
    start = Math.max(0, end - maxVisible);
  }

  return { start, end };
}

function getTrailingRowCount(totalRows: number, renderedRows: number): number {
  return Math.max(0, totalRows - renderedRows);
}

function renderSingleLine(value: string): string {
  return value.length > 0 ? value : ' ';
}

function readTerminalSize(stdout?: { columns?: number; rows?: number }) {
  return {
    columns: process.stdout.columns ?? stdout?.columns ?? 120,
    rows: process.stdout.rows ?? stdout?.rows ?? 40,
  };
}

function openInSystem(targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let command = '';
    let args: string[] = [];

    if (process.platform === 'darwin') {
      command = 'open';
      args = [targetPath];
    } else if (process.platform === 'win32') {
      command = 'cmd';
      args = ['/c', 'start', '', targetPath];
    } else {
      command = 'xdg-open';
      args = [targetPath];
    }

    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });

    child.once('error', reject);
    child.once('spawn', resolve);
    child.unref();
  });
}

function getSortOptionIndex(sortMode: BrowserSortMode, filterMode: BrowserFilterMode): number {
  if (filterMode === 'diffed') {
    return SORT_OPTIONS.findIndex((option) => option.id === 'filter-diffed');
  }

  return SORT_OPTIONS.findIndex((option) => option.id === `sort-${sortMode}`);
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

function getSearchEntryIcon(entry: BrowserVisibleEntry): string {
  if (entry.type === 'directory') {
    return '';
  }

  return '';
}

function getSearchEntryColor(entry: BrowserVisibleEntry): string {
  if (!entry.exists) {
    return COLORS.error;
  }

  if (entry.type === 'directory') {
    return 'blue';
  }

  return 'white';
}

const FileBrowserApp: React.FC = () => {
  const rootPath = process.cwd();
  const projectLabel = path.basename(rootPath);
  const { stdout } = useStdout();
  const [terminalSize, setTerminalSize] = useState(() => readTerminalSize(stdout));
  const terminalHeight = terminalSize.rows;
  const terminalWidth = terminalSize.columns;

  const [snapshot, setSnapshot] = useState(() => loadBrowserSnapshot(rootPath));
  const [sortMode, setSortMode] = useState<BrowserSortMode>('name');
  const [filterMode, setFilterMode] = useState<BrowserFilterMode>('all');
  const [filterQuery, setFilterQuery] = useState('');
  const [listFocused, setListFocused] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sortMenuIndex, setSortMenuIndex] = useState(() => getSortOptionIndex('name', 'all'));
  const [viewerPath, setViewerPath] = useState<string | null>(null);
  const [viewerMode, setViewerMode] = useState<PreviewMode>('code');
  const [viewerScroll, setViewerScroll] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [modifiedTimes, setModifiedTimes] = useState<Map<string, number> | null>(null);

  useEffect(() => {
    if (!statusMessage) {
      return;
    }

    const timer = setTimeout(() => setStatusMessage(''), 2500);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  useEffect(() => {
    const refreshTerminalSize = () => {
      setTerminalSize((current) => {
        const next = readTerminalSize(stdout);
        if (current.columns === next.columns && current.rows === next.rows) {
          return current;
        }
        return next;
      });
    };

    // A freshly split tmux pane can report a transient width on first paint.
    // Refresh once immediately and again shortly after mount to pick up the final size
    // without waiting for user input.
    refreshTerminalSize();
    const refreshTimers = [16, 80, 180].map((delay) => setTimeout(refreshTerminalSize, delay));

    process.stdout.on('resize', refreshTerminalSize);

    return () => {
      refreshTimers.forEach((timer) => clearTimeout(timer));
      process.stdout.off('resize', refreshTerminalSize);
    };
  }, [stdout]);

  const filterActive = filterQuery.trim().length > 0;

  const treeNodes = useMemo(
    () =>
      buildBrowserTree(snapshot, {
        sortMode,
        filterMode,
        modifiedTimes: sortMode === 'modified' ? modifiedTimes || undefined : undefined,
        filterQuery: '',
        activePath: viewerPath || selectedPath,
      }),
    [snapshot, sortMode, filterMode, modifiedTimes, viewerPath, selectedPath]
  );

  const visibleEntries = useMemo(() => {
    if (filterActive) {
      return buildBrowserSearchEntries(snapshot, {
        sortMode,
        filterMode,
        modifiedTimes: sortMode === 'modified' ? modifiedTimes || undefined : undefined,
        filterQuery,
        activePath: viewerPath || selectedPath,
      });
    }

    return flattenBrowserTree(treeNodes, expandedPaths);
  }, [
    filterActive,
    snapshot,
    sortMode,
    filterMode,
    modifiedTimes,
    filterQuery,
    viewerPath,
    selectedPath,
    treeNodes,
    expandedPaths,
  ]);

  const entryByPath = useMemo(
    () => new Map(visibleEntries.map((entry) => [entry.path, entry])),
    [visibleEntries]
  );

  useEffect(() => {
    if (visibleEntries.length === 0) {
      setSelectedPath(null);
      setListFocused(false);
      return;
    }

    if (!selectedPath || !entryByPath.has(selectedPath)) {
      setSelectedPath(visibleEntries[0].path);
    }
  }, [visibleEntries, selectedPath, entryByPath]);

  const selectedIndex = selectedPath
    ? Math.max(0, visibleEntries.findIndex((entry) => entry.path === selectedPath))
    : 0;
  const selectedEntry = visibleEntries[selectedIndex];

  const viewerFile = useMemo(
    () => snapshot.files.find((file) => file.path === viewerPath),
    [snapshot, viewerPath]
  );

  const previewLines = useMemo(() => {
    if (!viewerPath) {
      return [];
    }

    if (viewerMode === 'diff') {
      return loadDiffPreview(rootPath, viewerPath, viewerFile?.statusLabel || '');
    }

    return loadCodePreview(rootPath, viewerPath);
  }, [rootPath, viewerPath, viewerMode, viewerFile?.statusLabel]);

  const headerRows = 2;
  const searchRows = 3;
  const footerRows = 2;
  const contentBoxHeight = Math.max(10, terminalHeight - headerRows - searchRows - footerRows);
  const contentRows = Math.max(6, contentBoxHeight);
  const listBodyRows = Math.max(1, contentRows - 1);
  const viewerBodyRows = Math.max(4, contentRows - 2);
  const currentViewerMaxOffset = Math.max(0, previewLines.length - viewerBodyRows);

  useEffect(() => {
    setViewerScroll((current) => Math.min(current, currentViewerMaxOffset));
  }, [currentViewerMaxOffset]);

  const refreshSnapshot = () => {
    const nextSnapshot = loadBrowserSnapshot(rootPath);
    setSnapshot(nextSnapshot);

    if (sortMode === 'modified') {
      setModifiedTimes(computeModifiedTimes(rootPath, nextSnapshot.files.map((file) => file.path)));
    } else {
      setModifiedTimes(null);
    }

    setStatusMessage('Refreshed');
  };

  const ensureModifiedSortData = (nextSnapshot = snapshot) => {
    if (modifiedTimes) {
      return modifiedTimes;
    }

    const nextTimes = computeModifiedTimes(
      rootPath,
      nextSnapshot.files.map((file) => file.path)
    );
    setModifiedTimes(nextTimes);
    return nextTimes;
  };

  const selectPathAndExpand = (nextPath: string) => {
    const ancestors = getAncestorPaths(nextPath);
    setExpandedPaths((current) => {
      const next = new Set(current);
      ancestors.forEach((ancestor) => next.add(ancestor));
      return next;
    });
    setSelectedPath(nextPath);
  };

  const revealDirectoryFromSearch = (directoryPath: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      getAncestorPaths(directoryPath).forEach((ancestor) => next.add(ancestor));
      next.add(directoryPath);
      return next;
    });
    setSelectedPath(directoryPath);
    setFilterQuery('');
    setListFocused(true);
  };

  const openViewer = (nextPath: string) => {
    const file = snapshot.files.find((candidate) => candidate.path === nextPath);
    selectPathAndExpand(nextPath);
    setViewerPath(nextPath);
    setViewerMode(file?.exists === false ? 'diff' : 'code');
    setViewerScroll(0);
    setSortMenuOpen(false);
    setListFocused(true);
  };

  const toggleExpanded = (entry: BrowserVisibleEntry) => {
    if (entry.type !== 'directory') {
      openViewer(entry.path);
      return;
    }

    if (filterActive) {
      revealDirectoryFromSearch(entry.path);
      return;
    }

    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(entry.path)) {
        next.delete(entry.path);
      } else {
        next.add(entry.path);
      }
      return next;
    });
  };

  const handleOpenCurrentDirectory = async () => {
    const activeEntry = viewerPath
      ? ({
          path: viewerPath,
          parentPath: viewerFile?.parentPath || null,
          type: 'file',
        } as const)
      : selectedEntry;

    const targetPath = getCurrentDirectoryPath(rootPath, activeEntry);

    try {
      await openInSystem(targetPath);
      setStatusMessage(`Opened ${targetPath}`);
    } catch (error) {
      setStatusMessage(
        `Failed to open ${targetPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  const applySortSelection = (optionId: string) => {
    if (optionId === 'sort-name') {
      setSortMode('name');
      setSortMenuOpen(false);
      return;
    }

    if (optionId === 'sort-modified') {
      ensureModifiedSortData();
      setSortMode('modified');
      setSortMenuOpen(false);
      return;
    }

    if (optionId === 'sort-status') {
      setSortMode('status');
      setSortMenuOpen(false);
      return;
    }

    if (optionId === 'filter-all') {
      setFilterMode('all');
      setSortMenuOpen(false);
      return;
    }

    if (optionId === 'filter-diffed') {
      setFilterMode('diffed');
      setSortMenuOpen(false);
    }
  };

  const backOutFromTree = () => {
    if (filterActive) {
      setFilterQuery('');
      setListFocused(false);
      return;
    }

    if (!listFocused) {
      setStatusMessage('File browser stays open. Use pane controls to close it.');
      return;
    }

    if (!selectedEntry) {
      setListFocused(false);
      return;
    }

    if (selectedEntry.type === 'directory' && selectedEntry.isExpanded) {
      setExpandedPaths((current) => {
        const next = new Set(current);
        next.delete(selectedEntry.path);
        return next;
      });
      return;
    }

    if (selectedEntry.parentPath) {
      setSelectedPath(selectedEntry.parentPath);
      return;
    }

    setListFocused(false);
  };

  useInput(async (input, key) => {
    if (key.ctrl && input === 'c') {
      process.exit(0);
      return;
    }

    if (viewerPath) {
      if (key.escape) {
        setViewerPath(null);
        setViewerScroll(0);
        return;
      }

      if (input === 'd' || key.tab) {
        setViewerMode((current) => (current === 'code' ? 'diff' : 'code'));
        setViewerScroll(0);
        return;
      }

      if (input === 'o') {
        await handleOpenCurrentDirectory();
        return;
      }

      if (key.upArrow) {
        setViewerScroll((current) => Math.max(0, current - 1));
        return;
      }

      if (key.downArrow) {
        setViewerScroll((current) => Math.min(currentViewerMaxOffset, current + 1));
        return;
      }

      if (key.pageUp) {
        setViewerScroll((current) => Math.max(0, current - viewerBodyRows));
        return;
      }

      if (key.pageDown) {
        setViewerScroll((current) => Math.min(currentViewerMaxOffset, current + viewerBodyRows));
      }
      return;
    }

    if (sortMenuOpen) {
      if (key.escape) {
        setSortMenuOpen(false);
        return;
      }

      if (key.upArrow) {
        setSortMenuIndex((current) => Math.max(0, current - 1));
        return;
      }

      if (key.downArrow) {
        setSortMenuIndex((current) => Math.min(SORT_OPTIONS.length - 1, current + 1));
        return;
      }

      if (key.return) {
        applySortSelection(SORT_OPTIONS[sortMenuIndex]?.id || '');
      }
      return;
    }

    if (key.backspace || key.delete || input === '\x7f' || input === '\x08') {
      if (filterQuery.length > 0) {
        setFilterQuery((current) => current.slice(0, -1));
      }
      return;
    }

    if (key.ctrl && input === 'u') {
      setFilterQuery('');
      setListFocused(false);
      return;
    }

    if (key.escape) {
      backOutFromTree();
      return;
    }

    if (input === 'S') {
      setSortMenuIndex(getSortOptionIndex(sortMode, filterMode));
      setSortMenuOpen(true);
      return;
    }

    if (input === 'O') {
      await handleOpenCurrentDirectory();
      return;
    }

    if (input === 'R') {
      refreshSnapshot();
      return;
    }

    if (input === 'P') {
      setListFocused(false);
      return;
    }

    if (isFilterTypingInput(input, key)) {
      setFilterQuery((current) => `${current}${input}`);
      return;
    }

    if (!selectedEntry) {
      return;
    }

    if (key.upArrow) {
      if (!listFocused) {
        return;
      }

      if (selectedIndex <= 0) {
        setListFocused(false);
        return;
      }

      setSelectedPath(visibleEntries[selectedIndex - 1]?.path || selectedEntry.path);
      return;
    }

    if (key.downArrow) {
      if (!listFocused) {
        if (visibleEntries.length > 0) {
          setListFocused(true);
          setSelectedPath(visibleEntries[0].path);
        }
        return;
      }

      const nextIndex = Math.min(visibleEntries.length - 1, selectedIndex + 1);
      setSelectedPath(visibleEntries[nextIndex]?.path || selectedEntry.path);
      return;
    }

    if (key.leftArrow) {
      if (!listFocused) {
        return;
      }

      if (filterActive) {
        setListFocused(false);
        return;
      }

      if (selectedEntry.type === 'directory' && selectedEntry.isExpanded) {
        setExpandedPaths((current) => {
          const next = new Set(current);
          next.delete(selectedEntry.path);
          return next;
        });
        return;
      }

      if (selectedEntry.parentPath) {
        setSelectedPath(selectedEntry.parentPath);
      }
      return;
    }

    if (key.rightArrow) {
      if (!listFocused) {
        if (visibleEntries.length > 0) {
          setListFocused(true);
        }
        return;
      }

      if (selectedEntry.type === 'directory') {
        if (filterActive) {
          revealDirectoryFromSearch(selectedEntry.path);
        } else if (!selectedEntry.isExpanded) {
          setExpandedPaths((current) => new Set(current).add(selectedEntry.path));
        } else {
          const firstChild = visibleEntries[selectedIndex + 1];
          if (firstChild && firstChild.parentPath === selectedEntry.path) {
            setSelectedPath(firstChild.path);
          }
        }
      } else {
        openViewer(selectedEntry.path);
      }
      return;
    }

    if (key.return) {
      if (!listFocused) {
        if (visibleEntries.length > 0) {
          setListFocused(true);
        }
        return;
      }

      toggleExpanded(selectedEntry);
    }
  });

  const listRange = getVisibleRange(selectedIndex, visibleEntries.length, listBodyRows);
  const visibleListItems = visibleEntries.slice(listRange.start, listRange.end);
  const visiblePreviewLines = previewLines.slice(
    viewerScroll,
    viewerScroll + viewerBodyRows
  );

  const frameWidth = Math.max(30, terminalWidth - 2);
  const searchWidth = frameWidth;
  const searchInnerWidth = Math.max(24, searchWidth - 2);
  const contentWidth = frameWidth;
  const rowMarkerWidth = 2;
  const searchIconWidth = filterActive ? 2 : 0;
  const statusColumnWidth = 4;
  const itemLabelWidth = Math.max(
    10,
    contentWidth - rowMarkerWidth - searchIconWidth - statusColumnWidth
  );
  const filterFocused = !viewerPath && !sortMenuOpen && !listFocused;
  const filterDisplay = filterQuery || 'Search files and directories';
  const filterCursor = filterFocused ? '|' : '';
  const listTrailingRows = getTrailingRowCount(listBodyRows, visibleListItems.length);
  const viewerTrailingRows = getTrailingRowCount(viewerBodyRows, visiblePreviewLines.length);
  const sortMenuRenderedRows = SORT_OPTIONS.length + 1;
  const sortTrailingRows = getTrailingRowCount(contentRows, sortMenuRenderedRows);
  const sectionTitle = viewerPath
    ? ' Quick View'
    : sortMenuOpen
      ? ' Sort and Filter'
      : filterActive
        ? ' Search Results'
        : ' Explorer';
  const sectionSummary = viewerPath
    ? `${viewerMode === 'code' ? 'Code view' : 'Diff view'} • Lines ${Math.min(
        viewerScroll + 1,
        previewLines.length
      )}-${Math.min(viewerScroll + viewerBodyRows, previewLines.length)} of ${previewLines.length}`
    : sortMenuOpen
      ? 'Choose a sort or filter mode'
      : `${visibleEntries.length} ${filterActive ? 'matches' : visibleEntries.length === 1 ? 'item' : 'items'} • sort: ${sortMode} • ${
          filterMode === 'diffed' ? 'changed only' : 'all files'
        }`;
  const footerHelp = viewerPath
    ? 'Esc back • d toggle code/diff • o open directory • PgUp/PgDn scroll'
    : sortMenuOpen
      ? '↑↓ choose • Enter apply • Esc back'
      : 'Type to filter • ↓ focus list • Enter open • Shift+S sort • Shift+O open dir • Shift+R refresh • Esc back';

  return (
    <Box flexDirection="column" paddingX={1} width={terminalWidth}>
      <Box flexDirection="column" width={frameWidth}>
        <Box width={frameWidth}>
          <Text bold color={COLORS.accent} wrap="truncate-end">
            {renderSingleLine(`Files: ${projectLabel}`)}
          </Text>
        </Box>
        <Box width={frameWidth}>
          <Text dimColor wrap="truncate-end">
            {renderSingleLine(clipFromLeft(rootPath, frameWidth))}
          </Text>
        </Box>
      </Box>

      <Box
        borderStyle={POPUP_CONFIG.borderStyle}
        borderColor={filterFocused ? POPUP_CONFIG.inputBorderColor : POPUP_CONFIG.borderColor}
        width={searchWidth}
        height={searchRows}
        flexDirection="column"
      >
        <Box width={searchInnerWidth}>
          <Text bold color={filterFocused ? POPUP_CONFIG.inputBorderColor : POPUP_CONFIG.borderColor}>
            {' '}
          </Text>
          <Text
            color={filterFocused ? 'white' : undefined}
            dimColor={!filterQuery}
            wrap="truncate-end"
          >
            {renderSingleLine(
              clipToWidth(
                `${filterDisplay}${filterQuery ? filterCursor : filterFocused ? filterCursor : ''}`,
                searchInnerWidth - 2
              )
            )}
          </Text>
        </Box>
      </Box>

      {viewerPath ? (
        <Box
          flexDirection="column"
          width={contentWidth}
          height={contentBoxHeight}
        >
          <Box width={contentWidth}>
            <Text bold color="yellow" wrap="truncate-end">
              {renderSingleLine(clipToWidth(`${sectionTitle} • ${viewerPath}`, contentWidth))}
            </Text>
          </Box>
          <Box width={contentWidth}>
            <Text dimColor wrap="truncate-end">
              {renderSingleLine(clipToWidth(sectionSummary, contentWidth))}
            </Text>
          </Box>

          {visiblePreviewLines.map((line, index) => (
            <Box key={`${viewerScroll + index}`} width={contentWidth}>
              <Text wrap="truncate-end">{line.length > 0 ? line : ' '}</Text>
            </Box>
          ))}
          {Array.from({ length: viewerTrailingRows }, (_, index) => (
            <Box key={`viewer-pad-${index}`} width={contentWidth}>
              <Text> </Text>
            </Box>
          ))}
        </Box>
      ) : sortMenuOpen ? (
        <Box
          flexDirection="column"
          width={contentWidth}
          height={contentBoxHeight}
        >
          <Box width={contentWidth}>
            <Text bold color="cyan" wrap="truncate-end">
              {sectionTitle}
            </Text>
          </Box>
          {SORT_OPTIONS.map((option, index) => {
            const selected = index === sortMenuIndex;
            return (
              <Box key={option.id} width={contentWidth}>
                <Text
                  bold={selected}
                  color={selected ? 'black' : 'white'}
                  backgroundColor={selected ? COLORS.accent : undefined}
                  wrap="truncate-end"
                >
                  {renderSingleLine(
                    clipToWidth(
                      `${selected ? '▌ ' : '  '}${option.label} • ${option.description}`,
                      contentWidth
                    )
                  )}
                </Text>
              </Box>
            );
          })}
          {Array.from({ length: sortTrailingRows }, (_, index) => (
            <Box key={`sort-pad-${index}`} width={contentWidth}>
              <Text> </Text>
            </Box>
          ))}
        </Box>
      ) : (
        <Box
          flexDirection="column"
          width={contentWidth}
          height={contentBoxHeight}
        >
          <Box width={contentWidth}>
            <Text
              bold
              color={listFocused ? POPUP_CONFIG.borderColor : 'gray'}
              wrap="truncate-end"
            >
              {renderSingleLine(clipToWidth(`${sectionTitle} • ${sectionSummary}`, contentWidth))}
            </Text>
          </Box>
          {visibleEntries.length === 0 ? (
            <>
              <Box width={contentWidth}>
                <Text dimColor wrap="truncate-end">
                  No files match the current filter.
                </Text>
              </Box>
              {Array.from({ length: Math.max(0, listBodyRows - 1) }, (_, index) => (
                <Box key={`empty-pad-${index}`} width={contentWidth}>
                  <Text> </Text>
                </Box>
              ))}
            </>
          ) : (
            <>
              {visibleListItems.map((entry) => {
                const selected = listFocused && entry.path === selectedPath;
                const rowBackground = selected ? COLORS.accent : undefined;
                const statusText = statusColumnWidth > 1
                  ? (entry.statusLabel || '').padStart(statusColumnWidth - 1, ' ')
                  : entry.statusLabel || '';
                const selectionMarker = selected ? '▌ ' : '  ';
                const entryLabel = filterActive
                  ? clipPathToWidth(
                      entry.type === 'directory' ? `${entry.path}/` : entry.path,
                      itemLabelWidth
                    )
                  : clipToWidth(entry.displayLabel, itemLabelWidth);
                const entryColor = selected
                  ? 'black'
                  : filterActive
                    ? getSearchEntryColor(entry)
                    : entry.type === 'directory'
                      ? 'blue'
                      : entry.exists
                        ? 'white'
                        : COLORS.error;

                return (
                  <Box key={entry.path} width={contentWidth}>
                    <Box width={rowMarkerWidth}>
                      <Text
                        color={selected ? 'black' : POPUP_CONFIG.borderColor}
                        backgroundColor={rowBackground}
                      >
                        {selectionMarker}
                      </Text>
                    </Box>
                    {filterActive ? (
                      <Box width={searchIconWidth}>
                        <Text color={entryColor} backgroundColor={rowBackground}>
                          {getSearchEntryIcon(entry)}
                        </Text>
                      </Box>
                    ) : null}
                    <Box width={itemLabelWidth}>
                      <Text
                        bold={selected || entry.type === 'directory'}
                        color={entryColor}
                        backgroundColor={rowBackground}
                        wrap="truncate-end"
                      >
                        {renderSingleLine(entryLabel)}
                      </Text>
                    </Box>
                    <Box width={statusColumnWidth} justifyContent="flex-end">
                      <Text
                        color={selected ? 'black' : getStatusColor(entry.statusLabel)}
                        backgroundColor={rowBackground}
                      >
                        {statusText}
                      </Text>
                    </Box>
                  </Box>
                );
              })}
              {Array.from({ length: listTrailingRows }, (_, index) => (
                <Box key={`list-pad-${index}`} width={contentWidth}>
                  <Text> </Text>
                </Box>
              ))}
            </>
          )}
        </Box>
      )}

      <Box flexDirection="column" width={frameWidth}>
        <Box width={frameWidth}>
          <Text color={statusMessage ? 'green' : undefined} wrap="truncate-end">
            {renderSingleLine(clipToWidth(statusMessage || ' ', frameWidth))}
          </Text>
        </Box>
        <Box width={frameWidth}>
          <Text dimColor wrap="truncate-end">
            {renderSingleLine(clipToWidth(footerHelp, frameWidth))}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

export default FileBrowserApp;
