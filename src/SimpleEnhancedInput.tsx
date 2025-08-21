import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { execSync } from 'child_process';
import path from 'path';

interface SimpleEnhancedInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  onCancel?: () => void;
  isActive?: boolean;
  workingDirectory?: string;
}

interface FileMatch {
  path: string;
  displayPath: string;
  type: 'file' | 'directory';
}

const SimpleEnhancedInput: React.FC<SimpleEnhancedInputProps> = ({
  value,
  onChange,
  placeholder = '',
  onSubmit,
  onCancel,
  isActive = true,
  workingDirectory = process.cwd()
}) => {
  const [cursorPosition, setCursorPosition] = useState(0);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [autocompleteStartPos, setAutocompleteStartPos] = useState(0);
  const [fileMatches, setFileMatches] = useState<FileMatch[]>([]);
  const [selectedMatchIndex, setSelectedMatchIndex] = useState(0);

  // Update cursor when value changes externally
  useEffect(() => {
    // Only update cursor to end if value actually changed and we're not already editing
    if (value.length > 0 && cursorPosition === 0) {
      // This is initial value, keep cursor at 0
    } else if (value === '') {
      setCursorPosition(0);
    }
  }, [value]);

  // Search for files when autocomplete query changes or when @ is typed
  useEffect(() => {
    if (showAutocomplete) {
      searchFiles(autocompleteQuery);
    } else {
      setFileMatches([]);
    }
  }, [autocompleteQuery, showAutocomplete]);

  const searchFiles = async (query: string) => {
    try {
      // Directories to exclude from search
      const excludeDirs = [
        'node_modules',
        '.git',
        'dist',
        'build',
        '.next',
        '.nuxt',
        '.cache',
        'coverage',
        '.vscode',
        '.idea',
        'vendor',
        'target',
        '.pnpm-store',
        '__pycache__',
        '.pytest_cache',
        '.tox',
        'venv',
        '.venv',
        'env',
        '.env'
      ];
      
      // Build exclude arguments for find command
      const excludeArgs = excludeDirs.map(dir => 
        `-path "*/${dir}" -prune -o`
      ).join(' ');
      
      // If query is empty, show root directory files
      let searchCmd: string;
      let dirSearchCmd: string;
      
      if (query === '') {
        // Show files and directories in the root of the working directory (excluding common dirs)
        searchCmd = `find "${workingDirectory}" -maxdepth 1 \\( ${excludeArgs} -type f -print \\) 2>/dev/null | head -20`;
        dirSearchCmd = `find "${workingDirectory}" -maxdepth 1 \\( ${excludeArgs} -type d -print \\) 2>/dev/null | grep -v "^${workingDirectory}$" | head -10`;
      } else {
        // Search for files matching the query (excluding common dirs)
        searchCmd = `find "${workingDirectory}" \\( ${excludeArgs} -type f -name "*${query}*" -print \\) 2>/dev/null | head -20`;
        dirSearchCmd = `find "${workingDirectory}" \\( ${excludeArgs} -type d -name "*${query}*" -print \\) 2>/dev/null | head -10`;
      }
      
      let fileResults: string[] = [];
      let dirResults: string[] = [];
      
      try {
        fileResults = execSync(searchCmd, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
      } catch {}
      
      try {
        dirResults = execSync(dirSearchCmd, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
      } catch {}

      const matches: FileMatch[] = [];
      
      // Helper to check if path contains excluded directories
      const isExcluded = (filepath: string) => {
        const excludedPatterns = [
          'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
          '.cache', 'coverage', '.vscode', '.idea', 'vendor', 'target',
          '.pnpm-store', '__pycache__', '.pytest_cache', '.tox',
          'venv', '.venv', 'env', '.env'
        ];
        return excludedPatterns.some(pattern => 
          filepath.includes(`/${pattern}/`) || filepath.endsWith(`/${pattern}`)
        );
      };
      
      // Process directory matches
      for (const dirPath of dirResults) {
        if (isExcluded(dirPath)) continue;
        const relativePath = path.relative(workingDirectory, dirPath);
        if (relativePath && !relativePath.startsWith('..')) {
          matches.push({
            path: dirPath,
            displayPath: relativePath + '/',
            type: 'directory'
          });
        }
      }
      
      // Process file matches
      for (const filePath of fileResults) {
        if (isExcluded(filePath)) continue;
        const relativePath = path.relative(workingDirectory, filePath);
        if (relativePath && !relativePath.startsWith('..')) {
          matches.push({
            path: filePath,
            displayPath: relativePath,
            type: 'file'
          });
        }
      }
      
      // Sort by relevance
      matches.sort((a, b) => {
        const aScore = a.displayPath.length;
        const bScore = b.displayPath.length;
        return aScore - bScore;
      });
      
      setFileMatches(matches.slice(0, 10));
      setSelectedMatchIndex(0);
    } catch (error) {
      setFileMatches([]);
    }
  };

  const insertText = (text: string, position: number) => {
    const before = value.slice(0, position);
    const after = value.slice(position);
    const newValue = before + text + after;
    onChange(newValue);
    setCursorPosition(position + text.length);
  };

  const deleteText = (start: number, end: number) => {
    const before = value.slice(0, start);
    const after = value.slice(end);
    const newValue = before + after;
    onChange(newValue);
    setCursorPosition(start);
  };

  const moveCursor = (position: number) => {
    const clampedPosition = Math.max(0, Math.min(value.length, position));
    setCursorPosition(clampedPosition);
  };

  const findWordBoundary = (text: string, position: number, direction: 'left' | 'right'): number => {
    const wordRegex = /\w/;
    let pos = position;
    
    if (direction === 'left') {
      // Skip any non-word chars
      while (pos > 0 && !wordRegex.test(text[pos - 1])) {
        pos--;
      }
      // Skip the word
      while (pos > 0 && wordRegex.test(text[pos - 1])) {
        pos--;
      }
    } else {
      // Skip any non-word chars
      while (pos < text.length && !wordRegex.test(text[pos])) {
        pos++;
      }
      // Skip the word
      while (pos < text.length && wordRegex.test(text[pos])) {
        pos++;
      }
    }
    
    return pos;
  };

  const completeFileReference = (match: FileMatch) => {
    const before = value.slice(0, autocompleteStartPos);
    const after = value.slice(cursorPosition);
    const newValue = before + match.displayPath + after;
    onChange(newValue);
    setCursorPosition(autocompleteStartPos + match.displayPath.length);
    setShowAutocomplete(false);
    setAutocompleteQuery('');
  };

  useInput((input: string, key: any) => {
    // Only handle input when active
    if (!isActive) return;
    
    // Handle autocomplete navigation
    if (showAutocomplete) {
      if (key.escape) {
        setShowAutocomplete(false);
        setAutocompleteQuery('');
        return;
      } else if (key.upArrow) {
        setSelectedMatchIndex(Math.max(0, selectedMatchIndex - 1));
        return;
      } else if (key.downArrow) {
        setSelectedMatchIndex(Math.min(fileMatches.length - 1, selectedMatchIndex + 1));
        return;
      } else if (key.return || key.tab) {
        if (fileMatches.length > 0) {
          completeFileReference(fileMatches[selectedMatchIndex]);
        }
        return;
      }
    }

    // Handle special keys
    if (key.escape) {
      onCancel?.();
      return;
    }
    
    if (key.return && !key.shift) {
      onSubmit?.();
      return;
    }
    
    if (key.return && key.shift) {
      // Insert newline for multiline input
      insertText('\n', cursorPosition);
      return;
    }

    // Line navigation with up/down arrows (when not in autocomplete)
    if (!showAutocomplete && key.upArrow) {
      // Move cursor up one line
      const lines = value.split('\n');
      let currentPos = 0;
      let lineIndex = 0;
      let columnIndex = 0;
      
      // Find current line and column
      for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length;
        if (currentPos + lineLength >= cursorPosition) {
          lineIndex = i;
          columnIndex = cursorPosition - currentPos;
          break;
        }
        currentPos += lineLength + 1; // +1 for newline
      }
      
      // Move to previous line if possible
      if (lineIndex > 0) {
        const prevLineLength = lines[lineIndex - 1].length;
        const newColumn = Math.min(columnIndex, prevLineLength);
        let newPos = 0;
        for (let i = 0; i < lineIndex - 1; i++) {
          newPos += lines[i].length + 1;
        }
        newPos += newColumn;
        moveCursor(newPos);
      }
      return;
    }
    
    if (!showAutocomplete && key.downArrow) {
      // Move cursor down one line
      const lines = value.split('\n');
      let currentPos = 0;
      let lineIndex = 0;
      let columnIndex = 0;
      
      // Find current line and column
      for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length;
        if (currentPos + lineLength >= cursorPosition) {
          lineIndex = i;
          columnIndex = cursorPosition - currentPos;
          break;
        }
        currentPos += lineLength + 1; // +1 for newline
      }
      
      // Move to next line if possible
      if (lineIndex < lines.length - 1) {
        const nextLineLength = lines[lineIndex + 1].length;
        const newColumn = Math.min(columnIndex, nextLineLength);
        let newPos = 0;
        for (let i = 0; i <= lineIndex; i++) {
          newPos += lines[i].length + 1;
        }
        newPos += newColumn;
        moveCursor(newPos);
      } else {
        // At last line, move to end
        moveCursor(value.length);
      }
      return;
    }
    
    // Cursor movement
    if (key.leftArrow) {
      if (key.meta || key.alt || key.option) {
        // Move to previous word
        const newPos = findWordBoundary(value, cursorPosition, 'left');
        moveCursor(newPos);
      } else {
        moveCursor(cursorPosition - 1);
      }
      return;
    }
    
    if (key.rightArrow) {
      if (key.meta || key.alt || key.option) {
        // Move to next word
        const newPos = findWordBoundary(value, cursorPosition, 'right');
        moveCursor(newPos);
      } else {
        moveCursor(cursorPosition + 1);
      }
      return;
    }
    
    // Home/End keys - Ctrl+A / Ctrl+E
    if (key.ctrl && input === 'a') {
      moveCursor(0);
      return;
    }
    
    if (key.ctrl && input === 'e') {
      moveCursor(value.length);
      return;
    }

    // Deletion
    if (key.backspace || key.delete) {
      if (key.meta || key.alt || key.option) {
        // Delete word
        const wordStart = findWordBoundary(value, cursorPosition, 'left');
        deleteText(wordStart, cursorPosition);
      } else if (cursorPosition > 0) {
        deleteText(cursorPosition - 1, cursorPosition);
      }
      return;
    }

    // Text input
    if (input && !key.ctrl && !key.meta) {
      // Check for @ symbol to trigger autocomplete
      if (input === '@') {
        setShowAutocomplete(true);
        setAutocompleteStartPos(cursorPosition + 1);
        setAutocompleteQuery('');
        insertText(input, cursorPosition);
      } else if (showAutocomplete) {
        // Update autocomplete query
        insertText(input, cursorPosition);
        const newQuery = value.slice(autocompleteStartPos, cursorPosition + 1) + input;
        setAutocompleteQuery(newQuery);
      } else {
        insertText(input, cursorPosition);
      }
    }
  });

  // Build display with cursor (handles multiline)
  const getDisplayWithCursor = () => {
    const before = value.slice(0, cursorPosition);
    const after = value.slice(cursorPosition);
    const cursorChar = after[0] || ' ';
    const remaining = after.slice(1);
    
    // For multiline, we need to handle newlines properly
    const beforeLines = before.split('\n');
    const cursorAndAfter = cursorChar + remaining;
    const afterLines = cursorAndAfter.split('\n');
    
    // If we have multiple lines, render them separately
    if (beforeLines.length > 1 || afterLines.length > 1) {
      return (
        <Box flexDirection="column">
          {beforeLines.map((line, i) => {
            if (i < beforeLines.length - 1) {
              // Complete lines before cursor line
              return <Text key={`before-${i}`}>{line}</Text>;
            } else {
              // Last line before cursor + cursor + first line after cursor
              const firstAfterLine = afterLines[0];
              const cursorIsNewline = cursorChar === '\n';
              
              if (cursorIsNewline) {
                // Cursor is on a newline
                return (
                  <Box key={`cursor-line`} flexDirection="column">
                    <Box>
                      <Text>{line}</Text>
                      <Text inverse> </Text>
                    </Box>
                    {afterLines.slice(1).map((afterLine, j) => (
                      <Text key={`after-${j}`}>{afterLine}</Text>
                    ))}
                  </Box>
                );
              } else {
                // Normal cursor in middle of text
                const cursorLineChar = firstAfterLine[0] || ' ';
                const restOfLine = firstAfterLine.slice(1);
                return (
                  <Box key={`cursor-line`} flexDirection="column">
                    <Box>
                      <Text>{line}</Text>
                      <Text inverse>{cursorLineChar}</Text>
                      <Text>{restOfLine}</Text>
                    </Box>
                    {afterLines.slice(1).map((afterLine, j) => (
                      <Text key={`after-${j}`}>{afterLine}</Text>
                    ))}
                  </Box>
                );
              }
            }
          })}
        </Box>
      );
    }
    
    // Single line display
    return (
      <>
        <Text>{before}</Text>
        <Text inverse>{cursorChar}</Text>
        <Text>{remaining}</Text>
      </>
    );
  };

  return (
    <Box flexDirection="column">
      <Box>
        {value ? (
          getDisplayWithCursor()
        ) : (
          <>
            <Text inverse> </Text>
            {placeholder && <Text dimColor>{placeholder}</Text>}
          </>
        )}
      </Box>
      
      {showAutocomplete && fileMatches.length > 0 && (
        <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="cyan" paddingX={1}>
          <Text color="cyan" dimColor>
            {autocompleteQuery ? `Files matching: @${autocompleteQuery}` : 'Files in current directory:'}
          </Text>
          {fileMatches.map((match, index) => (
            <Box key={match.path}>
              <Text color={index === selectedMatchIndex ? 'cyan' : 'gray'}>
                {index === selectedMatchIndex ? '▶ ' : '  '}
                {match.displayPath}
              </Text>
            </Box>
          ))}
          <Text dimColor italic>↑↓ to select, Tab/Enter to complete, Esc to cancel</Text>
        </Box>
      )}
    </Box>
  );
};

export default SimpleEnhancedInput;