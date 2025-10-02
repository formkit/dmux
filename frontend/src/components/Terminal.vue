<template>
  <div class="terminal-page">
    <header>
      <a href="/" class="back-button">← dmux</a>
      <h1>{{ paneTitle }}</h1>
      <div class="session-info">
        <span>{{ dimensions.width }}×{{ dimensions.height }}</span>
        <span class="status-indicator" :style="{ color: connected ? '#4ade80' : '#f87171' }">●</span>
      </div>
    </header>

    <!-- Keyboard toolbar (always visible for easier terminal control) -->
    <div class="mobile-toolbar">
      <button @click="toggleCtrl" :class="{ active: ctrlActive }" class="toolbar-key">Ctrl</button>
      <button @click="toggleAlt" :class="{ active: altActive }" class="toolbar-key">Alt</button>
      <button @click="toggleShift" :class="{ active: shiftActive }" class="toolbar-key">Shift</button>
      <button @click="sendKey('Escape')" class="toolbar-key">Esc</button>
      <button @click="sendKey('Tab')" class="toolbar-key">Tab</button>
      <button @click="sendKey('Enter')" class="toolbar-key">Enter</button>
      <button @click="sendKey('ArrowUp')" class="toolbar-key">↑</button>
      <button @click="sendKey('ArrowDown')" class="toolbar-key">↓</button>
      <button @click="sendKey('ArrowLeft')" class="toolbar-key">←</button>
      <button @click="sendKey('ArrowRight')" class="toolbar-key">→</button>
    </div>

    <!-- Hidden input for mobile keyboard -->
    <input
      v-if="isMobile"
      ref="mobileInputRef"
      type="text"
      class="mobile-input"
      v-model="mobileInputValue"
      @input="handleMobileInput"
      @keydown="handleMobileKeydown"
      autocomplete="off"
      autocapitalize="off"
      autocorrect="off"
    />

    <div class="terminal-content" @click="focusMobileInput">
      <div class="terminal-output" :style="terminalContainerStyle">
        <div
          v-for="(row, rowIndex) in terminalBuffer"
          :key="rowIndex"
          class="terminal-row"
          :data-row="rowIndex"
          v-html="renderRow(row, rowIndex)"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';

// Get pane ID from URL
const paneId = window.location.pathname.split('/').pop() || '';

// State
const terminalBuffer = ref<any[][]>([]);
const dimensions = ref({ width: 80, height: 24 });
const connected = ref(false);
const cursorRow = ref(0);
const cursorCol = ref(0);
const paneTitle = ref('Loading...');
const isMobile = ref(false);
const ctrlActive = ref(false);
const altActive = ref(false);
const shiftActive = ref(false);
const mobileInputValue = ref('');
const mobileInputRef = ref<HTMLInputElement | null>(null);
const actualPaneId = ref('');

// ANSI parsing state
let currentAttrs: Record<string, any> = {};

