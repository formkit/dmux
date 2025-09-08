import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useFocus } from 'ink';

interface SimpleGeminiInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  multiline?: boolean;
  placeholder?: string;
}

const SimpleGeminiInput: React.FC<SimpleGeminiInputProps> = ({
  value,
  onChange,
  onSubmit,
  onCancel,
  multiline = false,
  placeholder = ''
}) => {
  const { isFocused } = useFocus({ autoFocus: true });
  const [cursorOffset, setCursorOffset] = useState(0);

  // Keep cursor in bounds when value changes
  useEffect(() => {
    if (cursorOffset > value.length) {
      setCursorOffset(value.length);
    }
  }, [value, cursorOffset]);

  useInput((input: string, key: any) => {
    if (!isFocused) return;

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
      // Add newline in multiline mode
      const before = value.slice(0, cursorOffset);
      const after = value.slice(cursorOffset);
      onChange(before + '\n' + after);
      setCursorOffset(cursorOffset + 1);
      return;
    }

    if (key.return && multiline && key.shift) {
      // Shift+Enter submits in multiline mode
      onSubmit?.();
      return;
    }

    // Handle backspace - delete character BEFORE cursor
    if (key.backspace) {
      if (cursorOffset > 0) {
        const before = value.slice(0, cursorOffset - 1);
        const after = value.slice(cursorOffset);
        onChange(before + after);
        setCursorOffset(cursorOffset - 1);
      }
      return;
    }

    // Handle delete - delete character AT cursor
    if (key.delete) {
      if (cursorOffset < value.length) {
        const before = value.slice(0, cursorOffset);
        const after = value.slice(cursorOffset + 1);
        onChange(before + after);
        // Cursor stays in same position
      }
      return;
    }

    // Handle arrow keys
    if (key.leftArrow) {
      if (cursorOffset > 0) {
        setCursorOffset(cursorOffset - 1);
      }
      return;
    }

    if (key.rightArrow) {
      if (cursorOffset < value.length) {
        setCursorOffset(cursorOffset + 1);
      }
      return;
    }

    // Handle up/down for multiline
    if (multiline) {
      const lines = value.split('\n');
      let currentPos = 0;
      let currentLine = 0;
      let colInLine = 0;
      
      // Find current line and column
      for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length;
        if (currentPos + lineLength >= cursorOffset) {
          currentLine = i;
          colInLine = cursorOffset - currentPos;
          break;
        }
        currentPos += lineLength + 1; // +1 for newline
      }

      if (key.upArrow) {
        if (currentLine > 0) {
          // Move to previous line, same column or end of line
          const prevLine = lines[currentLine - 1];
          const newCol = Math.min(colInLine, prevLine.length);
          let newOffset = 0;
          for (let i = 0; i < currentLine - 1; i++) {
            newOffset += lines[i].length + 1;
          }
          newOffset += newCol;
          setCursorOffset(newOffset);
        } else {
          // Already at first line, move to start
          setCursorOffset(0);
        }
        return;
      }

      if (key.downArrow) {
        if (currentLine < lines.length - 1) {
          // Move to next line, same column or end of line
          const nextLine = lines[currentLine + 1];
          const newCol = Math.min(colInLine, nextLine.length);
          let newOffset = 0;
          for (let i = 0; i <= currentLine; i++) {
            newOffset += lines[i].length + 1;
          }
          newOffset += newCol;
          setCursorOffset(newOffset);
        } else {
          // Already at last line, move to end
          setCursorOffset(value.length);
        }
        return;
      }
    }

    // Handle Home/End
    if (key.ctrl && input === 'a') {
      if (multiline) {
        // Move to start of current line
        const beforeCursor = value.slice(0, cursorOffset);
        const lastNewline = beforeCursor.lastIndexOf('\n');
        setCursorOffset(lastNewline === -1 ? 0 : lastNewline + 1);
      } else {
        setCursorOffset(0);
      }
      return;
    }

    if (key.ctrl && input === 'e') {
      if (multiline) {
        // Move to end of current line
        const afterCursor = value.slice(cursorOffset);
        const nextNewline = afterCursor.indexOf('\n');
        if (nextNewline === -1) {
          setCursorOffset(value.length);
        } else {
          setCursorOffset(cursorOffset + nextNewline);
        }
      } else {
        setCursorOffset(value.length);
      }
      return;
    }

    // Handle regular text input
    if (input && !key.ctrl && !key.meta) {
      const before = value.slice(0, cursorOffset);
      const after = value.slice(cursorOffset);
      onChange(before + input + after);
      setCursorOffset(cursorOffset + input.length);
    }
  });

  // Render the display with cursor
  const renderDisplay = () => {
    // Show placeholder when empty
    if (value === '' && placeholder) {
      return (
        <>
          <Text dimColor>{placeholder}</Text>
          <Text inverse>{' '}</Text>
        </>
      );
    }

    // For multiline, split and render each line
    if (multiline) {
      const lines = value.split('\n');
      let currentPos = 0;
      const elements: React.ReactNode[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineStart = currentPos;
        const lineEnd = currentPos + line.length;
        
        if (i > 0) {
          elements.push(<Text key={`indent-${i}`}>{'  '}</Text>);
        }
        
        if (cursorOffset >= lineStart && cursorOffset <= lineEnd) {
          // This line contains the cursor
          const posInLine = cursorOffset - lineStart;
          const before = line.slice(0, posInLine);
          const cursorChar = line[posInLine] || ' ';
          const after = line.slice(posInLine + 1);
          
          elements.push(
            <React.Fragment key={`line-${i}`}>
              <Text>{before}</Text>
              <Text inverse>{cursorChar}</Text>
              <Text>{after}</Text>
            </React.Fragment>
          );
        } else {
          // Normal line without cursor
          elements.push(<Text key={`line-${i}`}>{line || ' '}</Text>);
        }
        
        // Add newline representation except for last line
        if (i < lines.length - 1) {
          elements.push(<Text key={`newline-${i}`}>{'\n'}</Text>);
        }
        
        currentPos = lineEnd + 1; // +1 for newline
      }
      
      // Handle cursor at very end after a newline
      if (cursorOffset === value.length && value.endsWith('\n')) {
        elements.push(<Text key="indent-end">{'  '}</Text>);
        elements.push(<Text key="cursor-end" inverse>{' '}</Text>);
      }
      
      return <>{elements}</>;
    }

    // Single line rendering
    const before = value.slice(0, cursorOffset);
    const cursorChar = value[cursorOffset] || ' ';
    const after = value.slice(cursorOffset + 1);

    return (
      <>
        <Text>{before}</Text>
        <Text inverse>{cursorChar}</Text>
        <Text>{after}</Text>
      </>
    );
  };

  return (
    <Box>
      <Text>{'> '}</Text>
      {renderDisplay()}
    </Box>
  );
};

export default SimpleGeminiInput;