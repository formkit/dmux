import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import fs from 'fs';

const DebugApp = () => {
  const [value, setValue] = useState('');
  const [cursor, setCursor] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const { exit } = useApp();

  const addLog = (msg: string) => {
    const timestamp = new Date().toISOString().slice(11, 23);
    const logMsg = `[${timestamp}] ${msg}`;
    fs.appendFileSync('/tmp/dmux-debug.log', logMsg + '\n');
    setLog(prev => [...prev.slice(-4), logMsg]);
  };

  // Keep cursor in bounds
  useEffect(() => {
    if (cursor > value.length) {
      setCursor(value.length);
    }
  }, [value.length, cursor]);

  useInput((input, key) => {
    // Quit
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    // Enter adds newline
    if (key.return && !key.shift) {
      const before = value.slice(0, cursor);
      const after = value.slice(cursor);
      const newValue = before + '\n' + after;
      setValue(newValue);
      setCursor(cursor + 1);
      addLog(`ENTER: cursor=${cursor} -> ${cursor + 1}, value="${value}" -> "${newValue}"`);
      return;
    }

    // Backspace deletes BEFORE cursor
    if (key.backspace) {
      if (cursor > 0) {
        const charToDelete = value[cursor - 1];
        const before = value.slice(0, cursor - 1);
        const after = value.slice(cursor);
        const newValue = before + after;
        setValue(newValue);
        setCursor(cursor - 1);
        addLog(`BACKSPACE: cursor=${cursor} -> ${cursor - 1}, deleted="${charToDelete}", value="${value}" -> "${newValue}"`);
      } else {
        addLog(`BACKSPACE: cursor=${cursor}, nothing to delete`);
      }
      return;
    }

    // Left arrow
    if (key.leftArrow) {
      const newCursor = Math.max(0, cursor - 1);
      setCursor(newCursor);
      addLog(`LEFT: cursor=${cursor} -> ${newCursor}, char at new pos="${value[newCursor]}"`);
      return;
    }

    // Right arrow
    if (key.rightArrow) {
      const newCursor = Math.min(value.length, cursor + 1);
      setCursor(newCursor);
      addLog(`RIGHT: cursor=${cursor} -> ${newCursor}, char at new pos="${value[newCursor]}"`);
      return;
    }

    // Regular text input
    if (input && !key.ctrl && !key.meta) {
      const before = value.slice(0, cursor);
      const after = value.slice(cursor);
      const newValue = before + input + after;
      setValue(newValue);
      setCursor(cursor + input.length);
      addLog(`TYPE "${input}": cursor=${cursor} -> ${cursor + input.length}, value="${value}" -> "${newValue}"`);
    }
  });

  // Visual representation
  const displayValue = value || '';
  const lines = displayValue.split('\n');
  
  // Find cursor position in lines
  let pos = 0;
  let cursorLine = 0;
  let cursorCol = 0;
  
  for (let i = 0; i < lines.length; i++) {
    if (pos + lines[i].length >= cursor) {
      cursorLine = i;
      cursorCol = cursor - pos;
      break;
    }
    pos += lines[i].length + 1; // +1 for newline
  }

  return (
    <Box flexDirection="column">
      <Box borderStyle="single" borderColor="green" paddingX={1}>
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
        <Text>Debug Info:</Text>
        <Text dimColor>Value: "{value}" (length={value.length})</Text>
        <Text dimColor>Cursor: {cursor} (line={cursorLine}, col={cursorCol})</Text>
        <Text dimColor>Char at cursor: "{value[cursor] || 'EOF'}"</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text>Recent logs:</Text>
        {log.map((l, i) => <Text key={i} dimColor>{l}</Text>)}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Test: Type "hello" ENTER "world" LEFT LEFT BACKSPACE BACKSPACE</Text>
      </Box>
    </Box>
  );
};

// Clear log file
fs.writeFileSync('/tmp/dmux-debug.log', `=== Debug session started at ${new Date().toISOString()} ===\n`);

render(<DebugApp />);