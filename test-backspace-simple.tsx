import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';

const SimpleBackspaceTest = () => {
  const [value, setValue] = useState('');
  const [cursor, setCursor] = useState(0);
  const [log, setLog] = useState<string[]>([]);
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

    // Test: Type some text then press backspace
    if (key.backspace) {
      setLog(prev => [...prev, `BACKSPACE pressed: cursor=${cursor}, value="${value}", length=${value.length}`]);
      
      if (cursor > 0) {
        const before = value.slice(0, cursor - 1);
        const after = value.slice(cursor);
        const newValue = before + after;
        setValue(newValue);
        setCursor(cursor - 1);
        setLog(prev => [...prev, `After backspace: value="${newValue}", cursor=${cursor - 1}`]);
      } else {
        setLog(prev => [...prev, `Nothing to delete (cursor at 0)`]);
      }
      return;
    }

    // Right arrow to end
    if (key.rightArrow) {
      const newCursor = Math.min(value.length, cursor + 1);
      setCursor(newCursor);
      setLog(prev => [...prev, `RIGHT: cursor=${cursor} -> ${newCursor}`]);
      return;
    }

    // Type text
    if (input && !key.ctrl && !key.meta) {
      const before = value.slice(0, cursor);
      const after = value.slice(cursor);
      const newValue = before + input + after;
      setValue(newValue);
      setCursor(cursor + input.length);
      setLog(prev => [...prev, `TYPE "${input}": value="${newValue}", cursor=${cursor + input.length}`]);
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold>Simple Backspace Test</Text>
      <Box borderStyle="single" marginTop={1}>
        <Text>Value: "{value}" (length={value.length}, cursor={cursor})</Text>
      </Box>
      
      <Box marginTop={1} flexDirection="column">
        <Text>Instructions:</Text>
        <Text dimColor>1. Type "test"</Text>
        <Text dimColor>2. Press Right arrow multiple times to ensure cursor is at end</Text>
        <Text dimColor>3. Press Backspace - should delete 't' making it "tes"</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text>Log:</Text>
        {log.slice(-5).map((l, i) => <Text key={i} dimColor>{l}</Text>)}
      </Box>
    </Box>
  );
};

render(<SimpleBackspaceTest />);