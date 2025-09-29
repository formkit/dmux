export function getTerminalViewerHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terminal Viewer - dmux</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="terminal-page">
    <div class="terminal-header">
      <a href="/" class="back-button">← Back to Dashboard</a>
      <span class="terminal-title" id="terminal-title">Terminal</span>
      <div class="terminal-status">
        <span id="terminal-dimensions">80x24</span>
        <span id="terminal-connection" class="status-indicator">● Connecting</span>
      </div>
    </div>

    <div class="terminal-content">
      <pre id="terminal-output" class="terminal-output"></pre>
    </div>
  </div>

  <script src="/terminal.js"></script>
</body>
</html>`;
}

export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>dmux Dashboard</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="container">
    <header>
      <h1>dmux Dashboard</h1>
      <div class="session-info">
        <span id="project-name">Loading...</span>
        <span id="session-name"></span>
        <span id="server-status" class="status-indicator">●</span>
      </div>
    </header>

    <main>
      <div id="panes-grid" class="panes-grid">
        <!-- Panes will be rendered here -->
      </div>

      <div id="no-panes" class="no-panes" style="display: none;">
        <p>No dmux panes active</p>
        <p class="hint">Press 'n' in dmux to create a new pane</p>
      </div>
    </main>

    <footer>
      <div class="footer-info">
        <span>Auto-refresh: <span id="refresh-status">ON</span></span>
        <span>Last update: <span id="last-update">Never</span></span>
      </div>
    </footer>
  </div>

  <!-- Terminal Modal -->
  <div id="terminal-modal" class="terminal-modal" style="display: none;">
    <div class="terminal-container">
      <div class="terminal-header">
        <span class="terminal-title">Terminal Output</span>
        <button class="terminal-close" onclick="closeTerminal()">×</button>
      </div>
      <div class="terminal-body">
        <pre id="terminal-output" class="terminal-output"></pre>
      </div>
      <div class="terminal-status">
        <span id="terminal-dimensions">80x24</span>
        <span id="terminal-connection">● Connected</span>
      </div>
    </div>
  </div>

  <script src="/dashboard.js"></script>
</body>
</html>`;
}

