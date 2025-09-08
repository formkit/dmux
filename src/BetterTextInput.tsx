import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useFocus } from 'ink';
import TextInput from 'ink-text-input';

interface BetterTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
}

const BetterTextInput: React.FC<BetterTextInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = 'Type your message...'
}) => {
  const { isFocused } = useFocus({ autoFocus: true });
  const [isMultiline, setIsMultiline] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(value.length);

  // Update multiline state based on content
  useEffect(() => {
    setIsMultiline(value.includes('\n'));
    if (cursorPosition > value.length) {
      setCursorPosition(value.length);
    }
  }, [value, cursorPosition]);

  useInput((input, key) => {
    if (!isFocused) return;
    
    // Handle Enter in single-line mode to switch to multiline
    if (!isMultiline && key.return && !key.shift) {
      const before = value.slice(0, cursorPosition);
      const after = value.slice(cursorPosition);
      onChange(before + '\n' + after);
      setCursorPosition(cursorPosition + 1);
      return;
    }
    
    // Rest of handlers only for multiline mode
    if (!isMultiline) return;

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

    // Handle backspace - delete character BEFORE cursor
    if (key.backspace) {
      if (cursorPosition > 0) {
        const before = value.slice(0, cursorPosition - 1);
        const after = value.slice(cursorPosition);
        const newValue = before + after;
        onChange(newValue);
        setCursorPosition(cursorPosition - 1);
        
        // Debug logging
        if (process.env.DEBUG_DMUX) {
          console.error('Backspace debug:', {
            oldValue: value,
            newValue,
            cursorPos: cursorPosition,
            newCursorPos: cursorPosition - 1,
            deletedChar: value[cursorPosition - 1]
          });
        }
      }
      return;
    }

    // Handle delete - delete character AT cursor
    if (key.delete) {
      if (cursorPosition < value.length) {
        const before = value.slice(0, cursorPosition);
        const after = value.slice(cursorPosition + 1);
        onChange(before + after);
        // cursor stays same
      }
      return;
    }

    // Handle arrows
    if (key.leftArrow) {
      setCursorPosition(Math.max(0, cursorPosition - 1));
      return;
    }

    if (key.rightArrow) {
      setCursorPosition(Math.min(value.length, cursorPosition + 1));
      return;
    }

    if (key.upArrow || key.downArrow) {
      const lines = value.split('\n');
      let pos = 0;
      let lineIdx = 0;
      let col = 0;
      
      // Find current line and column
      for (let i = 0; i < lines.length; i++) {
        if (pos + lines[i].length >= cursorPosition) {
          lineIdx = i;
          col = cursorPosition - pos;
          break;
        }
        pos += lines[i].length + 1;
      }
      
      if (key.upArrow && lineIdx > 0) {
        // Move to previous line
        const targetLine = lineIdx - 1;
        const targetCol = Math.min(col, lines[targetLine].length);
        let newPos = 0;
        for (let i = 0; i < targetLine; i++) {
          newPos += lines[i].length + 1;
        }
        newPos += targetCol;
        setCursorPosition(newPos);
      } else if (key.downArrow && lineIdx < lines.length - 1) {
        // Move to next line
        const targetLine = lineIdx + 1;
        const targetCol = Math.min(col, lines[targetLine].length);
        let newPos = 0;
        for (let i = 0; i < targetLine; i++) {
          newPos += lines[i].length + 1;
        }
        newPos += targetCol;
        setCursorPosition(newPos);
      }
      return;
    }

    // Handle text input
    if (input && !key.ctrl && !key.meta) {
      const before = value.slice(0, cursorPosition);
      const after = value.slice(cursorPosition);
      onChange(before + input + after);
      setCursorPosition(cursorPosition + input.length);
    }
  });

  // For single line, use standard TextInput but handle Enter ourselves
  if (!isMultiline) {
    return (
      <Box>
        <Text>{'> '}</Text>
        <TextInput
          value={value}
          onChange={(newValue) => {
            onChange(newValue);
            setCursorPosition(newValue.length);
          }}
          onSubmit={onSubmit}
          placeholder={placeholder}
          showCursor={true}
        />
      </Box>
    );
  }

  // For multiline, render custom display
  const lines = value.split('\n');
  let pos = 0;
  let cursorLine = 0;
  let cursorCol = 0;
  
  // Find cursor position in lines
  for (let i = 0; i < lines.length; i++) {
    const lineLength = lines[i].length;
    if (pos + lineLength >= cursorPosition) {
      cursorLine = i;
      cursorCol = cursorPosition - pos;
      break;
    }
    pos += lineLength + 1; // +1 for newline
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

export default BetterTextInput;