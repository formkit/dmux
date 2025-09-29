/**
 * Terminal state diffing and patch generation
 * Tracks virtual terminal state and generates minimal change sets
 */

import type { PatchMessage } from '../shared/StreamProtocol.js';

interface Cell {
  char: string;
  fg?: string;  // Foreground color
  bg?: string;  // Background color
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

interface CursorPosition {
  row: number;
  col: number;
}

/**
 * ANSI escape sequence parser state
 */
enum ParserState {
  Normal,
  Escape,      // Saw ESC
  CSI,         // Saw ESC[
  OSC,         // Saw ESC]
  DCS,         // Saw ESC P
}

/**
 * Virtual terminal buffer that tracks state
 */
export class TerminalBuffer {
  private width: number;
  private height: number;
  private buffer: Cell[][];
  private cursor: CursorPosition;
  private savedCursor?: CursorPosition;
  private scrollTop: number = 0;
  private scrollBottom: number;

  // Current text attributes
  private currentAttrs: Partial<Cell> = {};

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.buffer = this.createEmptyBuffer();
    this.cursor = { row: 0, col: 0 };
    this.scrollBottom = height - 1;
  }

  private createEmptyBuffer(): Cell[][] {
    const buffer: Cell[][] = [];
    for (let row = 0; row < this.height; row++) {
      buffer[row] = [];
      for (let col = 0; col < this.width; col++) {
        buffer[row][col] = { char: ' ' };
      }
    }
    return buffer;
  }

  /**
   * Apply raw terminal output to buffer
   */
  applyOutput(output: string): void {
    let state = ParserState.Normal;
    let escapeBuffer = '';

    for (let i = 0; i < output.length; i++) {
      const char = output[i];

      switch (state) {
        case ParserState.Normal:
          if (char === '\x1b') {
            state = ParserState.Escape;
          } else if (char === '\n') {
            this.newLine();
          } else if (char === '\r') {
            this.carriageReturn();
          } else if (char === '\b') {
            this.backspace();
          } else if (char === '\t') {
            this.tab();
          } else if (char >= ' ') {
            this.writeChar(char);
          }
          break;

        case ParserState.Escape:
          if (char === '[') {
            state = ParserState.CSI;
            escapeBuffer = '';
          } else if (char === ']') {
            state = ParserState.OSC;
            escapeBuffer = '';
          } else if (char === 'P') {
            state = ParserState.DCS;
            escapeBuffer = '';
          } else {
            // Single character escape sequence
            this.handleEscapeChar(char);
            state = ParserState.Normal;
          }
          break;

        case ParserState.CSI:
          if (char >= '@' && char <= '~') {
            // End of CSI sequence
            this.handleCSI(escapeBuffer, char);
            state = ParserState.Normal;
          } else {
            escapeBuffer += char;
          }
          break;

        case ParserState.OSC:
          if (char === '\x07' || (char === '\\' && escapeBuffer.endsWith('\x1b'))) {
            // End of OSC sequence
            this.handleOSC(escapeBuffer);
            state = ParserState.Normal;
          } else {
            escapeBuffer += char;
          }
          break;

        case ParserState.DCS:
          if (char === '\\' && escapeBuffer.endsWith('\x1b')) {
            // End of DCS sequence
            state = ParserState.Normal;
          } else {
            escapeBuffer += char;
          }
          break;
      }
    }
  }

  private writeChar(char: string): void {
    if (this.cursor.col >= this.width) {
      this.cursor.col = 0;
      this.newLine();
    }

    this.buffer[this.cursor.row][this.cursor.col] = {
      char,
      ...this.currentAttrs
    };

    this.cursor.col++;
  }

  private newLine(): void {
    this.cursor.row++;
    if (this.cursor.row >= this.height) {
      // Scroll up
      this.buffer.shift();
      this.buffer.push(this.createEmptyRow());
      this.cursor.row = this.height - 1;
    }
  }

  private carriageReturn(): void {
    this.cursor.col = 0;
  }

  private backspace(): void {
    if (this.cursor.col > 0) {
      this.cursor.col--;
    }
  }

  private tab(): void {
    // Move to next tab stop (every 8 columns)
    const nextTab = Math.floor((this.cursor.col + 8) / 8) * 8;
    this.cursor.col = Math.min(nextTab, this.width - 1);
  }

  private createEmptyRow(): Cell[] {
    const row: Cell[] = [];
    for (let col = 0; col < this.width; col++) {
      row[col] = { char: ' ' };
    }
    return row;
  }

