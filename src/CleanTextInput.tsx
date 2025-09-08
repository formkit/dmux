import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useFocus, useStdout } from 'ink';

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
  const { stdout } = useStdout();
  
  // Calculate available width for text (terminal width - borders - padding - prompt)
  // Subtract 2 for borders, 2 for padding, 2 for "> " prompt = 6 total
  // The prompt is always rendered separately, so we need to account for it
  // Use process.stdout.columns as fallback since useStdout might not update
  const terminalWidth = process.stdout.columns || (stdout ? stdout.columns : 80);
  // Reduce by 1 more to prevent edge case where text exactly fills width
  const maxWidth = Math.max(20, terminalWidth - 7);

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

    // Ctrl-A: Jump to beginning of current visual line
    if (key.ctrl && input === 'a') {
      const wrapped = wrapText(value, maxWidth);
      const currentPos = findCursorInWrappedLines(wrapped, cursor);
      
      // Find absolute position of start of current visual line
      let absolutePos = 0;
      for (let i = 0; i < currentPos.line; i++) {
        absolutePos += wrapped[i].line.length;
        if (!wrapped[i].isHardBreak && i < wrapped.length - 1) {
          absolutePos++; // Space between wrapped segments
        } else if (wrapped[i].isHardBreak) {
          absolutePos++; // Newline character
        }
      }
      setCursor(absolutePos);
      return;
    }

    // Ctrl-E: Jump to end of current visual line
    if (key.ctrl && input === 'e') {
      const wrapped = wrapText(value, maxWidth);
      const currentPos = findCursorInWrappedLines(wrapped, cursor);
      
      // Find absolute position of end of current visual line
      let absolutePos = 0;
      for (let i = 0; i <= currentPos.line; i++) {
        if (i === currentPos.line) {
          absolutePos += wrapped[i].line.length;
        } else {
          absolutePos += wrapped[i].line.length;
          if (!wrapped[i].isHardBreak && i < wrapped.length - 1) {
            absolutePos++; // Space between wrapped segments
          } else if (wrapped[i].isHardBreak) {
            absolutePos++; // Newline character
          }
        }
      }
      setCursor(Math.min(absolutePos, value.length));
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

    // Up/Down arrows for navigation (works with both hard and soft wrapped lines)
    if (key.upArrow || key.downArrow) {
      // Get wrapped lines to understand visual layout
      const wrapped = wrapText(value, maxWidth);
      const currentPos = findCursorInWrappedLines(wrapped, cursor);
      
      if (key.upArrow && currentPos.line > 0) {
        // Move up one visual line
        const targetLine = currentPos.line - 1;
        const targetCol = Math.min(currentPos.col, wrapped[targetLine].line.length);
        
        // Convert back to absolute position
        let absolutePos = 0;
        for (let i = 0; i < targetLine; i++) {
          absolutePos += wrapped[i].line.length;
          // Add space if this was a soft wrap
          if (!wrapped[i].isHardBreak && i < wrapped.length - 1) {
            const nextLineExists = i + 1 < wrapped.length;
            if (nextLineExists) absolutePos++; // Space between wrapped segments
          } else if (wrapped[i].isHardBreak) {
            absolutePos++; // Newline character
          }
        }
        absolutePos += targetCol;
        setCursor(Math.min(absolutePos, value.length));
      } else if (key.downArrow && currentPos.line < wrapped.length - 1) {
        // Move down one visual line
        const targetLine = currentPos.line + 1;
        const targetCol = Math.min(currentPos.col, wrapped[targetLine].line.length);
        
        // Convert back to absolute position
        let absolutePos = 0;
        for (let i = 0; i < targetLine; i++) {
          absolutePos += wrapped[i].line.length;
          // Add space if this was a soft wrap
          if (!wrapped[i].isHardBreak && i < wrapped.length - 1) {
            const nextLineExists = i + 1 < wrapped.length;
            if (nextLineExists) absolutePos++; // Space between wrapped segments
          } else if (wrapped[i].isHardBreak) {
            absolutePos++; // Newline character
          }
        }
        absolutePos += targetCol;
        setCursor(Math.min(absolutePos, value.length));
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

  // Function to wrap text at word boundaries
  const wrapText = (text: string, width: number): { line: string; isHardBreak: boolean }[] => {
    if (!text) return [{ line: '', isHardBreak: false }];
    
    const hardLines = text.split('\n');
    const wrappedLines: { line: string; isHardBreak: boolean }[] = [];
    
    for (let i = 0; i < hardLines.length; i++) {
      const hardLine = hardLines[i];
      const isLastHardLine = i === hardLines.length - 1;
      
      if (hardLine.length <= width) {
        // Line fits within width
        wrappedLines.push({ line: hardLine, isHardBreak: !isLastHardLine });
      } else {
        // Need to wrap this line at word boundaries
        let remaining = hardLine;
        
        while (remaining.length > 0) {
          if (remaining.length <= width) {
            // Last segment of this hard line
            wrappedLines.push({ 
              line: remaining, 
              isHardBreak: !isLastHardLine 
            });
            break;
          }
          
          // Find last space within width limit
          let breakPoint = width;
          
          // Look for the last space that fits within the width - 1 to wrap before overflow
          let lastSpace = remaining.lastIndexOf(' ', width - 1);
          
          if (lastSpace > 0) {
            // Found a space to break at
            breakPoint = lastSpace;
          } else {
            // No good space found, break at width or look for first space
            const firstSpace = remaining.indexOf(' ');
            if (firstSpace > 0 && firstSpace < width) {
              breakPoint = firstSpace;
            } else {
              // No spaces or space is beyond width, break at width
              breakPoint = Math.min(width, remaining.length);
            }
          }
          
          const segment = remaining.slice(0, breakPoint);
          wrappedLines.push({ 
            line: segment.trimEnd(), 
            isHardBreak: false // soft wrap
          });
          
          // Skip the space if we broke at a space
          const nextChar = remaining[breakPoint];
          if (nextChar === ' ') {
            remaining = remaining.slice(breakPoint + 1);
          } else {
            remaining = remaining.slice(breakPoint);
          }
        }
      }
    }
    
    return wrappedLines;
  };
  
  // Function to find cursor position in wrapped lines
  const findCursorInWrappedLines = (wrappedLines: { line: string; isHardBreak: boolean }[], absoluteCursor: number) => {
    let pos = 0;
    
    // Walk through the original text and wrapped lines simultaneously
    const originalLines = value.split('\n');
    let originalPos = 0;
    let wrappedIndex = 0;
    
    for (let i = 0; i < originalLines.length; i++) {
      const originalLine = originalLines[i];
      
      // Count wrapped segments for this original line
      let linePos = 0;
      while (wrappedIndex < wrappedLines.length && linePos < originalLine.length) {
        const wrappedLine = wrappedLines[wrappedIndex];
        const segmentLength = wrappedLine.line.length;
        
        // Check if cursor is in this wrapped segment
        const segmentEnd = originalPos + segmentLength;
        if (absoluteCursor <= segmentEnd) {
          const colInSegment = absoluteCursor - originalPos;
          return {
            line: wrappedIndex,
            col: colInSegment
          };
        }
        
        originalPos = segmentEnd;
        linePos += segmentLength;
        
        // Account for space that was removed during wrapping
        if (!wrappedLine.isHardBreak && wrappedIndex < wrappedLines.length - 1) {
          // This was a soft wrap, account for the space that was trimmed
          if (linePos < originalLine.length && originalLine[linePos] === ' ') {
            originalPos++; // Skip the space in position counting
            linePos++;
          }
        }
        
        wrappedIndex++;
        if (wrappedLine.isHardBreak) break;
      }
      
      // Account for the newline character
      if (i < originalLines.length - 1) {
        originalPos++; // newline character
      }
    }
    
    // Cursor at very end
    const lastLine = wrappedLines[wrappedLines.length - 1];
    return {
      line: wrappedLines.length - 1,
      col: lastLine ? lastLine.line.length : 0
    };
  };

  // Render
  const wrappedLines = wrapText(value, maxWidth);
  const hasMultipleLines = wrappedLines.length > 1;

  if (value === '') {
    // Show placeholder for empty input
    return (
      <Box>
        <Box width={2}>
          <Text>{'> '}</Text>
        </Box>
        <Box>
          <Text dimColor>{placeholder}</Text>
          <Text inverse>{' '}</Text>
        </Box>
      </Box>
    );
  }

  // Find cursor position in wrapped lines
  const cursorPos = findCursorInWrappedLines(wrappedLines, cursor);

  // Render wrapped lines
  return (
    <Box flexDirection="column">
      {wrappedLines.map((wrappedLine, idx) => {
        const isFirst = idx === 0;
        const hasCursor = idx === cursorPos.line;
        const line = wrappedLine.line;
        
        if (hasCursor) {
          const before = line.slice(0, cursorPos.col);
          const at = line[cursorPos.col] || ' ';
          const after = line.slice(cursorPos.col + 1);
          
          return (
            <Box key={idx}>
              <Box width={2}>
                <Text>{isFirst ? '> ' : '  '}</Text>
              </Box>
              <Box>
                <Text>{before}</Text>
                <Text inverse>{at}</Text>
                <Text>{after}</Text>
              </Box>
            </Box>
          );
        }
        
        return (
          <Box key={idx}>
            <Box width={2}>
              <Text>{isFirst ? '> ' : '  '}</Text>
            </Box>
            <Text>{line || ' '}</Text>
          </Box>
        );
      })}
    </Box>
  );
};

export default CleanTextInput;