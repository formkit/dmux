import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useFocus } from 'ink';

interface CleanTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
}

const CleanTextInput: React.FC<CleanTextInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = 'Type your message...'
}) => {
  const { isFocused } = useFocus({ autoFocus: true });
  const [cursor, setCursor] = useState(value.length);

  // Keep cursor in bounds
  useEffect(() => {
    if (cursor > value.length) {
      setCursor(value.length);
    }
  }, [value.length, cursor]);

  useInput((input, key) => {
    if (!isFocused) return;

    // Escape clears
    if (key.escape) {
      onChange('');
      setCursor(0);
      return;
    }

    // Shift+Enter submits
    if (key.return && key.shift) {
      onSubmit?.();
      return;
    }

    // Enter adds newline
    if (key.return) {
      const before = value.slice(0, cursor);
      const after = value.slice(cursor);
      const newValue = before + '\n' + after;
      onChange(newValue);
      setCursor(cursor + 1);
      return;
    }

    // Backspace deletes BEFORE cursor
    // IMPORTANT: Some terminals send 'delete' key when backspace is pressed
    // Handle both key.backspace and key.delete as backspace
    if (key.backspace || key.delete || input === '\x7f' || input === '\x08') {
      if (cursor > 0) {
        const before = value.slice(0, cursor - 1);
        const after = value.slice(cursor);
        const newValue = before + after;
        onChange(newValue);
        setCursor(cursor - 1);
      }
      return;
    }

    // Forward delete (actual delete key behavior) - removed since we're treating delete as backspace
    // If you need forward delete, use a different key combination

    // Left arrow
    if (key.leftArrow) {
      setCursor(Math.max(0, cursor - 1));
      return;
    }

    // Right arrow
    if (key.rightArrow) {
      setCursor(Math.min(value.length, cursor + 1));
      return;
    }

    // Up/Down arrows for multiline navigation
    if ((key.upArrow || key.downArrow) && value.includes('\n')) {
      const lines = value.split('\n');
      let pos = 0;
      let lineIdx = 0;
      let col = 0;
      
      // Find current position - FIXED calculation
      for (let i = 0; i < lines.length; i++) {
        const lineEndPos = pos + lines[i].length;
        if (cursor <= lineEndPos) {
          lineIdx = i;
          col = cursor - pos;
          break;
        }
        pos = lineEndPos + 1;
      }
      
      if (key.upArrow && lineIdx > 0) {
        const targetCol = Math.min(col, lines[lineIdx - 1].length);
        let newPos = 0;
        for (let i = 0; i < lineIdx - 1; i++) {
          newPos += lines[i].length + 1;
        }
        setCursor(newPos + targetCol);
      } else if (key.downArrow && lineIdx < lines.length - 1) {
        const targetCol = Math.min(col, lines[lineIdx + 1].length);
        let newPos = 0;
        for (let i = 0; i <= lineIdx; i++) {
          newPos += lines[i].length + 1;
        }
        setCursor(newPos + targetCol);
      }
      return;
    }

    // Regular text input
    if (input && !key.ctrl && !key.meta) {
      const before = value.slice(0, cursor);
      const after = value.slice(cursor);
      onChange(before + input + after);
      setCursor(cursor + input.length);
    }
  });

  // Render
  const lines = value.split('\n');
  const hasMultipleLines = lines.length > 1;

  if (!hasMultipleLines && value === '') {
    // Show placeholder for empty single line
    return (
      <Box>
        <Text>{'> '}</Text>
        <Text dimColor>{placeholder}</Text>
        <Text inverse>{' '}</Text>
      </Box>
    );
  }

  if (!hasMultipleLines) {
    // Single line display
    const before = value.slice(0, cursor);
    const at = value[cursor] || ' ';
    const after = value.slice(cursor + 1);
    
    return (
      <Box>
        <Text>{'> '}</Text>
        <Text>{before}</Text>
        <Text inverse>{at}</Text>
        <Text>{after}</Text>
      </Box>
    );
  }

  // Multiline display - FIXED cursor calculation
  let pos = 0;
  let cursorLine = 0;
  let cursorCol = 0;
  
  // If cursor is at the very end, put it at the end of the last line
  if (cursor === value.length && lines.length > 0) {
    cursorLine = lines.length - 1;
    cursorCol = lines[cursorLine].length;
  } else {
    // Find which line the cursor is on
    for (let i = 0; i < lines.length; i++) {
      const lineEndPos = pos + lines[i].length;
      if (cursor <= lineEndPos) {
        cursorLine = i;
        cursorCol = cursor - pos;
        break;
      }
      pos = lineEndPos + 1; // +1 for the newline character
    }
  }

  return (
    <Box flexDirection="column">
      {lines.map((line, idx) => {
        const isFirst = idx === 0;
        const hasCursor = idx === cursorLine;
        
        if (hasCursor) {
          const before = line.slice(0, cursorCol);
          const at = line[cursorCol] || ' ';
          const after = line.slice(cursorCol + 1);
          
          return (
            <Box key={idx}>
              <Text>{isFirst ? '> ' : '  '}</Text>
              <Text>{before}</Text>
              <Text inverse>{at}</Text>
              <Text>{after}</Text>
            </Box>
          );
        }
        
        return (
          <Box key={idx}>
            <Text>{isFirst ? '> ' : '  '}</Text>
            <Text>{line || ' '}</Text>
          </Box>
        );
      })}
    </Box>
  );
};

export default CleanTextInput;