// Color palette for 256-color mode
const colorPalette = [
  '#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0',
  '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff',
  '#000000', '#00005f', '#000087', '#0000af', '#0000d7', '#0000ff', '#005f00', '#005f5f',
  '#005f87', '#005faf', '#005fd7', '#005fff', '#008700', '#00875f', '#008787', '#0087af',
  '#0087d7', '#0087ff', '#00af00', '#00af5f', '#00af87', '#00afaf', '#00afd7', '#00afff',
  '#00d700', '#00d75f', '#00d787', '#00d7af', '#00d7d7', '#00d7ff', '#00ff00', '#00ff5f',
  '#00ff87', '#00ffaf', '#00ffd7', '#00ffff', '#5f0000', '#5f005f', '#5f0087', '#5f00af',
  '#5f00d7', '#5f00ff', '#5f5f00', '#5f5f5f', '#5f5f87', '#5f5faf', '#5f5fd7', '#5f5fff',
  '#5f8700', '#5f875f', '#5f8787', '#5f87af', '#5f87d7', '#5f87ff', '#5faf00', '#5faf5f',
  '#5faf87', '#5fafaf', '#5fafd7', '#5fafff', '#5fd700', '#5fd75f', '#5fd787', '#5fd7af',
  '#5fd7d7', '#5fd7ff', '#5fff00', '#5fff5f', '#5fff87', '#5fffaf', '#5fffd7', '#5fffff',
  '#870000', '#87005f', '#870087', '#8700af', '#8700d7', '#8700ff', '#875f00', '#875f5f',
  '#875f87', '#875faf', '#875fd7', '#875fff', '#878700', '#87875f', '#878787', '#8787af',
  '#8787d7', '#8787ff', '#87af00', '#87af5f', '#87af87', '#87afaf', '#87afd7', '#87afff',
  '#87d700', '#87d75f', '#87d787', '#87d7af', '#87d7d7', '#87d7ff', '#87ff00', '#87ff5f',
  '#87ff87', '#87ffaf', '#87ffd7', '#87ffff', '#af0000', '#af005f', '#af0087', '#af00af',
  '#af00d7', '#af00ff', '#af5f00', '#af5f5f', '#af5f87', '#af5faf', '#af5fd7', '#af5fff',
  '#af8700', '#af875f', '#af8787', '#af87af', '#af87d7', '#af87ff', '#afaf00', '#afaf5f',
  '#afaf87', '#afafaf', '#afafd7', '#afafff', '#afd700', '#afd75f', '#afd787', '#afd7af',
  '#afd7d7', '#afd7ff', '#afff00', '#afff5f', '#afff87', '#afffaf', '#afffd7', '#afffff',
  '#d70000', '#d7005f', '#d70087', '#d700af', '#d700d7', '#d700ff', '#d75f00', '#d75f5f',
  '#d75f87', '#d75faf', '#d75fd7', '#d75fff', '#d78700', '#d7875f', '#d78787', '#d787af',
  '#d787d7', '#d787ff', '#d7af00', '#d7af5f', '#d7af87', '#d7afaf', '#d7afd7', '#d7afff',
  '#d7d700', '#d7d75f', '#d7d787', '#d7d7af', '#d7d7d7', '#d7d7ff', '#d7ff00', '#d7ff5f',
  '#d7ff87', '#d7ffaf', '#d7ffd7', '#d7ffff', '#ff0000', '#ff005f', '#ff0087', '#ff00af',
  '#ff00d7', '#ff00ff', '#ff5f00', '#ff5f5f', '#ff5f87', '#ff5faf', '#ff5fd7', '#ff5fff',
  '#ff8700', '#ff875f', '#ff8787', '#ff87af', '#ff87d7', '#ff87ff', '#ffaf00', '#ffaf5f',
  '#ffaf87', '#ffafaf', '#ffafd7', '#ffafff', '#ffd700', '#ffd75f', '#ffd787', '#ffd7af',
  '#ffd7d7', '#ffd7ff', '#ffff00', '#ffff5f', '#ffff87', '#ffffaf', '#ffffd7', '#ffffff',
  '#080808', '#121212', '#1c1c1c', '#262626', '#303030', '#3a3a3a', '#444444', '#4e4e4e',
  '#585858', '#626262', '#6c6c6c', '#767676', '#808080', '#8a8a8a', '#949494', '#9e9e9e',
  '#a8a8a8', '#b2b2b2', '#bcbcbc', '#c6c6c6', '#d0d0d0', '#dadada', '#e4e4e4', '#eeeeee'
];

// Initialize terminal buffer
function initTerminal() {
  terminalBuffer.value = Array(dimensions.value.height).fill(null).map(() =>
    Array(dimensions.value.width).fill(null).map(() => ({
      char: ' ',
      fg: null,
      bg: null,
      bold: false,
      dim: false,
      italic: false,
      underline: false,
      strikethrough: false
    }))
  );
}

// Parse ANSI codes and update buffer
function parseAnsiAndUpdate(text: string, debugPatch = false, allowScrolling = true) {
  let i = 0;

  while (i < text.length) {
    const code = text.charCodeAt(i);

    // Check for escape sequence (ESC = 27)
    if (code === 27) {
      const seqEnd = findEscapeSequenceEnd(text, i);
      if (seqEnd > i) {
        const seq = text.substring(i, seqEnd);
        handleEscapeSequence(seq);
        i = seqEnd;
        continue;
      }
    }

    // Handle backspace
    if (code === 8) {
      if (cursorCol.value > 0) {
        cursorCol.value--;
      }
      i++;
      continue;
    }

    // Regular character
    handleCharacter(text[i], allowScrolling);
    i++;
  }
}