export function getDashboardCss(): string {
  return `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', monospace;
  background: #0a0a0a;
  color: #e0e0e0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 0;
  border-bottom: 1px solid #333;
  margin-bottom: 30px;
}

h1 {
  font-size: 28px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.session-info {
  display: flex;
  gap: 20px;
  align-items: center;
  font-size: 14px;
  color: #888;
}

.status-indicator {
  color: #4ade80;
  font-size: 10px;
}

main {
  flex: 1;
}

.panes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.pane-card {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 20px;
  transition: all 0.2s ease;
}

.pane-card:hover {
  border-color: #667eea;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
}

.pane-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 15px;
}

.pane-title {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}

.pane-agent {
  display: inline-block;
  padding: 2px 8px;
  background: #333;
  border-radius: 4px;
  font-size: 12px;
  color: #888;
}

.pane-agent.claude {
  background: #D97757;
  color: #fff;
}

.pane-agent.opencode {
  background: #667eea;
  color: #fff;
}

.pane-prompt {
  color: #999;
  font-size: 14px;
  margin-bottom: 15px;
  line-height: 1.4;
  max-height: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: help;
  position: relative;
}

.tooltip {
  position: absolute;
  background: #2a2a2a;
  border: 1px solid #444;
  padding: 10px;
  border-radius: 4px;
  z-index: 1000;
  white-space: pre-wrap;
  max-width: 400px;
  max-height: 200px;
  overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  font-size: 13px;
  color: #e0e0e0;
  pointer-events: none;
}

.pane-status {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.status-label {
  color: #666;
}

.status-value {
  display: flex;
  align-items: center;
  gap: 5px;
}

.status-badge {
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 500;
}

.status-badge.working {
  background: #fbbf24;
  color: #000;
}

.status-badge.waiting {
  background: #60a5fa;
  color: #000;
}

.status-badge.idle {
  background: #333;
  color: #888;
}

.status-badge.running {
  background: #4ade80;
  color: #000;
}

.status-badge.passed {
  background: #4ade80;
  color: #000;
}

.status-badge.failed {
  background: #f87171;
  color: #000;
}

.pane-id {
  font-family: monospace;
  font-size: 11px;
  color: #555;
}

.no-panes {
  text-align: center;
  padding: 60px 20px;
  color: #666;
}

.no-panes p {
  margin-bottom: 10px;
}

.hint {
  font-size: 14px;
  color: #444;
}

footer {
  border-top: 1px solid #333;
  padding: 20px 0;
  margin-top: auto;
}

.footer-info {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #666;
}

@media (max-width: 768px) {
  .panes-grid {
    grid-template-columns: 1fr;
  }

  header {
    flex-direction: column;
    gap: 15px;
    align-items: start;
  }

  .session-info {
    flex-wrap: wrap;
  }
}

/* Terminal Modal Styles */
.terminal-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.terminal-container {
  background: #1e1e1e;
  border-radius: 8px;
  width: 90%;
  height: 80%;
  max-width: 1200px;
  max-height: 800px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
}

.terminal-header {
  background: #2d2d2d;
  padding: 12px 20px;
  border-radius: 8px 8px 0 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #444;
}

.terminal-title {
  color: #fff;
  font-weight: 500;
  font-size: 14px;
}

.terminal-close {
  background: transparent;
  border: none;
  color: #999;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.terminal-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.terminal-body {
  flex: 1;
  overflow: auto;
  padding: 10px;
  background: #000;
}

.terminal-output {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace;
  font-size: 13px;
  line-height: 1.4;
  color: #f0f0f0;
  white-space: pre;
  margin: 0;
  min-height: 100%;
  position: relative;
}

.terminal-status {
  background: #2d2d2d;
  padding: 8px 20px;
  border-top: 1px solid #444;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #999;
}

#terminal-dimensions {
  font-family: monospace;
}

#terminal-connection {
  display: flex;
  align-items: center;
  gap: 5px;
}

#terminal-connection.connected {
  color: #4ade80;
}

#terminal-connection.disconnected {
  color: #f87171;
}

/* Terminal text colors */
.term-fg-black { color: #000000; }
.term-fg-red { color: #cd3131; }
.term-fg-green { color: #0dbc79; }
.term-fg-yellow { color: #e5e510; }
.term-fg-blue { color: #2472c8; }
.term-fg-magenta { color: #bc3fbc; }
.term-fg-cyan { color: #11a8cd; }
.term-fg-white { color: #e5e5e5; }

.term-fg-bright-black { color: #666666; }
.term-fg-bright-red { color: #f14c4c; }
.term-fg-bright-green { color: #23d18b; }
.term-fg-bright-yellow { color: #f5f543; }
.term-fg-bright-blue { color: #3b8eea; }
.term-fg-bright-magenta { color: #d670d6; }
.term-fg-bright-cyan { color: #29b8db; }
.term-fg-bright-white { color: #ffffff; }

.term-bg-black { background-color: #000000; }
.term-bg-red { background-color: #cd3131; }
.term-bg-green { background-color: #0dbc79; }
.term-bg-yellow { background-color: #e5e510; }
.term-bg-blue { background-color: #2472c8; }
.term-bg-magenta { background-color: #bc3fbc; }
.term-bg-cyan { background-color: #11a8cd; }
.term-bg-white { background-color: #e5e5e5; }

.term-bold { font-weight: bold; }
.term-dim { opacity: 0.7; }
.term-italic { font-style: italic; }
.term-underline { text-decoration: underline; }

/* Terminal Page Layout */
.terminal-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #000;
}

.terminal-page .terminal-header {
  background: #2d2d2d;
  padding: 12px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #444;
}

.back-button {
  color: #667eea;
  text-decoration: none;
  font-size: 14px;
  transition: color 0.2s;
}

.back-button:hover {
  color: #5568d3;
}

.terminal-page .terminal-title {
  color: #fff;
  font-weight: 500;
  font-size: 14px;
  flex: 1;
  text-align: center;
}

.terminal-page .terminal-status {
  display: flex;
  gap: 15px;
  font-size: 12px;
  color: #999;
}

.terminal-content {
  flex: 1;
  overflow: auto;
  padding: 10px;
}

.terminal-page .terminal-output {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace;
  font-size: 13px;
  line-height: 1.4;
  color: #f0f0f0;
  white-space: pre;
  margin: 0;
  min-height: 100%;
}`;
}

