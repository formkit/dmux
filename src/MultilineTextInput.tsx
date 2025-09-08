import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useFocus } from 'ink';
import chalk from 'chalk';

interface MultilineTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
}

const MultilineTextInput: React.FC<MultilineTextInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = 'Type your message...'
}) => {
  const { isFocused } = useFocus({ autoFocus: true });
  const [cursorPosition, setCursorPosition] = useState(0);

  // Keep cursor in bounds
  useEffect(() => {
    if (cursorPosition > value.length) {
      setCursorPosition(value.length);
    }
  }, [value.length, cursorPosition]);

  const getCurrentLineAndColumn = useCallback(() => {
    let lineNumber = 0;
    let columnNumber = 0;
    let charCount = 0;
    
    const lines = value.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const lineLength = lines[i].length;
      
      if (charCount + lineLength >= cursorPosition) {
        lineNumber = i;
        columnNumber = cursorPosition - charCount;
        break;
      }
      
      charCount += lineLength + 1; // +1 for newline
    }
    
    return { lineNumber, columnNumber, lines };
  }, [value, cursorPosition]);

  const positionFromLineColumn = (lineNumber: number, columnNumber: number, lines: string[]) => {
    let position = 0;
    
    for (let i = 0; i < lineNumber && i < lines.length; i++) {
      position += lines[i].length + 1; // +1 for newline
    }
    
    if (lineNumber < lines.length) {
      position += Math.min(columnNumber, lines[lineNumber].length);
    }
    
    return position;
  };

  useInput((input, key) => {
    if (!isFocused) return;

    // Handle escape
    if (key.escape) {
      onChange('');
      setCursorPosition(0);
      return;
    }

    // Handle submit
    if (key.return && key.shift) {
      onSubmit?.();
      return;
    }

    // Handle enter (new line)
    if (key.return) {
      const before = value.slice(0, cursorPosition);
      const after = value.slice(cursorPosition);
      onChange(before + '\n' + after);
      setCursorPosition(cursorPosition + 1);
      return;
    }

    // Handle backspace
    if (key.backspace) {
      if (cursorPosition > 0) {
        const before = value.slice(0, cursorPosition - 1);
        const after = value.slice(cursorPosition);
        onChange(before + after);
        setCursorPosition(cursorPosition - 1);
      }
      return;
    }

    // Handle delete
    if (key.delete) {
      if (cursorPosition < value.length) {
        const before = value.slice(0, cursorPosition);
        const after = value.slice(cursorPosition + 1);
        onChange(before + after);
      }
      return;
    }

    // Handle left arrow
    if (key.leftArrow) {
      if (key.meta || key.ctrl) {
        // Move to beginning of line
        const { lineNumber, lines } = getCurrentLineAndColumn();
        const newPosition = positionFromLineColumn(lineNumber, 0, lines);
        setCursorPosition(newPosition);
      } else {
        setCursorPosition(Math.max(0, cursorPosition - 1));
      }
      return;
    }

    // Handle right arrow
    if (key.rightArrow) {
      if (key.meta || key.ctrl) {
        // Move to end of line
        const { lineNumber, lines } = getCurrentLineAndColumn();
        const lineLength = lines[lineNumber]?.length || 0;
        const newPosition = positionFromLineColumn(lineNumber, lineLength, lines);
        setCursorPosition(newPosition);
      } else {
        setCursorPosition(Math.min(value.length, cursorPosition + 1));
      }
      return;
    }

    // Handle up arrow
    if (key.upArrow) {
      const { lineNumber, columnNumber, lines } = getCurrentLineAndColumn();
      
      if (lineNumber > 0) {
        const targetLine = lineNumber - 1;
        const targetColumn = Math.min(columnNumber, lines[targetLine].length);
        const newPosition = positionFromLineColumn(targetLine, targetColumn, lines);
        setCursorPosition(newPosition);
      }
      return;
    }

    // Handle down arrow
    if (key.downArrow) {
      const { lineNumber, columnNumber, lines } = getCurrentLineAndColumn();
      
      if (lineNumber < lines.length - 1) {
        const targetLine = lineNumber + 1;
        const targetColumn = Math.min(columnNumber, lines[targetLine].length);
        const newPosition = positionFromLineColumn(targetLine, targetColumn, lines);
        setCursorPosition(newPosition);
      }
      return;
    }

    // Handle ctrl+a (home)
    if (key.ctrl && input === 'a') {
      const { lineNumber, lines } = getCurrentLineAndColumn();
      const newPosition = positionFromLineColumn(lineNumber, 0, lines);
      setCursorPosition(newPosition);
      return;
    }

    // Handle ctrl+e (end)
    if (key.ctrl && input === 'e') {
      const { lineNumber, lines } = getCurrentLineAndColumn();
      const lineLength = lines[lineNumber]?.length || 0;
      const newPosition = positionFromLineColumn(lineNumber, lineLength, lines);
      setCursorPosition(newPosition);
      return;
    }

    // Handle regular text input
    if (input && !key.ctrl && !key.meta) {
      const before = value.slice(0, cursorPosition);
      const after = value.slice(cursorPosition);
      onChange(before + input + after);
      setCursorPosition(cursorPosition + input.length);
    }
  });

  // Render the text with cursor
  const renderContent = () => {
    if (!value && placeholder) {
      return (
        <Box>
          <Text dimColor>{placeholder}</Text>
          <Text inverse>{' '}</Text>
        </Box>
      );
    }

    const lines = value.split('\n');
    const { lineNumber: cursorLine, columnNumber: cursorCol } = getCurrentLineAndColumn();
    
    return (
      <Box flexDirection="column">
        {lines.map((line, index) => {
          const isFirstLine = index === 0;
          const isCursorLine = index === cursorLine;
          
          if (!isCursorLine) {
            return (
              <Box key={index}>
                {!isFirstLine && <Text>{'  '}</Text>}
                <Text>{line || ' '}</Text>
              </Box>
            );
          }
          
          // Render line with cursor
          const before = line.slice(0, cursorCol);
          const atCursor = line[cursorCol] || ' ';
          const after = line.slice(cursorCol + 1);
          
          return (
            <Box key={index}>
              {!isFirstLine && <Text>{'  '}</Text>}
              <Text>{before}</Text>
              <Text inverse>{atCursor}</Text>
              <Text>{after}</Text>
            </Box>
          );
        })}
      </Box>
    );
  };

  return (
    <Box flexDirection="row" alignItems="flex-start">
      <Text>{'> '}</Text>
      <Box flexGrow={1}>
        {renderContent()}
      </Box>
    </Box>
  );
};

export default MultilineTextInput;