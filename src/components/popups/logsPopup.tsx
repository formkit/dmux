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
import { render, Box, Text, useInput, useStdout, useApp } from 'ink';
import type { LogEntry, LogLevel } from '../../types.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { POPUP_CONFIG } from './config.js';
import { PopupWrapper, writeSuccessAndExit } from './shared/index.js';

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
  const { exit } = useApp();
  const terminalHeight = stdout?.rows || 50;

  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedPane, setSelectedPane] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
      writeSuccessAndExit(resultFile, {}, exit);
      return;
    }

    // Copy visible logs to clipboard
    if (input === 'c') {
      // Format visible logs as text
      const logsText = filteredLogs.map(log => {
        const date = new Date(log.timestamp);
        const timestamp = date.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        const level = log.level.toUpperCase();
        const source = log.source || 'unknown';
        let text = `${timestamp} [${source}] ${level}: ${log.message}`;
        if (log.paneId) {
          text += ` (pane: ${log.paneId})`;
        }
        if (log.stack) {
          text += `\n  Stack: ${log.stack}`;
        }
        return text;
      }).join('\n');

      try {
        // Try pbcopy (macOS)
        execSync(`pbcopy`, { input: logsText, stdio: 'pipe' });
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        try {
          // Try xclip (Linux)
          execSync(`xclip -selection clipboard`, { input: logsText, stdio: 'pipe' });
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard not available
        }
      }
      return;
    }

    // Open logs in text editor
    if (input === 'o') {
      // Format visible logs as text
      const logsText = filteredLogs.map(log => {
        const date = new Date(log.timestamp);
        const timestamp = date.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        const level = log.level.toUpperCase();
        const source = log.source || 'unknown';
        let text = `${timestamp} [${source}] ${level}: ${log.message}`;
        if (log.paneId) {
          text += ` (pane: ${log.paneId})`;
        }
        if (log.stack) {
          text += `\n  Stack: ${log.stack}`;
        }
        return text;
      }).join('\n');

      // Write to temp file
      const tempFile = path.join(os.tmpdir(), `dmux-logs-${Date.now()}.txt`);
      try {
        fs.writeFileSync(tempFile, logsText);
      } catch (error) {
        console.error('[logsPopup] Failed to write temp log file:', error);
        return;
      }

      // Open in editor (same pattern as openInEditor action)
      const editor = process.env.EDITOR || 'code';
      try {
        execSync(`${editor} "${tempFile}"`, { stdio: 'pipe' });
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Editor failed, file still exists for manual opening
      }
      return;
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
            color={filterMode === tab.mode ? POPUP_CONFIG.titleColor : 'gray'}
            bold={filterMode === tab.mode}
          >
            [{tab.key}] {tab.label}
          </Text>
        ))}
      </Box>
    );
  };

  // Render log entry with color-coded severity levels
  const renderLogEntry = (log: LogEntry) => {
    const time = formatTime(log.timestamp);
    const color = getLevelColor(log.level);
    const levelLabel = log.level.toUpperCase().padEnd(5, ' ');
    const isCritical = log.level === 'error' || log.level === 'warn';

    return (
      <Box key={log.id} flexDirection="column" marginBottom={0}>
        <Text>
          <Text dimColor>{time}</Text>
          <Text color={color} bold={isCritical}>
            {' ['}
            {levelLabel}
            {'] '}
          </Text>
          <Text dimColor>[{log.source || 'dmux'}]</Text>
          <Text color={color}>
            {' '}
            {log.message}
          </Text>
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
            <Text color="red">
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
    <PopupWrapper resultFile={resultFile} allowEscapeToCancel={false}>
      <Box flexDirection="column">
        {/* Header - Stats and filters */}
        <Box flexDirection="column" borderStyle="single" borderColor={POPUP_CONFIG.borderColor} paddingX={1}>
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
        <Box borderStyle="single" borderColor={POPUP_CONFIG.borderColor} paddingX={1}>
          <Text dimColor>
            ↑↓: Scroll • 1-4: Filter
            {filterMode === 'pane' && availablePanes.length > 0 && (
              <Text dimColor> • ←→: {selectedPane || 'All Panes'}</Text>
            )}
            {' • [c]: Copy • [o]: Open in editor'}
            {' • ESC: Close'}
            {filteredLogs.length > availableLogLines && (
              <Text dimColor> • Showing {scrollOffset + 1}-{Math.min(scrollOffset + availableLogLines, filteredLogs.length)} of {filteredLogs.length}</Text>
            )}
            {copied && <Text color="green"> • ✓ Copied!</Text>}
          </Text>
        </Box>
      </Box>
    </PopupWrapper>
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