export function getDashboardJs(): string {
  return `let refreshInterval = null;
let lastUpdate = null;

async function fetchPanes() {
  try {
    const response = await fetch('/api/panes');
    const data = await response.json();
    updateDashboard(data);
    updateStatus('online');
  } catch (err) {
    console.error('Failed to fetch panes:', err);
    updateStatus('offline');
  }
}

function updateDashboard(data) {
  // Update header info
  document.getElementById('project-name').textContent = data.projectName || 'Unknown Project';
  document.getElementById('session-name').textContent = data.sessionName || '';

  // Update panes grid
  const grid = document.getElementById('panes-grid');
  const noPanes = document.getElementById('no-panes');

  if (data.panes.length === 0) {
    grid.style.display = 'none';
    noPanes.style.display = 'block';
  } else {
    grid.style.display = 'grid';
    noPanes.style.display = 'none';
    renderPanes(data.panes);
  }

  // Update last update time
  lastUpdate = new Date();
  updateLastUpdateTime();
}

// Terminal Viewer functionality
let currentStream = null;
let terminalBuffer = [];
let terminalDimensions = { width: 80, height: 24 };

function openTerminal(paneId, paneTitle) {
  console.log('openTerminal called with:', paneId, paneTitle);
  const modal = document.getElementById('terminal-modal');
  const titleElement = document.querySelector('.terminal-title');
  const outputElement = document.getElementById('terminal-output');

  if (!modal) {
    console.error('Modal not found!');
    return;
  }

  titleElement.textContent = \`Terminal: \${paneTitle}\`;
  modal.style.display = 'flex';
  outputElement.innerHTML = 'Connecting...';
  terminalBuffer = [];

  if (currentStream) {
    currentStream.close();
    currentStream = null;
  }

  connectToStream(paneId);
}

function closeTerminal() {
  const modal = document.getElementById('terminal-modal');
  modal.style.display = 'none';

  if (currentStream) {
    currentStream.close();
    currentStream = null;
  }

  updateConnectionStatus(false);
}

function connectToStream(paneId) {
  const outputElement = document.getElementById('terminal-output');

  terminalBuffer = Array(terminalDimensions.height).fill(null).map(() =>
    Array(terminalDimensions.width).fill(' ')
  );

  const url = \`/api/stream/\${paneId}\`;

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
          console.error('Stream error:', error);
          updateConnectionStatus(false);
        }
      };

      currentStream = reader;
      processStream();
    })
    .catch(error => {
      console.error('Connection failed:', error);
      outputElement.innerHTML = 'Failed to connect to terminal stream';
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
        handleInitMessage(data);
        break;
      case 'PATCH':
        handlePatchMessage(data);
        break;
      case 'RESIZE':
        handleResizeMessage(data);
        break;
      case 'HEARTBEAT':
        break;
    }
  } catch (error) {
    console.error('Failed to parse message:', error);
  }
}

function handleInitMessage(data) {
  const outputElement = document.getElementById('terminal-output');
  const dimensionsElement = document.getElementById('terminal-dimensions');

  terminalDimensions = { width: data.width, height: data.height };
  dimensionsElement.textContent = \`\${data.width}x\${data.height}\`;

  // Content is already parsed by backend TerminalDiffer
  outputElement.textContent = data.content || '';

  const lines = (data.content || '').split('\\n');
  terminalBuffer = Array(terminalDimensions.height).fill(null).map((_, i) => {
    const line = lines[i] || '';
    return Array(terminalDimensions.width).fill(null).map((_, j) =>
      line[j] || ' '
    );
  });
}

function handlePatchMessage(data) {
  data.changes.forEach(change => {
    const { row, col, text } = change;

    // Text is already parsed by backend TerminalDiffer
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const targetRow = row + Math.floor((col + i) / terminalDimensions.width);
      const targetCol = (col + i) % terminalDimensions.width;

      if (targetRow < terminalBuffer.length && targetCol < terminalBuffer[targetRow].length) {
        if (char === '\\n') {
          continue;
        }
        terminalBuffer[targetRow][targetCol] = char;
      }
    }
  });

  renderTerminal();
}

function handleResizeMessage(data) {
  const outputElement = document.getElementById('terminal-output');
  const dimensionsElement = document.getElementById('terminal-dimensions');

  terminalDimensions = { width: data.width, height: data.height };
  dimensionsElement.textContent = \`\${data.width}x\${data.height}\`;

  // Content is already parsed by backend TerminalDiffer
  outputElement.textContent = data.content || '';

  const lines = (data.content || '').split('\\n');
  terminalBuffer = Array(terminalDimensions.height).fill(null).map((_, i) => {
    const line = lines[i] || '';
    return Array(terminalDimensions.width).fill(null).map((_, j) =>
      line[j] || ' '
    );
  });
}

function renderTerminal() {
  const outputElement = document.getElementById('terminal-output');

  // Convert buffer to string (already cleaned of ANSI codes)
  const content = terminalBuffer.map(row =>
    row.join('')
  ).join('\\n');

  outputElement.textContent = content;
}

function updateConnectionStatus(connected) {
  const statusElement = document.getElementById('terminal-connection');
  if (connected) {
    statusElement.innerHTML = '● Connected';
    statusElement.className = 'connected';
  } else {
    statusElement.innerHTML = '● Disconnected';
    statusElement.className = 'disconnected';
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('terminal-modal');
    if (modal.style.display === 'flex') {
      closeTerminal();
    }
  }
});

function renderPanes(panes) {
  const grid = document.getElementById('panes-grid');
  grid.innerHTML = '';

  panes.forEach(pane => {
    const card = createPaneCard(pane);
    grid.appendChild(card);
  });
}

function createPaneCard(pane) {
  const card = document.createElement('a');
  card.href = \`/panes/\${pane.id}\`;
  card.className = 'pane-card';
  card.style.textDecoration = 'none';
  card.style.color = 'inherit';

  const agentStatus = pane.agentStatus || 'idle';
  const testStatus = pane.testStatus || 'none';
  const devStatus = pane.devStatus || 'stopped';

  card.innerHTML = \`
    <div class="pane-header">
      <div>
        <div class="pane-title">\${escapeHtml(pane.slug)}</div>
        <div class="pane-id">Pane: \${escapeHtml(pane.paneId)}</div>
      </div>
      <span class="pane-agent \${pane.agent || ''}">\${pane.agent || 'unknown'}</span>
    </div>

    <div class="pane-prompt" title="\${escapeHtml(pane.prompt || 'No prompt')}">\${escapeHtml(pane.prompt || 'No prompt')}</div>

    <div class="pane-status">
      <div class="status-item">
        <span class="status-label">Agent:</span>
        <span class="status-value">
          <span class="status-badge \${agentStatus}">\${agentStatus}</span>
        </span>
      </div>

      \${/* Test status display commented out for now
      testStatus !== 'none' ? \`
      <div class="status-item">
        <span class="status-label">Tests:</span>
        <span class="status-value">
          <span class="status-badge \${testStatus}">\${testStatus}</span>
        </span>
      </div>
      \` : '' */
      ''}

      \${devStatus !== 'stopped' ? \`
      <div class="status-item">
        <span class="status-label">Dev Server:</span>
        <span class="status-value">
          <span class="status-badge \${devStatus}">\${devStatus}</span>
          \${pane.devUrl ? \`<a href="\${pane.devUrl}" target="_blank">↗</a>\` : ''}
        </span>
      </div>
      \` : ''}
    </div>
  \`;

  return card;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function updateStatus(status) {
  const indicator = document.getElementById('server-status');
  if (status === 'online') {
    indicator.style.color = '#4ade80';
  } else {
    indicator.style.color = '#f87171';
  }
}

function updateLastUpdateTime() {
  if (!lastUpdate) return;

  const element = document.getElementById('last-update');
  const now = new Date();
  const diff = Math.floor((now - lastUpdate) / 1000);

  if (diff < 60) {
    element.textContent = diff + 's ago';
  } else if (diff < 3600) {
    element.textContent = Math.floor(diff / 60) + 'm ago';
  } else {
    element.textContent = Math.floor(diff / 3600) + 'h ago';
  }
}

function startAutoRefresh() {
  fetchPanes();
  refreshInterval = setInterval(() => {
    fetchPanes();
  }, 2000);

  // Update time display every second
  setInterval(updateLastUpdateTime, 1000);
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

// Handle page visibility to pause/resume updates
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopAutoRefresh();
  } else {
    startAutoRefresh();
  }
});

// Tooltip functionality
function setupTooltips() {
  let tooltip = null;
  let tooltipTimeout = null;

  document.addEventListener('mouseover', (e) => {
    const target = e.target;
    if (target.classList && target.classList.contains('pane-prompt')) {
      // Clear any existing timeout
      if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
      }

      // Show tooltip after 500ms hover
      tooltipTimeout = setTimeout(() => {
        // Remove existing tooltip
        if (tooltip) {
          tooltip.remove();
        }

        // Create new tooltip
        tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.textContent = target.getAttribute('title') || target.textContent;

        // Position tooltip
        document.body.appendChild(tooltip);
        const rect = target.getBoundingClientRect();
        tooltip.style.left = rect.left + 'px';
        tooltip.style.top = (rect.bottom + 5) + 'px';

        // Adjust if tooltip goes off screen
        const tooltipRect = tooltip.getBoundingClientRect();
        if (tooltipRect.right > window.innerWidth) {
          tooltip.style.left = (window.innerWidth - tooltipRect.width - 10) + 'px';
        }
        if (tooltipRect.bottom > window.innerHeight) {
          tooltip.style.top = (rect.top - tooltipRect.height - 5) + 'px';
        }
      }, 500);
    }
  });

  document.addEventListener('mouseout', (e) => {
    const target = e.target;
    if (target.classList && target.classList.contains('pane-prompt')) {
      // Clear timeout
      if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
        tooltipTimeout = null;
      }

      // Remove tooltip after small delay
      setTimeout(() => {
        if (tooltip && !tooltip.matches(':hover')) {
          tooltip.remove();
          tooltip = null;
        }
      }, 100);
    }
  });
}

// Start on page load
document.addEventListener('DOMContentLoaded', () => {
  startAutoRefresh();
  setupTooltips();
});`;
}

