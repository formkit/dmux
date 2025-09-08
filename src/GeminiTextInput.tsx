import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useFocus } from 'ink';
import chalk from 'chalk';

interface GeminiTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  multiline?: boolean;
  placeholder?: string;
}

const GeminiTextInput: React.FC<GeminiTextInputProps> = ({
  value,
  onChange,
  onSubmit,
  onCancel,
  multiline = false,
  placeholder = ''
}) => {
  const { isFocused } = useFocus({ autoFocus: true });
  const [lines, setLines] = useState<string[]>([]);
  const [cursorRow, setCursorRow] = useState(0);
  const [cursorCol, setCursorCol] = useState(0);

  // Split text into lines and update cursor position
  useEffect(() => {
    const newLines = value ? value.split('\n') : [''];
    setLines(newLines);
    
    // Calculate cursor position from value length
    let remaining = value.length;
    let row = 0;
    let col = 0;
    
    for (let i = 0; i < newLines.length; i++) {
      const lineLength = newLines[i].length;
      if (remaining <= lineLength) {
        row = i;
        col = remaining;
        break;
      }
      remaining -= lineLength + 1; // +1 for newline
    }
    
    setCursorRow(row);
    setCursorCol(col);
  }, [value]);

  // Convert row/col back to text
  const updateText = (newLines: string[], row: number, col: number) => {
    const text = newLines.join('\n');
    onChange(text);
    setCursorRow(row);
    setCursorCol(col);
  };

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
      const currentLine = lines[cursorRow] || '';
      const before = currentLine.slice(0, cursorCol);
      const after = currentLine.slice(cursorCol);
      
      const newLines = [...lines];
      newLines[cursorRow] = before;
      newLines.splice(cursorRow + 1, 0, after);
      
      updateText(newLines, cursorRow + 1, 0);
      return;
    }

    if (key.return && multiline && key.shift) {
      // Shift+Enter submits in multiline mode
      onSubmit?.();
      return;
    }

    // Handle backspace
    if (key.backspace) {
      const currentLine = lines[cursorRow] || '';
      
      if (cursorCol > 0) {
        // Delete character before cursor
        const before = currentLine.slice(0, cursorCol - 1);
        const after = currentLine.slice(cursorCol);
        const newLines = [...lines];
        newLines[cursorRow] = before + after;
        updateText(newLines, cursorRow, cursorCol - 1);
      } else if (cursorRow > 0) {
        // At beginning of line, merge with previous line
        const prevLine = lines[cursorRow - 1] || '';
        const newCol = prevLine.length;
        const newLines = [...lines];
        newLines[cursorRow - 1] = prevLine + currentLine;
        newLines.splice(cursorRow, 1);
        updateText(newLines, cursorRow - 1, newCol);
      }
      return;
    }

    // Handle delete
    if (key.delete) {
      const currentLine = lines[cursorRow] || '';
      
      if (cursorCol < currentLine.length) {
        // Delete character after cursor
        const before = currentLine.slice(0, cursorCol);
        const after = currentLine.slice(cursorCol + 1);
        const newLines = [...lines];
        newLines[cursorRow] = before + after;
        updateText(newLines, cursorRow, cursorCol);
      } else if (cursorRow < lines.length - 1) {
        // At end of line, merge with next line
        const nextLine = lines[cursorRow + 1] || '';
        const newLines = [...lines];
        newLines[cursorRow] = currentLine + nextLine;
        newLines.splice(cursorRow + 1, 1);
        updateText(newLines, cursorRow, cursorCol);
      }
      return;
    }

    // Handle arrow keys
    if (key.leftArrow) {
      if (cursorCol > 0) {
        setCursorCol(cursorCol - 1);
      } else if (cursorRow > 0) {
        const prevLine = lines[cursorRow - 1] || '';
        setCursorRow(cursorRow - 1);
        setCursorCol(prevLine.length);
      }
      return;
    }

    if (key.rightArrow) {
      const currentLine = lines[cursorRow] || '';
      if (cursorCol < currentLine.length) {
        setCursorCol(cursorCol + 1);
      } else if (cursorRow < lines.length - 1) {
        setCursorRow(cursorRow + 1);
        setCursorCol(0);
      }
      return;
    }

    if (key.upArrow && multiline) {
      if (cursorRow > 0) {
        const targetLine = lines[cursorRow - 1] || '';
        setCursorRow(cursorRow - 1);
        setCursorCol(Math.min(cursorCol, targetLine.length));
      }
      return;
    }

    if (key.downArrow && multiline) {
      if (cursorRow < lines.length - 1) {
        const targetLine = lines[cursorRow + 1] || '';
        setCursorRow(cursorRow + 1);
        setCursorCol(Math.min(cursorCol, targetLine.length));
      }
      return;
    }

    // Handle Home/End
    if (key.ctrl && input === 'a') {
      setCursorCol(0);
      return;
    }

    if (key.ctrl && input === 'e') {
      const currentLine = lines[cursorRow] || '';
      setCursorCol(currentLine.length);
      return;
    }

    // Handle regular text input
    if (input && !key.ctrl && !key.meta) {
      const currentLine = lines[cursorRow] || '';
      const before = currentLine.slice(0, cursorCol);
      const after = currentLine.slice(cursorCol);
      const newLines = [...lines];
      newLines[cursorRow] = before + input + after;
      updateText(newLines, cursorRow, cursorCol + 1);
    }
  });

  // Render the input with cursor
  const renderLine = (line: string, rowIndex: number) => {
    const isCursorLine = rowIndex === cursorRow;
    
    if (!isCursorLine) {
      // Line without cursor - add prefix for continuation lines
      return (
        <Box key={rowIndex}>
          <Text>{rowIndex > 0 ? '  ' : ''}</Text>
          <Text>{line || ' '}</Text>
        </Box>
      );
    }

    // Line with cursor
    const before = line.slice(0, cursorCol);
    const cursorChar = line[cursorCol] || ' ';
    const after = line.slice(cursorCol + 1);

    return (
      <Box key={rowIndex}>
        <Text>{rowIndex > 0 ? '  ' : ''}</Text>
        <Text>{before}</Text>
        <Text inverse>{cursorChar}</Text>
        <Text>{after}</Text>
      </Box>
    );
  };

  // Show placeholder when empty
  if (value === '' && placeholder) {
    return (
      <Box>
        <Text>{'> '}</Text>
        <Text dimColor>{placeholder}</Text>
        <Text inverse>{' '}</Text>
      </Box>
    );
  }

  // Render multiline
  if (multiline) {
    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text>{'> '}</Text>
          <Box flexDirection="column" flexGrow={1}>
            {lines.map((line, index) => renderLine(line, index))}
          </Box>
        </Box>
      </Box>
    );
  }

  // Render single line
  const line = lines[0] || '';
  const before = line.slice(0, cursorCol);
  const cursorChar = line[cursorCol] || ' ';
  const after = line.slice(cursorCol + 1);

  return (
    <Box>
      <Text>{'> '}</Text>
      <Text>{before}</Text>
      <Text inverse>{cursorChar}</Text>
      <Text>{after}</Text>
    </Box>
  );
};

export default GeminiTextInput;