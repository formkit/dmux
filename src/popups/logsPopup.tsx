#!/usr/bin/env node
/**
 * Logs Popup - Scrollable log viewer for dmux
 *
 * Displays all logs with filtering options:
 * - All logs
 * - Errors only
 * - Warnings only
 * - By pane
 */

import React, { useState, useMemo } from 'react';
import { render, Box, Text, useInput, useStdout } from 'ink';
import type { LogEntry, LogLevel } from '../types.js';
import * as fs from 'fs';

type FilterMode = 'all' | 'errors' | 'warnings' | 'pane';

interface LogsPopupProps {
  allLogs: LogEntry[];
  stats: {
    total: number;
    errors: number;
    warnings: number;
    unreadErrors: number;
    unreadWarnings: number;
  };
}

interface LogsPopupAppProps extends LogsPopupProps {
  resultFile: string;
}

const LogsPopupApp: React.FC<LogsPopupAppProps> = ({ allLogs, stats, resultFile }) => {
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows || 50;

  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedPane, setSelectedPane] = useState<string | null>(null);

  // Calculate line count for each log entry
  const getLogLineCount = (log: LogEntry): number => {
    let lines = 1; // Main message line
    if (log.paneId) lines++; // Pane attribution line
    if (log.stack) lines++; // Stack trace line
    return lines;
  };

  // Calculate initial scroll offset to start at bottom
  const headerFooterLines = 8;
  const availableLogLines = Math.max(terminalHeight - headerFooterLines, 10);

  const initialTotalLines = allLogs.reduce((sum, log) => sum + getLogLineCount(log), 0);
  const initialScrollOffset = Math.max(0, initialTotalLines - availableLogLines);

  const [scrollOffset, setScrollOffset] = useState(initialScrollOffset);

  // Extract available panes
  const availablePanes = useMemo(() => {
    const paneIds = new Set<string>();
    allLogs.forEach(log => {
      if (log.paneId) {
        paneIds.add(log.paneId);
      }
    });
    return Array.from(paneIds);
  }, [allLogs]);

  // Filter logs based on current filter mode
  const filteredLogs = useMemo(() => {
    let filtered = [...allLogs];

    switch (filterMode) {
      case 'errors':
        filtered = filtered.filter(log => log.level === 'error');
        break;
      case 'warnings':
        filtered = filtered.filter(log => log.level === 'warn');
        break;
      case 'pane':
        // When in pane mode, only show logs with pane IDs
        if (selectedPane) {
          filtered = filtered.filter(log => log.paneId === selectedPane);
        } else {
          // No specific pane selected - show only logs with pane IDs
          filtered = filtered.filter(log => log.paneId);
        }
        break;
      default:
        // Show all
        break;
    }

    return filtered;
  }, [allLogs, filterMode, selectedPane]);

  // Update scroll offset when filter changes to show bottom
  React.useEffect(() => {
    const totalLines = filteredLogs.reduce((sum, log) => sum + getLogLineCount(log), 0);
    const maxScroll = Math.max(0, totalLines - availableLogLines);
    setScrollOffset(maxScroll);
  }, [filterMode, filteredLogs, availableLogLines]);

  const halfPageSize = Math.floor(availableLogLines / 2);

  useInput((input, key) => {
    if (key.escape) {
      // Write success result before exiting
      const result = { success: true };
      fs.writeFileSync(resultFile, JSON.stringify(result));
      process.exit(0);
    }

    // Filter mode selection
    if (input === '1') {
      setFilterMode('all');
      setSelectedPane(null);
    } else if (input === '2') {
      setFilterMode('errors');
      setSelectedPane(null);
    } else if (input === '3') {
      setFilterMode('warnings');
      setSelectedPane(null);
    } else if (input === '4') {
      setFilterMode('pane');
      // Start with first pane if available
      if (availablePanes.length > 0 && !selectedPane) {
        setSelectedPane(availablePanes[0]);
      }
    }

    // Left/right arrow keys to cycle through panes when in pane mode
    if (filterMode === 'pane' && availablePanes.length > 0) {
      if (key.leftArrow) {
        const currentIndex = selectedPane ? availablePanes.indexOf(selectedPane) : 0;
        const newIndex = currentIndex > 0 ? currentIndex - 1 : availablePanes.length - 1;
        setSelectedPane(availablePanes[newIndex]);
        return; // Don't scroll
      }
      if (key.rightArrow) {
        const currentIndex = selectedPane ? availablePanes.indexOf(selectedPane) : 0;
        const newIndex = currentIndex < availablePanes.length - 1 ? currentIndex + 1 : 0;
        setSelectedPane(availablePanes[newIndex]);
        return; // Don't scroll
      }
    }

    // Calculate max scroll based on total line count
    const totalLines = filteredLogs.reduce((sum, log) => sum + getLogLineCount(log), 0);
    const maxScroll = Math.max(0, totalLines - availableLogLines);

    // Half-page scrolling with arrow keys
    if (key.upArrow) {
      setScrollOffset(Math.max(0, scrollOffset - halfPageSize));
    }

    if (key.downArrow) {
      setScrollOffset(Math.min(maxScroll, scrollOffset + halfPageSize));
    }

    // Mouse wheel scrolling (tmux sends these as escape sequences)
    // Scroll up: ESC[64;row;colM or button 4
    // Scroll down: ESC[65;row;colM or button 5
    if (input.includes('[64;') || input.includes('ScrollUp')) {
      setScrollOffset(Math.max(0, scrollOffset - halfPageSize));
    }
    if (input.includes('[65;') || input.includes('ScrollDown')) {
      setScrollOffset(Math.min(maxScroll, scrollOffset + halfPageSize));
    }
  });

  // Format timestamp
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Get color for log level
  const getLevelColor = (level: LogLevel): string => {
    switch (level) {
      case 'error': return 'red';
      case 'warn': return 'yellow';
      case 'info': return 'cyan';
      case 'debug': return 'gray';
    }
  };


  // Filter tabs
  const renderFilterTabs = () => {
    const tabs = [
      { key: '1', label: 'All', mode: 'all' as FilterMode },
      { key: '2', label: 'Errors', mode: 'errors' as FilterMode },
      { key: '3', label: 'Warnings', mode: 'warnings' as FilterMode },
      { key: '4', label: filterMode === 'pane' && selectedPane ? `Pane: ${selectedPane}` : 'By Pane', mode: 'pane' as FilterMode },
    ];

    return (
      <Box flexDirection="row" gap={1}>
        {tabs.map(tab => (
          <Text
            key={tab.key}
            color={filterMode === tab.mode ? 'cyan' : 'gray'}
            bold={filterMode === tab.mode}
          >
            [{tab.key}] {tab.label}
          </Text>
        ))}
      </Box>
    );
  };

  // Render log entry
  const renderLogEntry = (log: LogEntry) => {
    const time = formatTime(log.timestamp);
    const color = getLevelColor(log.level);

    return (
      <Box key={log.id} flexDirection="column" marginBottom={0}>
        <Text>
          <Text color={color}>
            {time}
          </Text>
          <Text color={color}> [{log.source || 'dmux'}] {log.message}</Text>
        </Text>
        {log.paneId && (
          <Box marginLeft={2}>
            <Text dimColor>
              └─ Pane: {log.paneId}
            </Text>
          </Box>
        )}
        {log.stack && (
          <Box marginLeft={2}>
            <Text dimColor>
              Stack: {log.stack.split('\n')[0]}
            </Text>
          </Box>
        )}
      </Box>
    );
  };

  // Calculate which logs fit in the viewport considering multi-line entries
  const getVisibleLogs = () => {
    const visible: LogEntry[] = [];
    let totalLines = 0;
    let startIndex = 0;

    // Calculate starting index based on scroll offset
    let skippedLines = 0;
    for (let i = 0; i < filteredLogs.length; i++) {
      const lineCount = getLogLineCount(filteredLogs[i]);
      if (skippedLines + lineCount > scrollOffset) {
        startIndex = i;
        break;
      }
      skippedLines += lineCount;
    }

    // Add logs until we fill the viewport
    for (let i = startIndex; i < filteredLogs.length; i++) {
      const lineCount = getLogLineCount(filteredLogs[i]);
      if (totalLines + lineCount > availableLogLines) break;
      visible.push(filteredLogs[i]);
      totalLines += lineCount;
    }

    return visible;
  };

  const visibleLogs = getVisibleLogs();

  // Calculate total line count for scroll calculations
  const totalLines = filteredLogs.reduce((sum, log) => sum + getLogLineCount(log), 0);
  const canScrollUp = scrollOffset > 0;
  const hasMore = scrollOffset < totalLines - availableLogLines;

  return (
    <Box flexDirection="column">
      {/* Header - Stats and filters */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
        <Box>
          <Text dimColor>{stats.total} total • {stats.errors} errors • {stats.warnings} warnings</Text>
        </Box>
        <Box marginTop={1}>
          {renderFilterTabs()}
        </Box>
      </Box>

      {/* Logs list - fixed height */}
      <Box flexDirection="column" height={availableLogLines} paddingX={1} paddingY={1}>
        {filteredLogs.length === 0 ? (
          <Box>
            <Text dimColor>No logs to display</Text>
          </Box>
        ) : (
          visibleLogs.map((log) => renderLogEntry(log))
        )}
      </Box>

      {/* Footer - always at bottom */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          ↑↓: Scroll • 1-4: Filter
          {filterMode === 'pane' && availablePanes.length > 0 && (
            <Text dimColor> • ←→: {selectedPane || 'All Panes'}</Text>
          )}
          {' • ESC: Close'}
          {filteredLogs.length > availableLogLines && (
            <Text dimColor> • Showing {scrollOffset + 1}-{Math.min(scrollOffset + availableLogLines, filteredLogs.length)} of {filteredLogs.length}</Text>
          )}
        </Text>
      </Box>
    </Box>
  );
};

// Entry point
function main() {
  const resultFile = process.argv[2];
  const dataFile = process.argv[3];

  if (!resultFile || !dataFile) {
    console.error('Error: Result file and data file paths required');
    console.error(`Got: resultFile=${resultFile}, dataFile=${dataFile}`);
    process.exit(1);
  }

  let logsData: { logs: LogEntry[]; stats: any };
  try {
    const dataJson = fs.readFileSync(dataFile, 'utf-8');
    logsData = JSON.parse(dataJson);
  } catch (error) {
    console.error('Error: Failed to read or parse logs data file:', error);
    process.exit(1);
  }

  render(<LogsPopupApp allLogs={logsData.logs} stats={logsData.stats} resultFile={resultFile} />);
}

main();