export function getTerminalJs(): string {
  return `// Terminal viewer with ANSI parsing and HTML rendering
const paneId = window.location.pathname.split('/').pop();
let terminalBuffer = [];
let terminalDimensions = { width: 80, height: 24 };
let currentAttrs = {};
let cursorRow = 0;
let cursorCol = 0;

// Initialize terminal
function initTerminal() {
  terminalBuffer = Array(terminalDimensions.height).fill(null).map(() =>
    Array(terminalDimensions.width).fill(null).map(() => ({
      char: ' ',
      fg: null,
      bg: null,
      bold: false,
      dim: false,
      italic: false,
      underline: false
    }))
  );
}

// Parse ANSI codes and update buffer
function parseAnsiAndUpdate(text) {
  let i = 0;

  while (i < text.length) {
    const code = text.charCodeAt(i);

    // Check for escape sequence (ESC = 27)
    if (code === 27) {
      // Escape sequence
      const seqEnd = findEscapeSequenceEnd(text, i);
      if (seqEnd > i) {
        handleEscapeSequence(text.substring(i, seqEnd));
        i = seqEnd;
        continue;
      }
    }

    // Handle backspace
    if (code === 8) {
      if (cursorCol > 0) {
        cursorCol--;
      }
      i++;
      continue;
    }

    // Regular character
    handleCharacter(text[i]);
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

  switch (command) {
    case 'H': // Cursor position
    case 'f':
      cursorRow = Math.min(Math.max((args[0] || 1) - 1, 0), terminalDimensions.height - 1);
      cursorCol = Math.min(Math.max((args[1] || 1) - 1, 0), terminalDimensions.width - 1);
      break;

    case 'A': // Cursor up
      cursorRow = Math.max(cursorRow - (args[0] || 1), 0);
      break;

    case 'B': // Cursor down
      cursorRow = Math.min(cursorRow + (args[0] || 1), terminalDimensions.height - 1);
      break;

    case 'C': // Cursor forward
      cursorCol = Math.min(cursorCol + (args[0] || 1), terminalDimensions.width - 1);
      break;

    case 'D': // Cursor back
      cursorCol = Math.max(cursorCol - (args[0] || 1), 0);
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
    } else if (arg === 22) {
      currentAttrs.bold = false;
      currentAttrs.dim = false;
    } else if (arg === 23) {
      currentAttrs.italic = false;
    } else if (arg === 24) {
      currentAttrs.underline = false;
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

function handleCharacter(char) {
  if (char === '\\n') {
    cursorRow++;
    cursorCol = 0;
    if (cursorRow >= terminalDimensions.height) {
      // Scroll up
      terminalBuffer.shift();
      terminalBuffer.push(Array(terminalDimensions.width).fill(null).map(() => ({
        char: ' ',
        fg: null,
        bg: null,
        bold: false,
        dim: false,
        italic: false,
        underline: false
      })));
      cursorRow = terminalDimensions.height - 1;
    }
    return;
  }

  if (char === '\\r') {
    cursorCol = 0;
    return;
  }

  if (char === '\\t') {
    cursorCol = Math.min(Math.floor((cursorCol + 8) / 8) * 8, terminalDimensions.width - 1);
    return;
  }

  if (cursorCol >= terminalDimensions.width) {
    cursorCol = 0;
    cursorRow++;
    if (cursorRow >= terminalDimensions.height) {
      terminalBuffer.shift();
      terminalBuffer.push(Array(terminalDimensions.width).fill(null).map(() => ({
        char: ' ',
        fg: null,
        bg: null,
        bold: false,
        dim: false,
        italic: false,
        underline: false
      })));
      cursorRow = terminalDimensions.height - 1;
    }
  }

  if (cursorRow < terminalDimensions.height && cursorCol < terminalDimensions.width) {
    terminalBuffer[cursorRow][cursorCol] = {
      char: char,
      ...currentAttrs
    };
    cursorCol++;
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
    for (let col = cursorCol; col < terminalDimensions.width; col++) {
      terminalBuffer[cursorRow][col] = { char: ' ', fg: null, bg: null, bold: false, dim: false, italic: false, underline: false };
    }
  } else if (mode === 2) {
    for (let col = 0; col < terminalDimensions.width; col++) {
      terminalBuffer[cursorRow][col] = { char: ' ', fg: null, bg: null, bold: false, dim: false, italic: false, underline: false };
    }
  }
}

// 256-color palette (xterm colors)
const colorPalette = [
  // 0-15: Standard and bright colors
  '#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0',
  '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff',
  // 16-231: 6x6x6 color cube
  '#000000', '#00005f', '#000087', '#0000af', '#0000d7', '#0000ff',
  '#005f00', '#005f5f', '#005f87', '#005faf', '#005fd7', '#005fff',
  '#008700', '#00875f', '#008787', '#0087af', '#0087d7', '#0087ff',
  '#00af00', '#00af5f', '#00af87', '#00afaf', '#00afd7', '#00afff',
  '#00d700', '#00d75f', '#00d787', '#00d7af', '#00d7d7', '#00d7ff',
  '#00ff00', '#00ff5f', '#00ff87', '#00ffaf', '#00ffd7', '#00ffff',
  '#5f0000', '#5f005f', '#5f0087', '#5f00af', '#5f00d7', '#5f00ff',
  '#5f5f00', '#5f5f5f', '#5f5f87', '#5f5faf', '#5f5fd7', '#5f5fff',
  '#5f8700', '#5f875f', '#5f8787', '#5f87af', '#5f87d7', '#5f87ff',
  '#5faf00', '#5faf5f', '#5faf87', '#5fafaf', '#5fafd7', '#5fafff',
  '#5fd700', '#5fd75f', '#5fd787', '#5fd7af', '#5fd7d7', '#5fd7ff',
  '#5fff00', '#5fff5f', '#5fff87', '#5fffaf', '#5fffd7', '#5fffff',
  '#870000', '#87005f', '#870087', '#8700af', '#8700d7', '#8700ff',
  '#875f00', '#875f5f', '#875f87', '#875faf', '#875fd7', '#875fff',
  '#878700', '#87875f', '#878787', '#8787af', '#8787d7', '#8787ff',
  '#87af00', '#87af5f', '#87af87', '#87afaf', '#87afd7', '#87afff',
  '#87d700', '#87d75f', '#87d787', '#87d7af', '#87d7d7', '#87d7ff',
  '#87ff00', '#87ff5f', '#87ff87', '#87ffaf', '#87ffd7', '#87ffff',
  '#af0000', '#af005f', '#af0087', '#af00af', '#af00d7', '#af00ff',
  '#af5f00', '#af5f5f', '#af5f87', '#af5faf', '#af5fd7', '#af5fff',
  '#af8700', '#af875f', '#af8787', '#af87af', '#af87d7', '#af87ff',
  '#afaf00', '#afaf5f', '#afaf87', '#afafaf', '#afafd7', '#afafff',
  '#afd700', '#afd75f', '#afd787', '#afd7af', '#afd7d7', '#afd7ff',
  '#afff00', '#afff5f', '#afff87', '#afffaf', '#afffd7', '#afffff',
  '#d70000', '#d7005f', '#d70087', '#d700af', '#d700d7', '#d700ff',
  '#d75f00', '#d75f5f', '#d75f87', '#d75faf', '#d75fd7', '#d75fff',
  '#d78700', '#d7875f', '#d78787', '#d787af', '#d787d7', '#d787ff',
  '#d7af00', '#d7af5f', '#d7af87', '#d7afaf', '#d7afd7', '#d7afff',
  '#d7d700', '#d7d75f', '#d7d787', '#d7d7af', '#d7d7d7', '#d7d7ff',
  '#d7ff00', '#d7ff5f', '#d7ff87', '#d7ffaf', '#d7ffd7', '#d7ffff',
  '#ff0000', '#ff005f', '#ff0087', '#ff00af', '#ff00d7', '#ff00ff',
  '#ff5f00', '#ff5f5f', '#ff5f87', '#ff5faf', '#ff5fd7', '#ff5fff',
  '#ff8700', '#ff875f', '#ff8787', '#ff87af', '#ff87d7', '#ff87ff',
  '#ffaf00', '#ffaf5f', '#ffaf87', '#ffafaf', '#ffafd7', '#ffafff',
  '#ffd700', '#ffd75f', '#ffd787', '#ffd7af', '#ffd7d7', '#ffd7ff',
  '#ffff00', '#ffff5f', '#ffff87', '#ffffaf', '#ffffd7', '#ffffff',
  // 232-255: Grayscale
  '#080808', '#121212', '#1c1c1c', '#262626', '#303030', '#3a3a3a',
  '#444444', '#4e4e4e', '#585858', '#626262', '#6c6c6c', '#767676',
  '#808080', '#8a8a8a', '#949494', '#9e9e9e', '#a8a8a8', '#b2b2b2',
  '#bcbcbc', '#c6c6c6', '#d0d0d0', '#dadada', '#e4e4e4', '#eeeeee'
];

// Render buffer to HTML
function renderToHtml() {
  const outputElement = document.getElementById('terminal-output');
  let html = '';

  for (let row = 0; row < terminalBuffer.length; row++) {
    for (let col = 0; col < terminalBuffer[row].length; col++) {
      const cell = terminalBuffer[row][col];
      const char = cell.char === ' ' ? ' ' : cell.char;

      if (cell.fg || cell.bg || cell.bold || cell.dim || cell.italic || cell.underline) {
        const classes = [];
        const styles = [];

        // Handle foreground color
        if (cell.fg) {
          if (cell.fg.startsWith('rgb(')) {
            // RGB color
            styles.push(\`color: \${cell.fg}\`);
          } else if (cell.fg.startsWith('c')) {
            // 256-color palette
            const colorIndex = parseInt(cell.fg.substring(1));
            if (colorIndex >= 0 && colorIndex < colorPalette.length) {
              styles.push(\`color: \${colorPalette[colorIndex]}\`);
            }
          } else {
            // Named color
            classes.push('term-fg-' + cell.fg);
          }
        }

        // Handle background color
        if (cell.bg) {
          if (cell.bg.startsWith('rgb(')) {
            // RGB color
            styles.push(\`background-color: \${cell.bg}\`);
          } else if (cell.bg.startsWith('c')) {
            // 256-color palette
            const colorIndex = parseInt(cell.bg.substring(1));
            if (colorIndex >= 0 && colorIndex < colorPalette.length) {
              styles.push(\`background-color: \${colorPalette[colorIndex]}\`);
            }
          } else {
            // Named color
            classes.push('term-bg-' + cell.bg);
          }
        }

        // Add attribute classes
        if (cell.bold) classes.push('term-bold');
        if (cell.dim) classes.push('term-dim');
        if (cell.italic) classes.push('term-italic');
        if (cell.underline) classes.push('term-underline');

        const classAttr = classes.length ? \` class="\${classes.join(' ')}"\` : '';
        const styleAttr = styles.length ? \` style="\${styles.join('; ')}"\` : '';
        html += \`<span\${classAttr}\${styleAttr}>\${char}</span>\`;
      } else {
        html += char;
      }
    }
    html += '\\n';
  }

  outputElement.innerHTML = html;
}

// Connect to stream
function connectToStream() {
  const url = \`/api/stream/\${paneId}\`;

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
          console.error('Stream error:', error);
          updateConnectionStatus(false);
        }
      };

      processStream();
    })
    .catch(error => {
      console.error('Connection failed:', error);
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
        terminalDimensions = { width: data.width, height: data.height };
        document.getElementById('terminal-dimensions').textContent = \`\${data.width}x\${data.height}\`;
        initTerminal();
        parseAnsiAndUpdate(data.content || '');
        // Set cursor to actual tmux cursor position if provided
        if (data.cursorRow !== undefined && data.cursorCol !== undefined) {
          cursorRow = data.cursorRow;
          cursorCol = data.cursorCol;
        }
        renderToHtml();
        break;

      case 'PATCH':
        data.changes.forEach(change => {
          parseAnsiAndUpdate(change.text);
        });
        renderToHtml();
        break;

      case 'RESIZE':
        terminalDimensions = { width: data.width, height: data.height };
        document.getElementById('terminal-dimensions').textContent = \`\${data.width}x\${data.height}\`;
        initTerminal();
        parseAnsiAndUpdate(data.content || '');
        renderToHtml();
        break;

      case 'HEARTBEAT':
        break;
    }
  } catch (error) {
    console.error('Failed to parse message:', error);
  }
}

function updateConnectionStatus(connected) {
  const statusElement = document.getElementById('terminal-connection');
  if (connected) {
    statusElement.innerHTML = '● Connected';
    statusElement.style.color = '#4ade80';
  } else {
    statusElement.innerHTML = '● Disconnected';
    statusElement.style.color = '#f87171';
  }
}

// Load pane info and start streaming
fetch('/api/panes')
  .then(r => r.json())
  .then(data => {
    const pane = data.panes.find(p => p.id === paneId);
    if (pane) {
      document.getElementById('terminal-title').textContent = \`Terminal: \${pane.slug}\`;
    }
    connectToStream();
  })
  .catch(err => {
    console.error('Failed to load pane info:', err);
    connectToStream(); // Try connecting anyway
  });`;
}