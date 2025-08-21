import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { execSync } from 'child_process';
import path from 'path';
import stringWidth from 'string-width';
import chalk from 'chalk';

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
  const [displayValue, setDisplayValue] = useState(value);
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns || 80;
  const [pastedContent, setPastedContent] = useState<Map<number, string>>(new Map());

  // Update cursor when value changes externally
  useEffect(() => {
    // Only update cursor to end if value actually changed and we're not already editing
    if (value.length > 0 && cursorPosition === 0) {
      // This is initial value, keep cursor at 0
    } else if (value === '') {
      setCursorPosition(0);
    }
  }, [value]);

  // Helper function to check if text looks like a paste that should be formatted
  const shouldFormatPaste = (text: string): boolean => {
    // Only format if it's a large paste, not single newlines
    // Single newline = user pressing shift+enter
    // Multiple lines with content = likely a paste
    if (text === '\n') return false; // Single newline is never a paste
    
    const hasMultipleLines = text.includes('\n') && text.length > 1;
    const isVeryLong = text.length > 100;
    // Check for code-like patterns that might break display
    const hasSpecialChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(text);
    const hasAnsiCodes = /\x1b\[[0-9;]*[a-zA-Z]/.test(text);
    
    return hasMultipleLines || isVeryLong || hasSpecialChars || hasAnsiCodes;
  };

  // Helper function to process pasted text
  const processPastedText = (text: string): string => {
    if (!shouldFormatPaste(text)) {
      return text;
    }

    // Generate a unique ID for this paste
    const pasteId = pastedContent.size + 1;
    
    // Store the actual content
    const newPastedContent = new Map(pastedContent);
    newPastedContent.set(pasteId, text);
    setPastedContent(newPastedContent);

    // Count lines in the pasted content
    const lineCount = (text.match(/\n/g) || []).length + 1;
    
    // Return placeholder text
    return `[#${pasteId} pasted ${lineCount} lines]`;
  };

  // Helper function to get the actual value with pasted content restored
  const getActualValue = (): string => {
    let actualValue = displayValue;
    
    // Replace all placeholders with actual content
    pastedContent.forEach((content, id) => {
      const placeholder = `[#${id} pasted ${(content.match(/\n/g) || []).length + 1} lines]`;
      actualValue = actualValue.replace(placeholder, content);
    });
    
    return actualValue;
  };

  // Update display value when value prop changes
  useEffect(() => {
    setDisplayValue(value);
    // Clear pasted content when value is cleared
    if (value === '') {
      setPastedContent(new Map());
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
      
      // Check if query is a directory path (ends with /)
      const isDirectoryPath = query.endsWith('/');
      
      if (query === '') {
        // Show files and directories in the root of the working directory (excluding common dirs)
        searchCmd = `find "${workingDirectory}" -maxdepth 1 \\( ${excludeArgs} -type f -print \\) 2>/dev/null | head -20`;
        dirSearchCmd = `find "${workingDirectory}" -maxdepth 1 \\( ${excludeArgs} -type d -print \\) 2>/dev/null | grep -v "^${workingDirectory}$" | head -10`;
      } else if (isDirectoryPath) {
        // Navigate into directory - show contents of the specified directory
        const dirPath = path.join(workingDirectory, query.slice(0, -1)); // Remove trailing slash
        searchCmd = `find "${dirPath}" -maxdepth 1 \\( ${excludeArgs} -type f -print \\) 2>/dev/null | head -20`;
        dirSearchCmd = `find "${dirPath}" -maxdepth 1 \\( ${excludeArgs} -type d -print \\) 2>/dev/null | grep -v "^${dirPath}$" | head -10`;
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
          // When browsing within a directory, adjust the display path
          let displayPath = relativePath;
          if (isDirectoryPath && query) {
            // We're inside a subdirectory, show just the item name
            displayPath = path.basename(dirPath);
          }
          matches.push({
            path: dirPath,
            displayPath: displayPath + '/',
            type: 'directory'
          });
        }
      }
      
      // Process file matches
      for (const filePath of fileResults) {
        if (isExcluded(filePath)) continue;
        const relativePath = path.relative(workingDirectory, filePath);
        if (relativePath && !relativePath.startsWith('..')) {
          // When browsing within a directory, adjust the display path
          let displayPath = relativePath;
          if (isDirectoryPath && query) {
            // We're inside a subdirectory, show just the item name
            displayPath = path.basename(filePath);
          }
          matches.push({
            path: filePath,
            displayPath: displayPath,
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

  const insertText = (text: string, position: number, isPaste: boolean = false) => {
    // Process text if it's a paste
    const processedText = isPaste ? processPastedText(text) : text;
    
    const before = displayValue.slice(0, position);
    const after = displayValue.slice(position);
    const newDisplayValue = before + processedText + after;
    setDisplayValue(newDisplayValue);
    
    // Update the actual value with processed text (placeholder for pastes)
    const newValue = before + processedText + after;
    onChange(newValue);
    
    // Update cursor position - just move by the length of inserted text
    // Don't add any special handling for wrapping
    const newCursorPos = position + processedText.length;
    setCursorPosition(newCursorPos);
  };

  const deleteText = (start: number, end: number) => {
    const before = displayValue.slice(0, start);
    const after = displayValue.slice(end);
    const newDisplayValue = before + after;
    setDisplayValue(newDisplayValue);
    onChange(newDisplayValue);
    setCursorPosition(start);
  };

  const moveCursor = (position: number) => {
    const clampedPosition = Math.max(0, Math.min(displayValue.length, position));
    setCursorPosition(clampedPosition);
  };

  // Gemini CLI-style buffer system with proper line tracking
  const getBuffer = (text: string, width: number) => {
    const lines: string[] = [];
    let charPosition = 0;
    const charToLineMap: Array<{ line: number; col: number }> = [];
    
    // Split by actual newlines first
    const logicalLines = text.split('\n');
    
    for (let logicalIdx = 0; logicalIdx < logicalLines.length; logicalIdx++) {
      const logicalLine = logicalLines[logicalIdx];
      
      if (logicalLine.length === 0) {
        // Empty line
        lines.push('');
        charToLineMap[charPosition] = { line: lines.length - 1, col: 0 };
        charPosition += 1; // for the newline
      } else {
        // Break this logical line into visual lines
        let remaining = logicalLine;
        let isFirstWrap = true;
        
        while (remaining.length > 0) {
          let lineContent = '';
          let charsUsed = 0;
          
          // Try to fit as many complete words as possible
          const words = remaining.split(' ');
          let wordIndex = 0;
          
          while (wordIndex < words.length) {
            const word = words[wordIndex];
            const separator = (wordIndex === 0 || lineContent === '') ? '' : ' ';
            const testContent = lineContent + separator + word;
            
            if (stringWidth(testContent) <= width) {
              lineContent = testContent;
              charsUsed += (separator + word).length;
              wordIndex++;
            } else {
              // This word doesn't fit
              if (lineContent === '') {
                // Word is longer than line width, break it
                let charCount = 0;
                for (let i = 0; i < word.length; i++) {
                  const testChar = word.slice(0, i + 1);
                  if (stringWidth(testChar) <= width) {
                    charCount = i + 1;
                  } else {
                    break;
                  }
                }
                lineContent = word.slice(0, Math.max(1, charCount));
                charsUsed = lineContent.length;
              }
              break;
            }
          }
          
          // Add this visual line
          lines.push(lineContent);
          
          // Map character positions to line/col
          for (let i = 0; i < charsUsed; i++) {
            charToLineMap[charPosition + i] = { 
              line: lines.length - 1, 
              col: i 
            };
          }
          
          // Move to next part
          remaining = remaining.slice(charsUsed).trimStart();
          charPosition += charsUsed;
          
          // Skip spaces that were trimmed
          const originalRemaining = logicalLine.slice(charPosition - (logicalIdx === 0 ? 0 : logicalIdx));
          const spacesToSkip = originalRemaining.length - remaining.length - charsUsed;
          if (spacesToSkip > 0 && !isFirstWrap) {
            charPosition += spacesToSkip;
          }
          isFirstWrap = false;
        }
      }
      
      // Add newline mapping if not last logical line
      if (logicalIdx < logicalLines.length - 1) {
        charToLineMap[charPosition] = { 
          line: lines.length - 1, 
          col: lines[lines.length - 1]?.length || 0 
        };
        charPosition += 1;
      }
    }
    
    // Handle cursor at end
    if (charPosition <= text.length) {
      charToLineMap[text.length] = { 
        line: Math.max(0, lines.length - 1), 
        col: lines[lines.length - 1]?.length || 0 
      };
    }
    
    return { lines, charToLineMap };
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
    const before = displayValue.slice(0, autocompleteStartPos);
    const after = displayValue.slice(cursorPosition);
    
    // Build the complete path to insert
    let completePath: string;
    if (autocompleteQuery.endsWith('/')) {
      // We're in a subdirectory, need to build the full path
      completePath = autocompleteQuery + match.displayPath.replace(/\/$/, ''); // Remove trailing slash from directories
    } else {
      // Use the relative path from working directory
      completePath = path.relative(workingDirectory, match.path);
    }
    
    const newDisplayValue = before + completePath + after;
    setDisplayValue(newDisplayValue);
    onChange(newDisplayValue);
    setCursorPosition(autocompleteStartPos + completePath.length);
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
      } else if (key.rightArrow) {
        // Navigate into directory with right arrow
        if (fileMatches.length > 0) {
          const selectedMatch = fileMatches[selectedMatchIndex];
          if (selectedMatch.type === 'directory') {
            // Build the full path for navigation
            let newQuery: string;
            if (autocompleteQuery.endsWith('/')) {
              // We're already in a directory, append the selected subdirectory
              newQuery = autocompleteQuery + selectedMatch.displayPath;
            } else if (autocompleteQuery) {
              // We have a search query, replace it with the full path
              const relativePath = path.relative(workingDirectory, selectedMatch.path);
              newQuery = relativePath + '/';
            } else {
              // We're at root, use the display path
              newQuery = selectedMatch.displayPath;
            }
            setAutocompleteQuery(newQuery);
            // Trigger a new search within this directory
            searchFiles(newQuery);
          }
        }
        return;
      } else if (key.leftArrow) {
        // Navigate back/up one directory level with left arrow
        if (autocompleteQuery.includes('/')) {
          // Remove the last directory segment
          const segments = autocompleteQuery.split('/');
          segments.pop(); // Remove last segment
          if (segments.length > 0) {
            segments.pop(); // Remove the directory we're going back from
            const newQuery = segments.length > 0 ? segments.join('/') + '/' : '';
            setAutocompleteQuery(newQuery);
            searchFiles(newQuery);
          } else {
            // Go back to root
            setAutocompleteQuery('');
            searchFiles('');
          }
        } else if (autocompleteQuery !== '') {
          // Go back to root if we have a query but no slashes
          setAutocompleteQuery('');
          searchFiles('');
        }
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
    
    if (key.shift && key.return) {
      // Insert newline for multiline input
      // Force insert a newline character directly into the value
      const before = displayValue.slice(0, cursorPosition);
      const after = displayValue.slice(cursorPosition);
      const newValue = before + '\n' + after;
      setDisplayValue(newValue);
      onChange(newValue);
      setCursorPosition(cursorPosition + 1);
      return;
    }
    
    if (key.return && !key.shift) {
      // Get the actual value with pasted content restored before submitting
      const actualValue = getActualValue();
      onChange(actualValue);
      onSubmit?.();
      return;
    }

    // Buffer-based navigation like Gemini CLI
    if (!showAutocomplete && key.upArrow) {
      const inputWidth = Math.max(1, terminalWidth - 4);
      const buffer = getBuffer(displayValue, inputWidth);
      const currentPos = buffer.charToLineMap[cursorPosition] || { line: 0, col: 0 };
      
      if (currentPos.line > 0) {
        const targetLine = currentPos.line - 1;
        const targetLineLength = buffer.lines[targetLine].length;
        const targetColumn = Math.min(currentPos.col, targetLineLength);
        
        // Find character position for this line/column
        let newCursorPos = 0;
        for (let charPos = 0; charPos < displayValue.length; charPos++) {
          const mapped = buffer.charToLineMap[charPos];
          if (mapped && mapped.line === targetLine && mapped.col === targetColumn) {
            newCursorPos = charPos;
            break;
          }
        }
        moveCursor(newCursorPos);
      }
      return;
    }
    
    if (!showAutocomplete && key.downArrow) {
      const inputWidth = Math.max(1, terminalWidth - 4);
      const buffer = getBuffer(displayValue, inputWidth);
      const currentPos = buffer.charToLineMap[cursorPosition] || { line: 0, col: 0 };
      
      if (currentPos.line < buffer.lines.length - 1) {
        const targetLine = currentPos.line + 1;
        const targetLineLength = buffer.lines[targetLine].length;
        const targetColumn = Math.min(currentPos.col, targetLineLength);
        
        // Find character position for this line/column
        let newCursorPos = displayValue.length;
        for (let charPos = 0; charPos <= displayValue.length; charPos++) {
          const mapped = buffer.charToLineMap[charPos];
          if (mapped && mapped.line === targetLine && mapped.col === targetColumn) {
            newCursorPos = charPos;
            break;
          }
        }
        moveCursor(newCursorPos);
      } else {
        // At last line, move to end
        moveCursor(displayValue.length);
      }
      return;
    }
    
    // Cursor movement
    if (key.leftArrow) {
      if (key.meta || key.alt || key.option) {
        // Move to previous word
        const newPos = findWordBoundary(displayValue, cursorPosition, 'left');
        moveCursor(newPos);
      } else {
        // Regular left movement - skip over newlines
        if (cursorPosition > 0) {
          moveCursor(cursorPosition - 1);
        }
      }
      return;
    }
    
    if (key.rightArrow) {
      if (key.meta || key.alt || key.option) {
        // Move to next word
        const newPos = findWordBoundary(displayValue, cursorPosition, 'right');
        moveCursor(newPos);
      } else {
        // Regular right movement - skip over newlines
        if (cursorPosition < displayValue.length) {
          moveCursor(cursorPosition + 1);
        }
      }
      return;
    }
    
    // Home/End keys - Ctrl+A / Ctrl+E
    if (key.ctrl && input === 'a') {
      moveCursor(0);
      return;
    }
    
    if (key.ctrl && input === 'e') {
      moveCursor(displayValue.length);
      return;
    }

    // Deletion
    if (key.backspace || key.delete) {
      if (key.meta || key.alt || key.option) {
        // Delete word
        const wordStart = findWordBoundary(displayValue, cursorPosition, 'left');
        deleteText(wordStart, cursorPosition);
      } else if (cursorPosition > 0) {
        deleteText(cursorPosition - 1, cursorPosition);
      }
      return;
    }

    // Text input
    if (input && !key.ctrl && !key.meta) {
      // Detect paste by checking if input is unusually long or contains special characters
      const isPaste = input.length > 1 && shouldFormatPaste(input);
      
      // Use input as-is - terminal wrapping is visual only, not actual newlines
      const filteredInput = input;
      
      // Check for @ symbol to trigger autocomplete
      if (filteredInput === '@') {
        setShowAutocomplete(true);
        setAutocompleteStartPos(cursorPosition + 1);
        setAutocompleteQuery('');
        insertText(filteredInput, cursorPosition, false);
      } else if (showAutocomplete) {
        // Update autocomplete query
        insertText(filteredInput, cursorPosition, isPaste);
        const newQuery = displayValue.slice(autocompleteStartPos, cursorPosition + 1) + filteredInput;
        setAutocompleteQuery(newQuery);
      } else {
        insertText(filteredInput, cursorPosition, isPaste);
      }
    }
  });

  // Gemini CLI-style display with proper buffer-based cursor calculation
  const getDisplayWithCursor = () => {
    const inputWidth = Math.max(1, terminalWidth - 4);
    const buffer = getBuffer(displayValue, inputWidth);
    
    // Get cursor position from the character map
    const cursorPos = buffer.charToLineMap[cursorPosition] || { line: 0, col: 0 };
    const cursorLine = cursorPos.line;
    const cursorColumn = cursorPos.col;
    
    
    // Handle empty input
    if (buffer.lines.length === 0 || (buffer.lines.length === 1 && buffer.lines[0] === '')) {
      return (
        <Box>
          <Text>{chalk.inverse(' ')}</Text>
          {placeholder && <Text dimColor>{placeholder}</Text>}
        </Box>
      );
    }
    
    
    return (
      <Box flexDirection="column">
        {buffer.lines.map((line, idx) => {
          if (idx === cursorLine) {
            // Line with cursor - exact Gemini CLI approach
            const beforeCursor = line.slice(0, cursorColumn);
            const atCursor = line[cursorColumn] || ' ';
            const afterCursor = line.slice(cursorColumn + 1);
            
            return (
              <Box key={idx}>
                <Text>{beforeCursor}</Text>
                <Text>{chalk.inverse(atCursor)}</Text>
                <Text>{afterCursor}</Text>
              </Box>
            );
          } else {
            return <Text key={idx}>{line}</Text>;
          }
        })}
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      <Box>
        {displayValue ? (
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
            {autocompleteQuery.endsWith('/') 
              ? `Browsing: @${autocompleteQuery}` 
              : autocompleteQuery 
                ? `Files matching: @${autocompleteQuery}` 
                : 'Files in current directory:'}
          </Text>
          {fileMatches.map((match, index) => (
            <Box key={match.path}>
              <Text color={index === selectedMatchIndex ? 'cyan' : 'gray'}>
                {index === selectedMatchIndex ? '▶ ' : '  '}
                {match.displayPath}
              </Text>
            </Box>
          ))}
          <Text dimColor italic>
            ↑↓ select • → enter directory • ← go back • Tab/Enter complete • Esc cancel
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default SimpleEnhancedInput;