function findEscapeSequenceEnd(text: string, start: number): number {
  if (start + 1 >= text.length) return start + 1;

  const next = text[start + 1];

  // CSI sequence: ESC[
  if (next === '[') {
    for (let i = start + 2; i < text.length; i++) {
      const c = text[i];
      if ((c >= '@' && c <= '~')) {
        return i + 1;
      }
    }
  }

  // OSC sequence: ESC]
  if (next === ']') {
    for (let i = start + 2; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code === 7) { // BEL
        return i + 1;
      }
      if (code === 27 && i + 1 < text.length && text[i + 1] === '\\') { // ESC \
        return i + 2;
      }
    }
  }

  // Simple escape
  return start + 2;
}

function handleEscapeSequence(seq: string) {
  if (seq.length < 2) return;

  if (seq[1] === '[') {
    // CSI sequence
    const params = seq.substring(2, seq.length - 1);
    const command = seq[seq.length - 1];
    handleCSI(params, command);
  }
}

function handleCSI(params: string, command: string) {
  const args = params.split(';').map(p => parseInt(p) || 0);

  switch (command) {
    case 'H': // Cursor position
    case 'f':
      cursorRow.value = Math.min(Math.max((args[0] || 1) - 1, 0), dimensions.value.height - 1);
      cursorCol.value = Math.min(Math.max((args[1] || 1) - 1, 0), dimensions.value.width - 1);
      break;

    case 'A': // Cursor up
      cursorRow.value = Math.max(cursorRow.value - (args[0] || 1), 0);
      break;

    case 'B': // Cursor down
      cursorRow.value = Math.min(cursorRow.value + (args[0] || 1), dimensions.value.height - 1);
      break;

    case 'C': // Cursor forward
      cursorCol.value = Math.min(cursorCol.value + (args[0] || 1), dimensions.value.width - 1);
      break;

    case 'D': // Cursor back
      cursorCol.value = Math.max(cursorCol.value - (args[0] || 1), 0);
      break;

    case 'G': // Cursor Horizontal Absolute
      cursorCol.value = Math.min(Math.max((args[0] || 1) - 1, 0), dimensions.value.width - 1);
      break;

    case 'J': // Erase display
      handleEraseDisplay(args[0] || 0);
      break;

    case 'K': // Erase line
      handleEraseLine(args[0] || 0);
      break;

    case 'm': // SGR (colors and attributes)
      handleSGR(args);
      break;
  }
}

function handleSGR(args: number[]) {
  if (args.length === 0 || args[0] === 0) {
    currentAttrs = {};
    return;
  }

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === 0) {
      currentAttrs = {};
    } else if (arg === 1) {
      currentAttrs.bold = true;
    } else if (arg === 2) {
      currentAttrs.dim = true;
    } else if (arg === 3) {
      currentAttrs.italic = true;
    } else if (arg === 4) {
      currentAttrs.underline = true;
    } else if (arg === 9) {
      currentAttrs.strikethrough = true;
    } else if (arg === 22) {
      currentAttrs.bold = false;
      currentAttrs.dim = false;
    } else if (arg === 23) {
      currentAttrs.italic = false;
    } else if (arg === 24) {
      currentAttrs.underline = false;
    } else if (arg === 29) {
      currentAttrs.strikethrough = false;
    } else if (arg >= 30 && arg <= 37) {
      // Standard foreground colors
      currentAttrs.fg = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'][arg - 30];
    } else if (arg === 38) {
      // Extended foreground color
      if (i + 1 < args.length) {
        if (args[i + 1] === 5 && i + 2 < args.length) {
          // 256 color: 38;5;n
          currentAttrs.fg = 'c' + args[i + 2];
          i += 2;
        } else if (args[i + 1] === 2 && i + 4 < args.length) {
          // RGB color: 38;2;r;g;b
          currentAttrs.fg = `rgb(${args[i + 2]},${args[i + 3]},${args[i + 4]})`;
          i += 4;
        }
      }
    } else if (arg === 39) {
      currentAttrs.fg = null;
    } else if (arg >= 40 && arg <= 47) {
      // Standard background colors
      currentAttrs.bg = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'][arg - 40];
    } else if (arg === 48) {
      // Extended background color
      if (i + 1 < args.length) {
        if (args[i + 1] === 5 && i + 2 < args.length) {
          // 256 color: 48;5;n
          currentAttrs.bg = 'c' + args[i + 2];
          i += 2;
        } else if (args[i + 1] === 2 && i + 4 < args.length) {
          // RGB color: 48;2;r;g;b
          currentAttrs.bg = `rgb(${args[i + 2]},${args[i + 3]},${args[i + 4]})`;
          i += 4;
        }
      }
    } else if (arg === 49) {
      currentAttrs.bg = null;
    } else if (arg >= 90 && arg <= 97) {
      // Bright foreground colors
      currentAttrs.fg = 'bright-' + ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'][arg - 90];
    } else if (arg >= 100 && arg <= 107) {
      // Bright background colors
      currentAttrs.bg = 'bright-' + ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'][arg - 100];
    }

    i++;
  }
}