  private handleEscapeChar(char: string): void {
    switch (char) {
      case '7': // Save cursor
        this.savedCursor = { ...this.cursor };
        break;
      case '8': // Restore cursor
        if (this.savedCursor) {
          this.cursor = { ...this.savedCursor };
        }
        break;
      case 'D': // Index (move down)
        this.newLine();
        break;
      case 'M': // Reverse index (move up)
        if (this.cursor.row > 0) {
          this.cursor.row--;
        }
        break;
    }
  }

  private handleCSI(params: string, command: string): void {
    const args = params.split(';').map(p => parseInt(p) || 0);

    switch (command) {
      case 'H': // Cursor position
      case 'f':
        this.cursor.row = Math.min(Math.max((args[0] || 1) - 1, 0), this.height - 1);
        this.cursor.col = Math.min(Math.max((args[1] || 1) - 1, 0), this.width - 1);
        break;

      case 'A': // Cursor up
        this.cursor.row = Math.max(this.cursor.row - (args[0] || 1), 0);
        break;

      case 'B': // Cursor down
        this.cursor.row = Math.min(this.cursor.row + (args[0] || 1), this.height - 1);
        break;

      case 'C': // Cursor forward
        this.cursor.col = Math.min(this.cursor.col + (args[0] || 1), this.width - 1);
        break;

      case 'D': // Cursor back
        this.cursor.col = Math.max(this.cursor.col - (args[0] || 1), 0);
        break;

      case 'J': // Erase display
        this.handleEraseDisplay(args[0] || 0);
        break;

      case 'K': // Erase line
        this.handleEraseLine(args[0] || 0);
        break;

      case 'm': // SGR (Select Graphic Rendition)
        this.handleSGR(args);
        break;
    }
  }

  private handleOSC(params: string): void {
    // OSC sequences are typically used for setting window title
    // We can ignore these for terminal display
  }

  private handleEraseDisplay(mode: number): void {
    switch (mode) {
      case 0: // Erase from cursor to end
        // Erase rest of current line
        for (let col = this.cursor.col; col < this.width; col++) {
          this.buffer[this.cursor.row][col] = { char: ' ' };
        }
        // Erase lines below
        for (let row = this.cursor.row + 1; row < this.height; row++) {
          for (let col = 0; col < this.width; col++) {
            this.buffer[row][col] = { char: ' ' };
          }
        }
        break;

      case 1: // Erase from beginning to cursor
        // Erase beginning of current line
        for (let col = 0; col <= this.cursor.col; col++) {
          this.buffer[this.cursor.row][col] = { char: ' ' };
        }
        // Erase lines above
        for (let row = 0; row < this.cursor.row; row++) {
          for (let col = 0; col < this.width; col++) {
            this.buffer[row][col] = { char: ' ' };
          }
        }
        break;

      case 2: // Erase entire display
      case 3: // Erase entire display including scrollback
        this.buffer = this.createEmptyBuffer();
        break;
    }
  }

  private handleEraseLine(mode: number): void {
    switch (mode) {
      case 0: // Erase from cursor to end of line
        for (let col = this.cursor.col; col < this.width; col++) {
          this.buffer[this.cursor.row][col] = { char: ' ' };
        }
        break;

      case 1: // Erase from beginning to cursor
        for (let col = 0; col <= this.cursor.col; col++) {
          this.buffer[this.cursor.row][col] = { char: ' ' };
        }
        break;

      case 2: // Erase entire line
        for (let col = 0; col < this.width; col++) {
          this.buffer[this.cursor.row][col] = { char: ' ' };
        }
        break;
    }
  }

  private handleSGR(args: number[]): void {
    if (args.length === 0 || args[0] === 0) {
      // Reset all attributes
      this.currentAttrs = {};
      return;
    }

    for (const arg of args) {
      switch (arg) {
        case 0: // Reset
          this.currentAttrs = {};
          break;
        case 1: // Bold
          this.currentAttrs.bold = true;
          break;
        case 2: // Dim
          this.currentAttrs.dim = true;
          break;
        case 3: // Italic
          this.currentAttrs.italic = true;
          break;
        case 4: // Underline
          this.currentAttrs.underline = true;
          break;
        case 21: // Bold off
          delete this.currentAttrs.bold;
          break;
        case 22: // Normal intensity
          delete this.currentAttrs.bold;
          delete this.currentAttrs.dim;
          break;
        case 23: // Italic off
          delete this.currentAttrs.italic;
          break;
        case 24: // Underline off
          delete this.currentAttrs.underline;
          break;
        // Foreground colors
        case 30: case 31: case 32: case 33:
        case 34: case 35: case 36: case 37:
          this.currentAttrs.fg = this.getColorName(arg - 30);
          break;
        case 39: // Default foreground
          delete this.currentAttrs.fg;
          break;
        // Background colors
        case 40: case 41: case 42: case 43:
        case 44: case 45: case 46: case 47:
          this.currentAttrs.bg = this.getColorName(arg - 40);
          break;
        case 49: // Default background
          delete this.currentAttrs.bg;
          break;
        // Bright foreground colors
        case 90: case 91: case 92: case 93:
        case 94: case 95: case 96: case 97:
          this.currentAttrs.fg = this.getColorName(arg - 90, true);
          break;
        // Bright background colors
        case 100: case 101: case 102: case 103:
        case 104: case 105: case 106: case 107:
          this.currentAttrs.bg = this.getColorName(arg - 100, true);
          break;
      }
    }
  }

