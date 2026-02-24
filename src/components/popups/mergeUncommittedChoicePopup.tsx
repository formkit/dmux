#!/usr/bin/env node

/**
 * Standalone popup for merge uncommitted-change choices.
 * Supports compact action options and file-level diff peeking.
 */

import React, { useMemo, useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import * as fs from 'fs';
import { execSync } from 'child_process';
import {
  PopupContainer,
  PopupWrapper,
  writeCancelAndExit,
  writeSuccessAndExit,
} from './shared/index.js';
import { POPUP_CONFIG } from './config.js';

interface ChoiceOption {
  id: string;
  label: string;
  description?: string;
  danger?: boolean;
  default?: boolean;
}

interface MergeUncommittedPopupData {
  title: string;
  message: string;
  options: ChoiceOption[];
  kind: 'merge_uncommitted';
  repoPath: string;
  targetBranch: string;
  files: string[];
  diffMode?: 'working-tree' | 'target-branch';
}

interface MergeUncommittedChoicePopupProps {
  resultFile: string;
  data: MergeUncommittedPopupData;
}

const MAX_VISIBLE_FILES = 9;
const DIFF_MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const DIFF_SCROLL_PAGE_SIZE = 10;

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function getDiffText(data: MergeUncommittedPopupData, filePath: string): string {
  const fileArg = shellEscape(filePath);

  if (data.diffMode === 'target-branch') {
    try {
      const branchArg = shellEscape(data.targetBranch);
      const output = execSync(
        `git --no-pager diff --no-color ${branchArg} -- ${fileArg}`,
        {
          cwd: data.repoPath,
          encoding: 'utf-8',
          stdio: 'pipe',
          maxBuffer: DIFF_MAX_BUFFER_BYTES,
        }
      );
      if (output.trim().length > 0) {
        return output;
      }
    } catch {
      // Fall through to working tree diff fallback.
    }
  }

  try {
    const output = execSync(
      `git --no-pager diff --no-color -- ${fileArg}`,
      {
        cwd: data.repoPath,
        encoding: 'utf-8',
        stdio: 'pipe',
        maxBuffer: DIFF_MAX_BUFFER_BYTES,
      }
    );

    if (output.trim().length > 0) {
      return output;
    }

    return `No diff output for ${filePath}.`;
  } catch (error: unknown) {
    if (error instanceof Error) {
      return `Failed to load diff for ${filePath}: ${error.message}`;
    }
    return `Failed to load diff for ${filePath}.`;
  }
}

function getVisibleFileWindow(
  files: string[],
  selectedFileIndex: number
): { start: number; end: number; visibleFiles: string[] } {
  const total = files.length;
  if (total <= MAX_VISIBLE_FILES) {
    return {
      start: 0,
      end: total,
      visibleFiles: files,
    };
  }

  if (selectedFileIndex < 0) {
    return {
      start: 0,
      end: MAX_VISIBLE_FILES,
      visibleFiles: files.slice(0, MAX_VISIBLE_FILES),
    };
  }

  const centeredStart = selectedFileIndex - Math.floor(MAX_VISIBLE_FILES / 2);
  const start = Math.max(0, Math.min(centeredStart, total - MAX_VISIBLE_FILES));
  const end = start + MAX_VISIBLE_FILES;

  return {
    start,
    end,
    visibleFiles: files.slice(start, end),
  };
}

function getDiffLineColor(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'yellow';
  if (line.startsWith('+')) return 'green';
  if (line.startsWith('-')) return 'red';
  if (line.startsWith('@@')) return 'cyan';
  if (line.startsWith('diff --git') || line.startsWith('index ')) return POPUP_CONFIG.titleColor;
  return 'white';
}

const MergeUncommittedChoicePopupApp: React.FC<MergeUncommittedChoicePopupProps> = ({
  resultFile,
  data,
}) => {
  const { exit } = useApp();
  const optionCount = data.options.length;
  const fileCount = data.files.length;
  const totalRows = optionCount + fileCount;
  const defaultIndex = Math.max(0, data.options.findIndex((option) => option.default));
  const [selectedRow, setSelectedRow] = useState(Math.min(defaultIndex, Math.max(totalRows - 1, 0)));
  const [quicklook, setQuicklook] = useState<{
    filePath: string;
    lines: string[];
    offset: number;
  } | null>(null);

  const selectedOption = selectedRow < optionCount ? data.options[selectedRow] : null;
  const selectedFileIndex = selectedRow - optionCount;
  const selectedFile = selectedFileIndex >= 0 ? data.files[selectedFileIndex] : null;

  const fileWindow = useMemo(
    () => getVisibleFileWindow(data.files, selectedFileIndex),
    [data.files, selectedFileIndex]
  );

  const openQuicklook = (filePath: string) => {
    const diffText = getDiffText(data, filePath);
    const lines = diffText.split('\n');
    setQuicklook({
      filePath,
      lines: lines.length > 0 ? lines : ['No diff output available.'],
      offset: 0,
    });
  };

  useInput((input, key) => {
    if (quicklook) {
      const maxVisibleLines = Math.max(8, (process.stdout.rows || 40) - 14);
      const maxOffset = Math.max(0, quicklook.lines.length - maxVisibleLines);

      if (key.upArrow) {
        setQuicklook((prev) => (
          prev
            ? { ...prev, offset: Math.max(0, prev.offset - 1) }
            : prev
        ));
        return;
      }

      if (key.downArrow) {
        setQuicklook((prev) => (
          prev
            ? { ...prev, offset: Math.min(maxOffset, prev.offset + 1) }
            : prev
        ));
        return;
      }

      if (key.pageUp) {
        setQuicklook((prev) => (
          prev
            ? { ...prev, offset: Math.max(0, prev.offset - DIFF_SCROLL_PAGE_SIZE) }
            : prev
        ));
        return;
      }

      if (key.pageDown) {
        setQuicklook((prev) => (
          prev
            ? { ...prev, offset: Math.min(maxOffset, prev.offset + DIFF_SCROLL_PAGE_SIZE) }
            : prev
        ));
        return;
      }

      if (key.escape || key.return || input === ' ') {
        setQuicklook(null);
      }
      return;
    }

    if (key.escape) {
      writeCancelAndExit(resultFile, exit);
      return;
    }

    if (totalRows === 0) return;

    if (key.upArrow) {
      setSelectedRow((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedRow((prev) => Math.min(totalRows - 1, prev + 1));
      return;
    }

    if (key.return || input === ' ') {
      if (selectedRow < optionCount) {
        // Preserve safety for actions: only Enter confirms action rows.
        if (!key.return) return;
        const option = data.options[selectedRow];
        if (!option) return;
        writeSuccessAndExit(resultFile, option.id, exit);
        return;
      }

      if (selectedFile) {
        openQuicklook(selectedFile);
      }
    }
  });

  const hasFilesAbove = fileWindow.start > 0;
  const hasFilesBelow = fileWindow.end < fileCount;
  const maxVisibleDiffLines = Math.max(8, (process.stdout.rows || 40) - 14);
  const quicklookVisibleLines = quicklook
    ? quicklook.lines.slice(quicklook.offset, quicklook.offset + maxVisibleDiffLines)
    : [];
  const quicklookEnd = quicklook
    ? Math.min(quicklook.offset + maxVisibleDiffLines, quicklook.lines.length)
    : 0;
  const footer = quicklook
    ? '↑↓ scroll • PgUp/PgDn • Space/Enter/ESC back'
    : '↑↓ navigate • Enter select • Space/Enter peek • ESC cancel';

  return (
    <PopupWrapper resultFile={resultFile} allowEscapeToCancel={false}>
      <PopupContainer footer={footer}>
        {quicklook ? (
          <Box flexDirection="column">
            <Box marginBottom={1} flexDirection="column">
              <Text bold color={POPUP_CONFIG.titleColor} wrap="truncate-end">
                {quicklook.filePath}
              </Text>
              <Text dimColor>
                Compared to {data.diffMode === 'target-branch' ? data.targetBranch : 'working tree base'}
              </Text>
              <Text dimColor>
                Lines {Math.min(quicklook.offset + 1, quicklook.lines.length)}-{quicklookEnd} of {quicklook.lines.length}
              </Text>
            </Box>
            <Box flexDirection="column">
              {quicklookVisibleLines.map((line, index) => (
                <Text
                  key={`${quicklook.offset + index}`}
                  color={getDiffLineColor(line)}
                  wrap="truncate-end"
                >
                  {line.length > 0 ? line : ' '}
                </Text>
              ))}
            </Box>
          </Box>
        ) : (
          <>
            <Box marginBottom={1} flexDirection="column">
              <Text bold color={POPUP_CONFIG.titleColor}>{data.title}</Text>
              <Text dimColor>{data.message}</Text>
            </Box>

            <Box marginBottom={1} flexDirection="column">
              {data.options.map((option, index) => {
                const isSelected = selectedRow === index;
                return (
                  <Box key={option.id}>
                    <Text
                      color={
                        isSelected
                          ? POPUP_CONFIG.titleColor
                          : option.danger
                            ? POPUP_CONFIG.errorColor
                            : 'white'
                      }
                      bold={isSelected}
                    >
                      {isSelected ? '▶ ' : '  '}
                      {option.label}
                    </Text>
                  </Box>
                );
              })}
              {selectedOption?.description && (
                <Box marginLeft={2}>
                  <Text dimColor>{selectedOption.description}</Text>
                </Box>
              )}
            </Box>

            <Box flexDirection="column">
              <Text bold color={POPUP_CONFIG.titleColor}>
                Changed Files ({fileCount})
              </Text>
              <Box
                borderStyle="round"
                borderColor={selectedFile ? POPUP_CONFIG.titleColor : 'gray'}
                paddingX={1}
                flexDirection="column"
              >
                {hasFilesAbove && <Text dimColor>↑ more files above</Text>}

                {fileWindow.visibleFiles.length === 0 ? (
                  <Text dimColor>No changed files provided.</Text>
                ) : (
                  fileWindow.visibleFiles.map((file, index) => {
                    const actualFileIndex = fileWindow.start + index;
                    const rowIndex = optionCount + actualFileIndex;
                    const isSelected = rowIndex === selectedRow;
                    return (
                      <Text
                        key={`${file}-${actualFileIndex}`}
                        color={isSelected ? POPUP_CONFIG.successColor : 'white'}
                        bold={isSelected}
                        wrap="truncate-end"
                      >
                        {isSelected ? '▶ ' : '  '}
                        {file}
                      </Text>
                    );
                  })
                )}

                {hasFilesBelow && <Text dimColor>↓ more files below</Text>}
              </Box>
            </Box>

            <Box marginTop={1} flexDirection="column">
              {selectedFile && (
                <Text dimColor>
                  Space or Enter on file opens diff peek against {data.targetBranch}.
                </Text>
              )}
            </Box>
          </>
        )}
      </PopupContainer>
    </PopupWrapper>
  );
};

function isChoiceOption(value: unknown): value is ChoiceOption {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string' && typeof candidate.label === 'string';
}

function main() {
  const resultFile = process.argv[2];
  const dataFile = process.argv[3];

  if (!resultFile || !dataFile) {
    console.error('Error: Result file and data file required');
    process.exit(1);
  }

  let data: MergeUncommittedPopupData;
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf-8')) as Partial<MergeUncommittedPopupData>;
    data = {
      title: parsed.title || 'Uncommitted Changes',
      message: parsed.message || '',
      options: Array.isArray(parsed.options) ? parsed.options.filter(isChoiceOption) : [],
      kind: 'merge_uncommitted',
      repoPath: parsed.repoPath || process.cwd(),
      targetBranch: parsed.targetBranch || 'HEAD',
      files: Array.isArray(parsed.files)
        ? parsed.files.filter((file): file is string => typeof file === 'string')
        : [],
      diffMode: parsed.diffMode === 'target-branch' ? 'target-branch' : 'working-tree',
    };
  } catch {
    console.error('Error: Failed to read or parse merge uncommitted popup data');
    process.exit(1);
  }

  render(
    <MergeUncommittedChoicePopupApp
      resultFile={resultFile}
      data={data}
    />
  );
}

main();