function handleCharacter(char: string, allowScrolling = true) {
  if (char === '\n') {
    cursorRow.value++;
    cursorCol.value = 0;
    if (cursorRow.value >= dimensions.value.height) {
      if (allowScrolling) {
        // Scroll up
        terminalBuffer.value.shift();
        terminalBuffer.value.push(Array(dimensions.value.width).fill(null).map(() => ({
          char: ' ',
          fg: null,
          bg: null,
          bold: false,
          dim: false,
          italic: false,
          underline: false,
          strikethrough: false
        })));
        cursorRow.value = dimensions.value.height - 1;
      } else {
        cursorRow.value = dimensions.value.height - 1;
      }
    }
    return;
  }

  if (char === '\r') {
    cursorCol.value = 0;
    return;
  }

  if (char === '\t') {
    cursorCol.value = Math.min(Math.floor((cursorCol.value + 8) / 8) * 8, dimensions.value.width - 1);
    return;
  }

  if (cursorCol.value >= dimensions.value.width) {
    cursorCol.value = 0;
    cursorRow.value++;
    if (cursorRow.value >= dimensions.value.height) {
      if (allowScrolling) {
        terminalBuffer.value.shift();
        terminalBuffer.value.push(Array(dimensions.value.width).fill(null).map(() => ({
          char: ' ',
          fg: null,
          bg: null,
          bold: false,
          dim: false,
          italic: false,
          underline: false,
          strikethrough: false
        })));
        cursorRow.value = dimensions.value.height - 1;
      } else {
        cursorRow.value = dimensions.value.height - 1;
      }
    }
  }

  if (cursorRow.value < dimensions.value.height && cursorCol.value < dimensions.value.width) {
    terminalBuffer.value[cursorRow.value][cursorCol.value] = {
      char: char,
      ...currentAttrs
    };
    cursorCol.value++;
  }
}

function handleEraseDisplay(mode: number) {
  if (mode === 2) {
    initTerminal();
  }
}

function handleEraseLine(mode: number) {
  if (mode === 0) {
    for (let col = cursorCol.value; col < dimensions.value.width; col++) {
      terminalBuffer.value[cursorRow.value][col] = { char: ' ', fg: null, bg: null, bold: false, dim: false, italic: false, underline: false, strikethrough: false };
    }
  } else if (mode === 2) {
    for (let col = 0; col < dimensions.value.width; col++) {
      terminalBuffer.value[cursorRow.value][col] = { char: ' ', fg: null, bg: null, bold: false, dim: false, italic: false, underline: false, strikethrough: false };
    }
  }
}

// HTML entity encoding
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Check if two cells have the same styling
function hasSameStyle(cell1: any, cell2: any): boolean {
  return cell1.fg === cell2.fg &&
         cell1.bg === cell2.bg &&
         cell1.bold === cell2.bold &&
         cell1.dim === cell2.dim &&
         cell1.italic === cell2.italic &&
         cell1.underline === cell2.underline &&
         cell1.strikethrough === cell2.strikethrough;
}