  private getColorName(index: number, bright: boolean = false): string {
    const colors = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
    const color = colors[index] || 'black';
    return bright ? `bright-${color}` : color;
  }

  /**
   * Get current buffer as text
   */
  getText(): string {
    return this.buffer.map(row =>
      row.map(cell => cell.char).join('')
    ).join('\n');
  }

  /**
   * Get buffer for comparison
   */
  getBuffer(): Cell[][] {
    return this.buffer;
  }

  /**
   * Resize buffer
   */
  resize(width: number, height: number): void {
    const newBuffer: Cell[][] = [];
    for (let row = 0; row < height; row++) {
      newBuffer[row] = [];
      for (let col = 0; col < width; col++) {
        if (row < this.height && col < this.width && this.buffer[row] && this.buffer[row][col]) {
          newBuffer[row][col] = this.buffer[row][col];
        } else {
          newBuffer[row][col] = { char: ' ' };
        }
      }
    }

    this.width = width;
    this.height = height;
    this.buffer = newBuffer;
    this.scrollBottom = height - 1;

    // Adjust cursor if needed
    this.cursor.row = Math.min(this.cursor.row, height - 1);
    this.cursor.col = Math.min(this.cursor.col, width - 1);
  }
}

/**
 * Generates diffs between terminal states
 */
export class TerminalDiffer {
  private buffer: TerminalBuffer;
  private lastSentBuffer: Cell[][] | null = null;

  constructor(width: number, height: number) {
    this.buffer = new TerminalBuffer(width, height);
  }

  /**
   * Apply output and generate patches
   */
  applyAndDiff(output: string): PatchMessage['changes'] {
    // Apply output to virtual buffer
    this.buffer.applyOutput(output);

    // Get current buffer state
    const currentBuffer = this.buffer.getBuffer();

    // Generate patches if we have a previous state
    const changes: PatchMessage['changes'] = [];

    if (this.lastSentBuffer) {
      // Compare buffers and find differences
      for (let row = 0; row < currentBuffer.length; row++) {
        for (let col = 0; col < currentBuffer[row].length; col++) {
          const oldCell = this.lastSentBuffer[row]?.[col];
          const newCell = currentBuffer[row][col];

          if (!oldCell || !this.cellsEqual(oldCell, newCell)) {
            // Find consecutive changed cells in this row
            let length = 1;
            let text = newCell.char;

            while (col + length < currentBuffer[row].length) {
              const nextOld = this.lastSentBuffer[row]?.[col + length];
              const nextNew = currentBuffer[row][col + length];

              if (!nextOld || !this.cellsEqual(nextOld, nextNew)) {
                text += nextNew.char;
                length++;
              } else {
                break;
              }
            }

            changes.push({
              row,
              col,
              text,
              length
            });

            // Skip the cells we just processed
            col += length - 1;
          }
        }
      }
    } else {
      // First update - send everything as one big change
      const text = currentBuffer.map(row =>
        row.map(cell => cell.char).join('')
      ).join('\n');

      if (text.trim()) {
        changes.push({
          row: 0,
          col: 0,
          text
        });
      }
    }

    // Save current buffer for next diff
    this.lastSentBuffer = currentBuffer.map(row => [...row]);

    return changes;
  }

  private cellsEqual(a: Cell, b: Cell): boolean {
    return a.char === b.char &&
           a.fg === b.fg &&
           a.bg === b.bg &&
           a.bold === b.bold &&
           a.dim === b.dim &&
           a.italic === b.italic &&
           a.underline === b.underline;
  }

  /**
   * Get full buffer state
   */
  getFullState(): string {
    return this.buffer.getText();
  }

  /**
   * Reset differ state
   */
  reset(): void {
    this.lastSentBuffer = null;
  }

  /**
   * Handle terminal resize
   */
  resize(width: number, height: number): void {
    this.buffer.resize(width, height);
    this.lastSentBuffer = null; // Force full update after resize
  }
}