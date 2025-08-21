import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useFocus } from 'ink';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

interface EnhancedTextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  onCancel?: () => void;
  multiline?: boolean;
  workingDirectory?: string;
}

interface FileMatch {
  path: string;
  displayPath: string;
  type: 'file' | 'directory';
}

const EnhancedTextInput: React.FC<EnhancedTextInputProps> = ({
  value,
  onChange,
  placeholder = '',
  onSubmit,
  onCancel,
  multiline = false,
  workingDirectory = process.cwd()
}) => {
  const { isFocused } = useFocus({ autoFocus: true });
  const [cursorPosition, setCursorPosition] = useState(value.length);
  const [lines, setLines] = useState<string[]>([value]);
  const [currentLine, setCurrentLine] = useState(0);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [autocompleteStartPos, setAutocompleteStartPos] = useState(0);
  const [fileMatches, setFileMatches] = useState<FileMatch[]>([]);
  const [selectedMatchIndex, setSelectedMatchIndex] = useState(0);
  const [displayValue, setDisplayValue] = useState(value);

  // Update lines when value changes externally
  useEffect(() => {
    if (multiline) {
      setLines(value.split('\n'));
    } else {
      setLines([value]);
    }
    setDisplayValue(value);
  }, [value, multiline]);

  // Search for files when autocomplete query changes
  useEffect(() => {
    if (showAutocomplete && autocompleteQuery.length > 0) {
      searchFiles(autocompleteQuery);
    } else {
      setFileMatches([]);
    }
  }, [autocompleteQuery, showAutocomplete]);

  const searchFiles = async (query: string) => {
    try {
      // Use find command to search for files
      const searchCmd = `find "${workingDirectory}" -type f -name "*${query}*" 2>/dev/null | head -20`;
      const dirSearchCmd = `find "${workingDirectory}" -type d -name "*${query}*" 2>/dev/null | head -10`;
      
      const fileResults: string[] = await new Promise((resolve) => {
        try {
          const result = execSync(searchCmd, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
          resolve(result);
        } catch {
          resolve([]);
        }
      });
      
      const dirResults: string[] = await new Promise((resolve) => {
        try {
          const result = execSync(dirSearchCmd, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
          resolve(result);
        } catch {
          resolve([]);
        }
      });

      const matches: FileMatch[] = [];
      
      // Process directory matches
      for (const dirPath of dirResults) {
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
        const relativePath = path.relative(workingDirectory, filePath);
        if (relativePath && !relativePath.startsWith('..')) {
          matches.push({
            path: filePath,
            displayPath: relativePath,
            type: 'file'
          });
        }
      }
      
      // Sort by relevance (shorter paths first, then alphabetically)
      matches.sort((a, b) => {
        const aScore = a.displayPath.length + (a.displayPath.toLowerCase().indexOf(query.toLowerCase()) === 0 ? 0 : 100);
        const bScore = b.displayPath.length + (b.displayPath.toLowerCase().indexOf(query.toLowerCase()) === 0 ? 0 : 100);
        if (aScore !== bScore) return aScore - bScore;
        return a.displayPath.localeCompare(b.displayPath);
      });
      
      setFileMatches(matches.slice(0, 10)); // Limit to 10 matches
      setSelectedMatchIndex(0);
    } catch (error) {
      setFileMatches([]);
    }
  };

  const insertText = (text: string, position: number) => {
    const before = displayValue.slice(0, position);
    const after = displayValue.slice(position);
    const newValue = before + text + after;
    onChange(newValue);
    setCursorPosition(position + text.length);
  };

  const deleteText = (start: number, end: number) => {
    const before = displayValue.slice(0, start);
    const after = displayValue.slice(end);
    const newValue = before + after;
    onChange(newValue);
    setCursorPosition(start);
  };

  const moveCursor = (position: number) => {
    const clampedPosition = Math.max(0, Math.min(displayValue.length, position));
    setCursorPosition(clampedPosition);
  };

  const findWordBoundary = (text: string, position: number, direction: 'left' | 'right'): number => {
    const wordRegex = /\w/;
    let pos = position;
    
    if (direction === 'left') {
      // Skip any whitespace
      while (pos > 0 && !wordRegex.test(text[pos - 1])) {
        pos--;
      }
      // Skip the word
      while (pos > 0 && wordRegex.test(text[pos - 1])) {
        pos--;
      }
    } else {
      // Skip any whitespace
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
    // Replace the autocomplete query with the selected file path
    const before = displayValue.slice(0, autocompleteStartPos);
    const after = displayValue.slice(cursorPosition);
    const newValue = before + match.displayPath + after;
    onChange(newValue);
    setCursorPosition(autocompleteStartPos + match.displayPath.length);
    setShowAutocomplete(false);
    setAutocompleteQuery('');
  };

  useInput((input: string, key: any) => {
    // Only handle input when focused
    if (!isFocused) return;
    
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
    
    if (key.return && !multiline) {
      onSubmit?.();
      return;
    }
    
    if (key.return && multiline && !key.shift) {
      // In multiline mode, Enter adds a new line
      insertText('\n', cursorPosition);
      return;
    }
    
    if (key.return && multiline && key.shift) {
      // Shift+Enter submits in multiline mode
      onSubmit?.();
      return;
    }

    // Cursor movement
    if (key.leftArrow) {
      if (key.meta || key.alt) {
        // Move to previous word (Alt/Cmd + Left)
        const newPos = findWordBoundary(displayValue, cursorPosition, 'left');
        moveCursor(newPos);
      } else {
        moveCursor(cursorPosition - 1);
      }
      return;
    }
    
    if (key.rightArrow) {
      if (key.meta || key.alt) {
        // Move to next word (Alt/Cmd + Right)
        const newPos = findWordBoundary(displayValue, cursorPosition, 'right');
        moveCursor(newPos);
      } else {
        moveCursor(cursorPosition + 1);
      }
      return;
    }
    
    // Line navigation for multiline
    if (multiline) {
      if (key.upArrow) {
        // Move to line above
        const lineStart = displayValue.lastIndexOf('\n', cursorPosition - 1);
        if (lineStart !== -1) {
          const currentCol = cursorPosition - lineStart - 1;
          const prevLineStart = displayValue.lastIndexOf('\n', lineStart - 1);
          const prevLineLength = lineStart - prevLineStart - 1;
          const newPos = prevLineStart + 1 + Math.min(currentCol, prevLineLength);
          moveCursor(newPos);
        }
        return;
      }
      
      if (key.downArrow) {
        // Move to line below
        const lineEnd = displayValue.indexOf('\n', cursorPosition);
        if (lineEnd !== -1) {
          const lineStart = displayValue.lastIndexOf('\n', cursorPosition - 1);
          const currentCol = cursorPosition - lineStart - 1;
          const nextLineEnd = displayValue.indexOf('\n', lineEnd + 1);
          const nextLineLength = (nextLineEnd === -1 ? displayValue.length : nextLineEnd) - lineEnd - 1;
          const newPos = lineEnd + 1 + Math.min(currentCol, nextLineLength);
          moveCursor(newPos);
        }
        return;
      }
    }
    
    // Home/End keys
    if (key.ctrl && input === 'a') {
      // Ctrl+A - Move to start of line
      if (multiline) {
        const lineStart = displayValue.lastIndexOf('\n', cursorPosition - 1) + 1;
        moveCursor(lineStart);
      } else {
        moveCursor(0);
      }
      return;
    }
    
    if (key.ctrl && input === 'e') {
      // Ctrl+E - Move to end of line
      if (multiline) {
        const lineEnd = displayValue.indexOf('\n', cursorPosition);
        moveCursor(lineEnd === -1 ? displayValue.length : lineEnd);
      } else {
        moveCursor(displayValue.length);
      }
      return;
    }

    // Deletion
    if (key.backspace) {
      if (key.meta || key.alt) {
        // Delete word (Alt/Cmd + Backspace)
        const wordStart = findWordBoundary(displayValue, cursorPosition, 'left');
        deleteText(wordStart, cursorPosition);
      } else if (cursorPosition > 0) {
        deleteText(cursorPosition - 1, cursorPosition);
      }
      return;
    }
    
    if (key.delete) {
      if (key.meta || key.alt) {
        // Delete word forward (Alt/Cmd + Delete)
        const wordEnd = findWordBoundary(displayValue, cursorPosition, 'right');
        deleteText(cursorPosition, wordEnd);
      } else if (cursorPosition < displayValue.length) {
        deleteText(cursorPosition, cursorPosition + 1);
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
        const newQuery = displayValue.slice(autocompleteStartPos, cursorPosition + 1);
        setAutocompleteQuery(newQuery);
      } else {
        insertText(input, cursorPosition);
      }
    }
  });

  // Build display with cursor
  const getDisplayWithCursor = () => {
    const before = displayValue.slice(0, cursorPosition);
    const after = displayValue.slice(cursorPosition);
    const cursorChar = after[0] || ' ';
    const remaining = after.slice(1);
    
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
        {displayValue ? (
          getDisplayWithCursor()
        ) : (
          <>
            <Text dimColor>{placeholder}</Text>
            <Text inverse> </Text>
          </>
        )}
      </Box>
      
      {showAutocomplete && fileMatches.length > 0 && (
        <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="cyan" paddingX={1}>
          <Text color="cyan" dimColor>Files matching: @{autocompleteQuery}</Text>
          {fileMatches.map((match, index) => (
            <Box key={match.path}>
              <Text color={index === selectedMatchIndex ? 'cyan' : 'gray'}>
                {index === selectedMatchIndex ? '▶ ' : '  '}
                {match.type === 'directory' ? '📁 ' : '📄 '}
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

export default EnhancedTextInput;