// Build style attributes for a cell
function buildStyleAttrs(cell: any): { classes: string[], styles: string[] } {
  const classes: string[] = [];
  const styles: string[] = [];

  // Handle foreground color
  if (cell.fg) {
    if (cell.fg.startsWith('rgb(')) {
      styles.push(`color: ${cell.fg}`);
    } else if (cell.fg.startsWith('c')) {
      const colorIndex = parseInt(cell.fg.substring(1));
      if (colorIndex >= 0 && colorIndex < colorPalette.length) {
        styles.push(`color: ${colorPalette[colorIndex]}`);
      }
    } else {
      classes.push('term-fg-' + cell.fg);
    }
  }

  // Handle background color
  if (cell.bg) {
    if (cell.bg.startsWith('rgb(')) {
      styles.push(`background-color: ${cell.bg}`);
    } else if (cell.bg.startsWith('c')) {
      const colorIndex = parseInt(cell.bg.substring(1));
      if (colorIndex >= 0 && colorIndex < colorPalette.length) {
        styles.push(`background-color: ${colorPalette[colorIndex]}`);
      }
    } else {
      classes.push('term-bg-' + cell.bg);
    }
  }

  // Add attribute classes
  if (cell.bold) classes.push('term-bold');
  if (cell.dim) classes.push('term-dim');
  if (cell.italic) classes.push('term-italic');
  if (cell.underline) classes.push('term-underline');
  if (cell.strikethrough) classes.push('term-strikethrough');

  return { classes, styles };
}

// Connect to stream
function connectToStream() {
  const streamPaneId = actualPaneId.value || paneId;
  const url = `/api/stream/${streamPaneId}`;

  fetch(url)
    .then(response => {
      if (!response.ok) throw new Error('Failed to connect');
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      connected.value = true;

      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
              const message = buffer.substring(0, newlineIndex);
              buffer = buffer.substring(newlineIndex + 1);

              if (message) {
                processMessage(message);
              }
            }
          }
        } catch (error) {
          connected.value = false;
        }
      };

      processStream();
    })
    .catch(error => {
      connected.value = false;
    });
}

function processMessage(message: string) {
  const colonIndex = message.indexOf(':');
  if (colonIndex === -1) return;

  const type = message.substring(0, colonIndex);
  const jsonStr = message.substring(colonIndex + 1);

  try {
    const data = JSON.parse(jsonStr);

    switch (type) {
      case 'INIT':
        dimensions.value = { width: data.width, height: data.height };
        initTerminal();

        // Reset cursor to top-left before parsing INIT content
        cursorRow.value = 0;
        cursorCol.value = 0;

        // Parse content - NO scrolling for INIT, just clamp cursor to buffer
        parseAnsiAndUpdate(data.content || '', false, false);

        // Set cursor to actual tmux cursor position if provided
        if (data.cursorRow !== undefined && data.cursorCol !== undefined) {
          cursorRow.value = data.cursorRow;
          cursorCol.value = data.cursorCol;
        }
        break;

      case 'PATCH':
        const targetCursorRow = data.cursorRow;
        const targetCursorCol = data.cursorCol;

        // Apply changes - NO SCROLLING during patches
        data.changes.forEach((change: any) => {
          parseAnsiAndUpdate(change.text, false, false);
        });

        // Set cursor to final position from tmux
        if (targetCursorRow !== undefined && targetCursorCol !== undefined) {
          cursorRow.value = targetCursorRow;
          cursorCol.value = targetCursorCol;
        }
        break;

      case 'RESIZE':
        dimensions.value = { width: data.width, height: data.height };
        initTerminal();
        parseAnsiAndUpdate(data.content || '');
        break;

      case 'HEARTBEAT':
        break;
    }
  } catch (error) {
    // Silently ignore parse errors
  }
}

// Computed
const terminalContainerStyle = computed(() => ({
  width: `${dimensions.value.width}ch`,
  maxWidth: '100vw',
  fontSize: `clamp(11px, calc(100vw / ${dimensions.value.width} / 0.6), 20px)`
}));

// Methods
function renderRow(row: any[], rowIndex: number): string {
  let html = '';
  let col = 0;

  while (col < row.length) {
    const cell = row[col];
    const isCursor = (rowIndex === cursorRow.value && col === cursorCol.value);
    const hasStyle = cell.fg || cell.bg || cell.bold || cell.dim || cell.italic || cell.underline || cell.strikethrough || isCursor;

    if (!hasStyle) {
      let text = '';
      while (col < row.length) {
        const c = row[col];
        const isCur = (rowIndex === cursorRow.value && col === cursorCol.value);
        if (c.fg || c.bg || c.bold || c.dim || c.italic || c.underline || c.strikethrough || isCur) break;
        text += c.char;
        col++;
      }
      html += escapeHtml(text);
    } else {
      const { classes, styles } = buildStyleAttrs(cell);
      if (isCursor) classes.push('term-cursor');

      let text = cell.char;
      col++;

      while (col < row.length) {
        const nextCell = row[col];
        const nextIsCursor = (rowIndex === cursorRow.value && col === cursorCol.value);
        if (nextIsCursor || !hasSameStyle(cell, nextCell)) break;
        text += nextCell.char;
        col++;
      }

      const classAttr = classes.length ? ' class="' + classes.join(' ') + '"' : '';
      const styleAttr = styles.length ? ' style="' + styles.join('; ') + '"' : '';
      html += '<span' + classAttr + styleAttr + '>' + escapeHtml(text) + '</span>';
    }
  }

  return html;
}

