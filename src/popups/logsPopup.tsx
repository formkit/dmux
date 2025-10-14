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

import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput } from 'ink';
import { StateManager } from '../shared/StateManager.js';
import type { LogEntry, LogLevel } from '../types.js';

type FilterMode = 'all' | 'errors' | 'warnings' | 'pane';

const LogsPopup: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedPane, setSelectedPane] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [availablePanes, setAvailablePanes] = useState<string[]>([]);

  // Load logs on mount and subscribe to updates
  useEffect(() => {
    const stateManager = StateManager.getInstance();

    const loadLogs = () => {
      let filter: any = {};

      switch (filterMode) {
        case 'errors':
          filter.level = 'error';
          break;
        case 'warnings':
          filter.level = 'warn';
          break;
        case 'pane':
          if (selectedPane) {
            filter.paneId = selectedPane;
          }
          break;
        default:
          // Show all
          break;
      }

      const filteredLogs = stateManager.getLogs(filter);
      setLogs(filteredLogs);

      // Extract unique pane IDs for filter
      const paneIds = new Set<string>();
      const allLogs = stateManager.getLogs();
      allLogs.forEach(log => {
        if (log.paneId) {
          paneIds.add(log.paneId);
        }
      });
      setAvailablePanes(Array.from(paneIds));
    };

    loadLogs();

    // Subscribe to state changes
    const unsubscribe = stateManager.subscribe(() => {
      loadLogs();
    });

    return () => {
      unsubscribe();
    };
  }, [filterMode, selectedPane]);

  // Mark all logs as read on mount
  useEffect(() => {
    const stateManager = StateManager.getInstance();
    stateManager.markAllLogsAsRead();
  }, []);

  useInput((input, key) => {
    if (key.escape) {
      process.exit(0);
    }

    // Filter mode selection
    if (input === '1') {
      setFilterMode('all');
      setSelectedIndex(0);
    } else if (input === '2') {
      setFilterMode('errors');
      setSelectedIndex(0);
    } else if (input === '3') {
      setFilterMode('warnings');
      setSelectedIndex(0);
    } else if (input === '4') {
      setFilterMode('pane');
      setSelectedIndex(0);
    }

    // Navigation
    if (key.upArrow && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }

    if (key.downArrow && selectedIndex < logs.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }

    // Clear logs
    if (input === 'c' || input === 'C') {
      const stateManager = StateManager.getInstance();
      stateManager.clearAllLogs();
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

  // Get emoji for log level
  const getLevelEmoji = (level: LogLevel): string => {
    switch (level) {
      case 'error': return '🔴';
      case 'warn': return '🟡';
      case 'info': return '🔵';
      case 'debug': return '⚪';
    }
  };

  // Filter tabs
  const renderFilterTabs = () => {
    const tabs = [
      { key: '1', label: 'All', mode: 'all' as FilterMode },
      { key: '2', label: 'Errors', mode: 'errors' as FilterMode },
      { key: '3', label: 'Warnings', mode: 'warnings' as FilterMode },
      { key: '4', label: 'By Pane', mode: 'pane' as FilterMode },
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
  const renderLogEntry = (log: LogEntry, index: number) => {
    const isSelected = index === selectedIndex;
    const time = formatTime(log.timestamp);
    const emoji = getLevelEmoji(log.level);
    const color = getLevelColor(log.level);

    // Truncate long messages
    const maxLen = 60;
    const message = log.message.length > maxLen
      ? log.message.substring(0, maxLen) + '...'
      : log.message;

    return (
      <Box key={log.id} flexDirection="column">
        <Box>
          <Text color={isSelected ? 'cyan' : color}>
            {isSelected ? '❯ ' : '  '}
            {emoji} {time} [{log.source || 'dmux'}] {message}
          </Text>
        </Box>
        {log.paneId && (
          <Box marginLeft={4}>
            <Text dimColor>
              └─ Pane: {log.paneId}
            </Text>
          </Box>
        )}
        {isSelected && log.stack && (
          <Box marginLeft={4}>
            <Text dimColor>
              Stack: {log.stack.split('\n')[0]}
            </Text>
          </Box>
        )}
      </Box>
    );
  };

  const stats = StateManager.getInstance().getLogStats();

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          🪵 dmux Logs
        </Text>
        <Text dimColor> - {stats.total} total, {stats.errors} errors, {stats.warnings} warnings</Text>
      </Box>

      {/* Filter tabs */}
      <Box marginBottom={1}>
        {renderFilterTabs()}
      </Box>

      {/* Logs list */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {logs.length === 0 ? (
          <Box>
            <Text dimColor>No logs to display</Text>
          </Box>
        ) : (
          logs.slice(0, 15).map((log, index) => renderLogEntry(log, index))
        )}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>
          ↑↓: Navigate • 1-4: Filter • c: Clear • ESC: Close
        </Text>
      </Box>
    </Box>
  );
};

// Render the popup
render(<LogsPopup />);
