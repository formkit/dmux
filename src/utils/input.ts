export const preprocessPastedContent = (input: string): string => {
  let cleaned = input.replace(/\x1b\[[0-9;]*m/g, '');
  cleaned = cleaned.replace(/\x1b\[[\d;]*[A-Za-z]/g, '');
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const looksLikeCode = cleaned.match(/[{}\[\]]/) || cleaned.split('\n').some(line => line.startsWith('  ') || line.startsWith('\t'));
  if (looksLikeCode) return cleaned;

  const boxChars = /[╭╮╰╯│─┌┐└┘├┤┬┴┼━┃┏┓┗┛┣┫┳┻╋]/g;
  cleaned = cleaned.replace(boxChars, '');

  let lines = cleaned.split('\n');
  lines = lines.map(line => {
    line = line.replace(/^[>$#]\s+/, '');
    return line.trim();
  });
  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const unwrappedLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];
    const nextLine = lines[i + 1];
    if (nextLine && currentLine.length > 0 && !currentLine.match(/[.!?;:,]$/) && nextLine[0] && nextLine[0] === nextLine[0].toLowerCase()) {
      unwrappedLines.push(currentLine + ' ' + nextLine);
      i++;
    } else {
      unwrappedLines.push(currentLine);
    }
  }
  return unwrappedLines.join('\n');
};

export const wrapText = (text: string, width: number): { line: string; isHardBreak: boolean }[] => {
  if (!text) return [{ line: '', isHardBreak: false }];
  const hardLines = text.split('\n');
  const wrappedLines: { line: string; isHardBreak: boolean }[] = [];
  for (let i = 0; i < hardLines.length; i++) {
    const hardLine = hardLines[i];
    const isLastHardLine = i === hardLines.length - 1;
    if (hardLine.length <= width) {
      wrappedLines.push({ line: hardLine, isHardBreak: !isLastHardLine });
    } else {
      let remaining = hardLine;
      while (remaining.length > 0) {
        if (remaining.length <= width) {
          wrappedLines.push({ line: remaining, isHardBreak: !isLastHardLine });
          break;
        }
        let breakPoint = width;
        let lastSpace = remaining.lastIndexOf(' ', width - 1);
        if (lastSpace > 0) breakPoint = lastSpace;
        else {
          const firstSpace = remaining.indexOf(' ');
          if (firstSpace > 0 && firstSpace < width) breakPoint = firstSpace;
          else breakPoint = Math.min(width, remaining.length);
        }
        const segment = remaining.slice(0, breakPoint);
        wrappedLines.push({ line: segment.trimEnd(), isHardBreak: false });
        const nextChar = remaining[breakPoint];
        if (nextChar === ' ') remaining = remaining.slice(breakPoint + 1);
        else remaining = remaining.slice(breakPoint);
      }
    }
  }
  return wrappedLines;
};

export const findCursorInWrappedLines = (
  wrappedLines: { line: string; isHardBreak: boolean }[],
  absoluteCursor: number
) => {
  if (wrappedLines.length === 0) return { line: 0, col: 0 };
  let currentPos = 0;
  for (let lineIndex = 0; lineIndex < wrappedLines.length; lineIndex++) {
    const wrappedLine = wrappedLines[lineIndex];
    const lineLength = wrappedLine.line.length;
    if (absoluteCursor <= currentPos + lineLength) {
      const colInLine = absoluteCursor - currentPos;
      return { line: lineIndex, col: Math.max(0, Math.min(colInLine, lineLength)) };
    }
    currentPos += lineLength;
    if (wrappedLine.isHardBreak) {
      currentPos++;
      if (absoluteCursor === currentPos - 1) return { line: lineIndex, col: lineLength };
    } else if (lineIndex < wrappedLines.length - 1) {
      currentPos++;
      if (absoluteCursor === currentPos - 1) return { line: lineIndex, col: lineLength };
    }
  }
  const lastLine = wrappedLines[wrappedLines.length - 1];
  return { line: wrappedLines.length - 1, col: lastLine ? lastLine.line.length : 0 };
};
