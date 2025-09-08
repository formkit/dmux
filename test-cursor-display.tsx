import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';

const TestCursorDisplay = () => {
  const [value, setValue] = useState('');
  const [cursor, setCursor] = useState(0);
  const { exit } = useApp();

  // Keep cursor in bounds
  useEffect(() => {
    if (cursor > value.length) {
      setCursor(value.length);
    }
  }, [value.length, cursor]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    // Enter adds newline
    if (key.return) {
      const before = value.slice(0, cursor);
      const after = value.slice(cursor);
      setValue(before + '\n' + after);
      setCursor(cursor + 1);
      return;
    }

    // Backspace deletes BEFORE cursor
    if (key.backspace) {
      if (cursor > 0) {
        const before = value.slice(0, cursor - 1);
        const after = value.slice(cursor);
        setValue(before + after);
        setCursor(cursor - 1);
      }
      return;
    }

    // Delete deletes AT cursor
    if (key.delete) {
      if (cursor < value.length) {
        const before = value.slice(0, cursor);
        const after = value.slice(cursor + 1);
        setValue(before + after);
      }
      return;
    }

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

    // Regular text input
    if (input && !key.ctrl && !key.meta) {
      const before = value.slice(0, cursor);
      const after = value.slice(cursor);
      setValue(before + input + after);
      setCursor(cursor + input.length);
    }
  });

  // Calculate cursor position in lines
  const lines = value.split('\n');
  let pos = 0;
  let cursorLine = 0;
  let cursorCol = 0;
  
  for (let i = 0; i < lines.length; i++) {
    if (pos + lines[i].length >= cursor) {
      cursorLine = i;
      cursorCol = cursor - pos;
      break;
    }
    pos += lines[i].length + 1;
  }

  // Debug info
  const charBeforeCursor = value[cursor - 1] || 'START';
  const charAtCursor = value[cursor] || 'EOF';
  const charAfterCursor = value[cursor + 1] || 'EOF';

  return (
    <Box flexDirection="column">
      <Text bold>Visual Display:</Text>
      <Box borderStyle="single" paddingX={1}>
        <Box flexDirection="column">
          {lines.map((line, idx) => {
            const hasCursor = idx === cursorLine;
            
            if (hasCursor) {
              const before = line.slice(0, cursorCol);
              const at = line[cursorCol] || ' ';
              const after = line.slice(cursorCol + 1);
              
              return (
                <Box key={idx}>
                  <Text>{before}</Text>
                  <Text inverse>{at}</Text>
                  <Text>{after}</Text>
                </Box>
              );
            }
            
            return <Text key={idx}>{line || ' '}</Text>;
          })}
        </Box>
      </Box>
      
      <Box marginTop={1} flexDirection="column">
        <Text bold>Debug Info:</Text>
        <Text>Value: "{value.replace(/\n/g, '\\n')}" (length={value.length})</Text>
        <Text>Cursor: {cursor}</Text>
        <Text>Cursor Line: {cursorLine}, Col: {cursorCol}</Text>
        <Text>Char before cursor: "{charBeforeCursor}"</Text>
        <Text color="yellow">Char AT cursor: "{charAtCursor}"</Text>
        <Text>Char after cursor: "{charAfterCursor}"</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Type "hello" ENTER "world", then LEFT LEFT - cursor should be between 'r' and 'l'</Text>
      </Box>
    </Box>
  );
};

render(<TestCursorDisplay />);