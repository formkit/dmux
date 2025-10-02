// Terminal viewer with Vue.js and ANSI parsing
import { createApp } from '/vue.esm-browser.js';

const paneId = window.location.pathname.split('/').pop();

// Helper to access Vue reactive data
let vueApp = null;

// ANSI parsing state
let currentAttrs = {};

// Convenience accessors for Vue data - these will be bound after Vue mounts
const getTerminalBuffer = () => window.terminalBuffer || [];
const setTerminalBuffer = (val) => { window.terminalBuffer = val; };
const getTerminalDimensions = () => window.terminalDimensions || { width: 80, height: 24 };
const setTerminalDimensions = (val) => { window.terminalDimensions = val; };
const getCursorRow = () => window.cursorRow || 0;
const setCursorRow = (val) => { window.cursorRow = val; };
const getCursorCol = () => window.cursorCol || 0;
const setCursorCol = (val) => { window.cursorCol = val; };

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
  window.terminalBuffer = Array(window.terminalDimensions.height).fill(null).map(() =>
    Array(window.terminalDimensions.width).fill(null).map(() => ({
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

// Parse ANSI codes and update buffer with target cursor constraint
// Used for patches where we know the final cursor position and don't want to go past it
function parseAnsiAndUpdateWithTarget(text, targetRow, targetCol) {
  let i = 0;

  while (i < text.length) {
    const code = text.charCodeAt(i);

    // Check for escape sequence (ESC = 27)
    if (code === 27) {
      const seqEnd = findEscapeSequenceEnd(text, i);
      if (seqEnd > i) {
        handleEscapeSequence(text.substring(i, seqEnd));
        i = seqEnd;
        continue;
      }
    }

    // Handle backspace
    if (code === 8) {
      if (window.cursorCol > 0) {
        window.cursorCol--;
      }
      i++;
      continue;
    }

    // Handle character - don't allow scrolling, clamp to target cursor
    handleCharacterWithTarget(text[i], targetRow);
    i++;
  }
}

// Parse ANSI codes and update buffer
// allowScrolling: if false, prevents buffer scrolling (for patches)
function parseAnsiAndUpdate(text, debugPatch = false, allowScrolling = true) {
  let i = 0;

  while (i < text.length) {
    const code = text.charCodeAt(i);

    // Check for escape sequence (ESC = 27)
    if (code === 27) {
      // Escape sequence
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
      if (window.cursorCol > 0) {
        window.cursorCol--;
      }
      i++;
      continue;
    }

    // Regular character
    handleCharacter(text[i], allowScrolling);
    i++;
  }
}

function findEscapeSequenceEnd(text, start) {
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
      if (code === 27 && i + 1 < text.length && text[i + 1] === '\\\\') { // ESC \\
        return i + 2;
      }
    }
  }

  // Simple escape
  return start + 2;
}

function handleEscapeSequence(seq) {
  if (seq.length < 2) return;

  if (seq[1] === '[') {
    // CSI sequence
    const params = seq.substring(2, seq.length - 1);
    const command = seq[seq.length - 1];
    handleCSI(params, command);
  }
}

function handleCSI(params, command) {
  const args = params.split(';').map(p => parseInt(p) || 0);
  const oldRow = window.cursorRow;
  const oldCol = window.cursorCol;

  switch (command) {
    case 'H': // Cursor position
    case 'f':
      window.cursorRow = Math.min(Math.max((args[0] || 1) - 1, 0), window.terminalDimensions.height - 1);
      window.cursorCol = Math.min(Math.max((args[1] || 1) - 1, 0), window.terminalDimensions.width - 1);
      break;

    case 'A': // Cursor up
      window.cursorRow = Math.max(window.cursorRow - (args[0] || 1), 0);
      break;

    case 'B': // Cursor down
      window.cursorRow = Math.min(window.cursorRow + (args[0] || 1), window.terminalDimensions.height - 1);
      break;

    case 'C': // Cursor forward
      window.cursorCol = Math.min(window.cursorCol + (args[0] || 1), window.terminalDimensions.width - 1);
      break;

    case 'D': // Cursor back
      window.cursorCol = Math.max(window.cursorCol - (args[0] || 1), 0);
      break;

    case 'G': // Cursor Horizontal Absolute
      window.cursorCol = Math.min(Math.max((args[0] || 1) - 1, 0), window.terminalDimensions.width - 1);
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

function handleSGR(args) {
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
          currentAttrs.fg = \`rgb(\${args[i + 2]},\${args[i + 3]},\${args[i + 4]})\`;
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
          currentAttrs.bg = \`rgb(\${args[i + 2]},\${args[i + 3]},\${args[i + 4]})\`;
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

// Handle character with target row constraint - don't go past target
function handleCharacterWithTarget(char, targetRow) {
  if (char === '\\n') {
    window.cursorRow++;
    window.cursorCol = 0;
    // Clamp to target row - never go past where tmux says we should end up
    if (window.cursorRow > targetRow) {
      window.cursorRow = targetRow;
    }
    return;
  }

  if (char === '\\r') {
    window.cursorCol = 0;
    return;
  }

  if (char === '\\t') {
    window.cursorCol = Math.min(Math.floor((window.cursorCol + 8) / 8) * 8, window.terminalDimensions.width - 1);
    return;
  }

  if (window.cursorCol >= window.terminalDimensions.width) {
    window.cursorCol = 0;
    window.cursorRow++;
    // Clamp to target row
    if (window.cursorRow > targetRow) {
      window.cursorRow = targetRow;
    }
  }

  if (window.cursorRow < window.terminalDimensions.height && window.cursorCol < window.terminalDimensions.width) {
    window.terminalBuffer[window.cursorRow][window.cursorCol] = {
      char: char,
      ...currentAttrs
    };
    window.cursorCol++;
  }
}

function handleCharacter(char, allowScrolling = true) {
  if (char === '\\n') {
    window.cursorRow++;
    window.cursorCol = 0;
    if (window.cursorRow >= window.terminalDimensions.height) {
      if (allowScrolling) {
        // Scroll up
        window.terminalBuffer.shift();
        window.terminalBuffer.push(Array(window.terminalDimensions.width).fill(null).map(() => ({
          char: ' ',
          fg: null,
          bg: null,
          bold: false,
          dim: false,
          italic: false,
          underline: false,
          strikethrough: false
        })));
        window.cursorRow = window.terminalDimensions.height - 1;
      } else {
        // Don't scroll during patches - just clamp cursor
        window.cursorRow = window.terminalDimensions.height - 1;
      }
    }
    return;
  }

  if (char === '\\r') {
    window.cursorCol = 0;
    return;
  }

  if (char === '\\t') {
    window.cursorCol = Math.min(Math.floor((window.cursorCol + 8) / 8) * 8, window.terminalDimensions.width - 1);
    return;
  }

  if (window.cursorCol >= window.terminalDimensions.width) {
    window.cursorCol = 0;
    window.cursorRow++;
    if (window.cursorRow >= window.terminalDimensions.height) {
      if (allowScrolling) {
        window.terminalBuffer.shift();
        window.terminalBuffer.push(Array(window.terminalDimensions.width).fill(null).map(() => ({
          char: ' ',
          fg: null,
          bg: null,
          bold: false,
          dim: false,
          italic: false,
          underline: false,
          strikethrough: false
        })));
        window.cursorRow = window.terminalDimensions.height - 1;
      } else {
        // Don't scroll - just clamp
        window.cursorRow = window.terminalDimensions.height - 1;
      }
    }
  }

  if (window.cursorRow < window.terminalDimensions.height && window.cursorCol < window.terminalDimensions.width) {
    window.terminalBuffer[window.cursorRow][window.cursorCol] = {
      char: char,
      ...currentAttrs
    };
    window.cursorCol++;
  }
}

function handleEraseDisplay(mode) {
  // Implement erase display modes
  if (mode === 2) {
    initTerminal();
  }
}

function handleEraseLine(mode) {
  if (mode === 0) {
    for (let col = window.cursorCol; col < window.terminalDimensions.width; col++) {
      window.terminalBuffer[window.cursorRow][col] = { char: ' ', fg: null, bg: null, bold: false, dim: false, italic: false, underline: false, strikethrough: false };
    }
  } else if (mode === 2) {
    for (let col = 0; col < window.terminalDimensions.width; col++) {
      window.terminalBuffer[window.cursorRow][col] = { char: ' ', fg: null, bg: null, bold: false, dim: false, italic: false, underline: false, strikethrough: false };
    }
  }
}

// Removed duplicate colorPalette - using the one declared earlier

// HTML entity encoding
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Check if two cells have the same styling
function hasSameStyle(cell1, cell2) {
  return cell1.fg === cell2.fg &&
         cell1.bg === cell2.bg &&
         cell1.bold === cell2.bold &&
         cell1.dim === cell2.dim &&
         cell1.italic === cell2.italic &&
         cell1.underline === cell2.underline &&
         cell1.strikethrough === cell2.strikethrough;
}

// Build style attributes for a cell
function buildStyleAttrs(cell) {
  const classes = [];
  const styles = [];

  // Handle foreground color
  if (cell.fg) {
    if (cell.fg.startsWith('rgb(')) {
      styles.push(\`color: \${cell.fg}\`);
    } else if (cell.fg.startsWith('c')) {
      const colorIndex = parseInt(cell.fg.substring(1));
      if (colorIndex >= 0 && colorIndex < colorPalette.length) {
        styles.push(\`color: \${colorPalette[colorIndex]}\`);
      }
    } else {
      classes.push('term-fg-' + cell.fg);
    }
  }

  // Handle background color
  if (cell.bg) {
    if (cell.bg.startsWith('rgb(')) {
      styles.push(\`background-color: \${cell.bg}\`);
    } else if (cell.bg.startsWith('c')) {
      const colorIndex = parseInt(cell.bg.substring(1));
      if (colorIndex >= 0 && colorIndex < colorPalette.length) {
        styles.push(\`background-color: \${colorPalette[colorIndex]}\`);
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

// Render buffer to HTML with one div per row
// Connect to stream
function connectToStream() {
  const streamPaneId = window.actualPaneId || paneId;
  const url = \`/api/stream/\${streamPaneId}\`;

  fetch(url)
    .then(response => {
      if (!response.ok) throw new Error('Failed to connect');
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      updateConnectionStatus(true);

      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\\n')) !== -1) {
              const message = buffer.substring(0, newlineIndex);
              buffer = buffer.substring(newlineIndex + 1);

              if (message) {
                processMessage(message);
              }
            }
          }
        } catch (error) {
          updateConnectionStatus(false);
        }
      };

      processStream();
    })
    .catch(error => {
      updateConnectionStatus(false);
    });
}

function processMessage(message) {
  const colonIndex = message.indexOf(':');
  if (colonIndex === -1) return;

  const type = message.substring(0, colonIndex);
  const jsonStr = message.substring(colonIndex + 1);

  try {
    const data = JSON.parse(jsonStr);

    switch (type) {
      case 'INIT':
        window.terminalDimensions = { width: data.width, height: data.height };
        initTerminal();

        // Reset cursor to top-left before parsing INIT content
        window.cursorRow = 0;
        window.cursorCol = 0;

        // Parse content - NO scrolling for INIT, just clamp cursor to buffer
        // This prevents losing the first line when content fills the entire buffer
        parseAnsiAndUpdate(data.content || '', false, false);

        // Set cursor to actual tmux cursor position if provided
        if (data.cursorRow !== undefined && data.cursorCol !== undefined) {
          window.cursorRow = data.cursorRow;
          window.cursorCol = data.cursorCol;
        }
        renderToHtml();
        break;

      case 'PATCH':
        // PATCH: The backend sends us the raw diff between terminal states
        // This diff contains ANSI escape sequences that position the cursor
        // and write text. We need to simply replay these sequences.
        // The key insight: scrolling already happened in tmux BEFORE we captured
        // the diff. We're not replaying terminal output - we're applying a diff.
        const targetCursorRow = data.cursorRow;
        const targetCursorCol = data.cursorCol;

        // Apply changes - NO SCROLLING during patches
        // The diff tells us exactly what cells changed in the visible buffer
        data.changes.forEach(change => {
          parseAnsiAndUpdate(change.text, false, false);
        });

        // Set cursor to final position from tmux
        if (targetCursorRow !== undefined && targetCursorCol !== undefined) {
          window.cursorRow = targetCursorRow;
          window.cursorCol = targetCursorCol;
        }

        break;

      case 'RESIZE':
        terminalDimensions = { width: data.width, height: data.height };
        initTerminal();
        parseAnsiAndUpdate(data.content || '');
        renderToHtml();
        break;

      case 'HEARTBEAT':
        break;
    }
  } catch (error) {
    // Silently ignore parse errors
  }
}

function updateConnectionStatus(connected) {
  if (vueApp) {
    vueApp.connected = connected;
  }
}

// Initialize Vue app
const app = createApp({
  data() {
    return {
      terminalBuffer: [],
      dimensions: { width: 80, height: 24 },
      connected: false,
      cursorRow: 0,
      cursorCol: 0,
      paneTitle: 'Loading...',
      isMobile: false,
      ctrlActive: false,
      altActive: false,
      shiftActive: false,
      mobileInputValue: ''
    };
  },
  template: \`
    <div class="terminal-page">
      <header>
        <a href="/" class="back-button">← dmux</a>
        <h1>{{ paneTitle }}</h1>
        <div class="session-info">
          <span>{{ dimensions.width }}×{{ dimensions.height }}</span>
          <span class="status-indicator" :style="{ color: connected ? '#4ade80' : '#f87171' }">●</span>
        </div>
      </header>

      <!-- Mobile keyboard toolbar -->
      <div v-if="isMobile" class="mobile-toolbar">
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
        ref="mobileInput"
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
  \`,
  computed: {
    terminalContainerStyle() {
      // Set width to fit exactly the terminal columns
      // Using ch units (character width in monospace fonts)
      return {
        width: \`\${this.dimensions.width}ch\`,
        maxWidth: '100vw',
        fontSize: \`calc(100vw / \${this.dimensions.width} / 0.6)\`
      };
    }
  },
  methods: {
    renderRow(row, rowIndex) {
      let html = '';
      let col = 0;

      while (col < row.length) {
        const cell = row[col];
        const isCursor = (rowIndex === this.cursorRow && col === this.cursorCol);
        const hasStyle = cell.fg || cell.bg || cell.bold || cell.dim || cell.italic || cell.underline || cell.strikethrough || isCursor;

        if (!hasStyle) {
          let text = '';
          while (col < row.length) {
            const c = row[col];
            const isCur = (rowIndex === this.cursorRow && col === this.cursorCol);
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
            const nextIsCursor = (rowIndex === this.cursorRow && col === this.cursorCol);
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
    },
    toggleCtrl() {
      this.ctrlActive = !this.ctrlActive;
      if (this.ctrlActive && this.altActive) {
        this.altActive = false;
      }
    },
    toggleAlt() {
      this.altActive = !this.altActive;
      if (this.altActive && this.ctrlActive) {
        this.ctrlActive = false;
      }
    },
    toggleShift() {
      this.shiftActive = !this.shiftActive;
    },
    async sendKey(key) {
      const keystrokeData = {
        key: key,
        ctrlKey: this.ctrlActive,
        altKey: this.altActive,
        shiftKey: this.shiftActive,
        metaKey: false
      };

      // Reset modifiers after sending
      this.ctrlActive = false;
      this.altActive = false;
      this.shiftActive = false;

      try {
        await fetch(\`/api/keys/\${window.actualPaneId}\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(keystrokeData)
        });
      } catch (error) {
        // Silently ignore
      }
    },
    focusMobileInput() {
      if (this.isMobile && this.$refs.mobileInput) {
        this.$refs.mobileInput.focus();
      }
    },
    handleMobileInput(event) {
      // Get the new character(s) added
      const newValue = event.target.value;
      const oldValue = this.mobileInputValue;

      if (newValue.length > oldValue.length) {
        // Characters were added
        const addedChars = newValue.substring(oldValue.length);

        // Send each character
        for (const char of addedChars) {
          this.sendKey(char);
        }
      } else if (newValue.length < oldValue.length) {
        // Characters were deleted - send backspace
        const deletedCount = oldValue.length - newValue.length;
        for (let i = 0; i < deletedCount; i++) {
          this.sendKey('Backspace');
        }
      }

      // Clear the input to allow continuous typing
      this.$nextTick(() => {
        this.mobileInputValue = '';
      });
    },
    handleMobileKeydown(event) {
      // Handle special keys
      if (event.key === 'Enter') {
        event.preventDefault();
        this.sendKey('Enter');
      } else if (event.key === 'Backspace' && this.mobileInputValue === '') {
        event.preventDefault();
        this.sendKey('Backspace');
      }
    }
  },
  mounted() {
    // Make Vue app instance globally accessible
    window.vueApp = this;
    vueApp = this;

    // Detect mobile device
    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth < 768;

    // Wire up global variables to Vue's reactive properties
    // When code reads/writes terminalBuffer, it actually reads/writes this.terminalBuffer
    Object.defineProperty(window, 'terminalBuffer', {
      get: () => this.terminalBuffer,
      set: (val) => { this.terminalBuffer = val; },
      configurable: true
    });
    Object.defineProperty(window, 'cursorRow', {
      get: () => this.cursorRow,
      set: (val) => { this.cursorRow = val; },
      configurable: true
    });
    Object.defineProperty(window, 'cursorCol', {
      get: () => this.cursorCol,
      set: (val) => { this.cursorCol = val; },
      configurable: true
    });
    Object.defineProperty(window, 'terminalDimensions', {
      get: () => this.dimensions,
      set: (val) => { this.dimensions = val; },
      configurable: true
    });

    // Assign to module-level variables so code can use them
    terminalBuffer = this.terminalBuffer;
    terminalDimensions = this.dimensions;
    cursorRow = this.cursorRow;
    cursorCol = this.cursorCol;

    // Load pane info and start streaming
    fetch('/api/panes')
      .then(r => r.json())
      .then(data => {
        // Try to find pane by ID first, then by slug (for backwards compat)
        let pane = data.panes.find(p => p.id === paneId);
        if (!pane) {
          pane = data.panes.find(p => p.slug === paneId);
        }
        if (pane) {
          this.paneTitle = pane.slug;
          // Use the actual pane ID for streaming
          window.actualPaneId = pane.id;
        }
        connectToStream();
      })
      .catch(err => {
        connectToStream();
      });
  }
});

// Keyboard input handling - send keystrokes to backend
document.addEventListener('keydown', async (event) => {
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

  try {
    const response = await fetch(\`/api/keys/\${window.actualPaneId}\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(keystrokeData)
    });
  } catch (error) {
    // Silently ignore keystroke errors
  }
});

app.mount('#app');

// Remove the old renderToHtml function - Vue handles rendering
function renderToHtml() {
  // No-op: Vue reactively renders terminalBuffer changes
}