function toggleCtrl() {
  ctrlActive.value = !ctrlActive.value;
  if (ctrlActive.value && altActive.value) {
    altActive.value = false;
  }
}

function toggleAlt() {
  altActive.value = !altActive.value;
  if (altActive.value && ctrlActive.value) {
    ctrlActive.value = false;
  }
}

function toggleShift() {
  shiftActive.value = !shiftActive.value;
}

async function sendKey(key: string) {
  const keystrokeData = {
    key: key,
    ctrlKey: ctrlActive.value,
    altKey: altActive.value,
    shiftKey: shiftActive.value,
    metaKey: false
  };

  // Reset modifiers after sending
  ctrlActive.value = false;
  altActive.value = false;
  shiftActive.value = false;

  try {
    await fetch(`/api/keys/${actualPaneId.value}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(keystrokeData)
    });
  } catch (error) {
    // Silently ignore
  }
}

function focusMobileInput() {
  if (isMobile.value && mobileInputRef.value) {
    mobileInputRef.value.focus();
  }
}

function handleMobileInput(event: Event) {
  const target = event.target as HTMLInputElement;
  const newValue = target.value;
  const oldValue = mobileInputValue.value;

  if (newValue.length > oldValue.length) {
    // Characters were added
    const addedChars = newValue.substring(oldValue.length);

    // Send each character
    for (const char of addedChars) {
      sendKey(char);
    }
  } else if (newValue.length < oldValue.length) {
    // Characters were deleted - send backspace
    const deletedCount = oldValue.length - newValue.length;
    for (let i = 0; i < deletedCount; i++) {
      sendKey('Backspace');
    }
  }

  // Clear the input to allow continuous typing
  nextTick(() => {
    mobileInputValue.value = '';
  });
}

function handleMobileKeydown(event: KeyboardEvent) {
  // Handle special keys
  if (event.key === 'Enter') {
    event.preventDefault();
    sendKey('Enter');
  } else if (event.key === 'Backspace' && mobileInputValue.value === '') {
    event.preventDefault();
    sendKey('Backspace');
  }
}

// Keyboard input handling - send keystrokes to backend
function handleGlobalKeydown(event: KeyboardEvent) {
  // Don't capture keyboard if user is in browser UI (not focused on terminal)
  const activeElement = document.activeElement;
  if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
    return; // Let normal input handling work
  }

  // Ignore modifier keys by themselves - they should only affect other keys
  const modifierKeys = ['Shift', 'Control', 'Alt', 'Meta'];
  if (modifierKeys.includes(event.key)) {
    return;
  }

  // Prevent default for most keys to avoid browser shortcuts
  if (!event.metaKey && !event.ctrlKey || event.key === 'c' || event.key === 'd') {
    event.preventDefault();
  }

  // Build the keystroke data
  const keystrokeData = {
    key: event.key,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey
  };

  fetch(`/api/keys/${actualPaneId.value}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(keystrokeData)
  }).catch(error => {
    // Silently ignore keystroke errors
  });
}

// Lifecycle
onMounted(() => {
  // Detect mobile device
  isMobile.value = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth < 768;

  // Load pane info and start streaming
  fetch('/api/panes')
    .then(r => r.json())
    .then(data => {
      // Try to find pane by ID first, then by slug (for backwards compat)
      let pane = data.panes.find((p: any) => p.id === paneId);
      if (!pane) {
        pane = data.panes.find((p: any) => p.slug === paneId);
      }
      if (pane) {
        paneTitle.value = pane.slug;
        actualPaneId.value = pane.id;
      }
      connectToStream();
    })
    .catch(err => {
      connectToStream();
    });

  // Add global keyboard listener
  document.addEventListener('keydown', handleGlobalKeydown);
});
</script>

<style src="../styles.css"></style>
