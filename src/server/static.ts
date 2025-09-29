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
.term-underline { text-decoration: underline; }`;
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

// Strip ANSI escape codes from text
function stripAnsiCodes(text) {
  return text
    // CSI sequences (ESC[...m for colors, ESC[...H for cursor, etc)
    .replace(/\\x1b\\[[0-9;?]*[a-zA-Z]/g, '')
    // OSC sequences (ESC]...BEL or ESC]...ESC\\)
    .replace(/\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)/g, '')
    // Other escape sequences
    .replace(/\\x1b[=>NOPQRSTUVWXYZ\\[\\\\\\]^_]/g, '')
    // Control characters (except newline, tab, carriage return)
    .replace(/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]/g, '');
}

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

  // Strip ANSI codes from initial content
  const cleanContent = stripAnsiCodes(data.content || '');
  outputElement.textContent = cleanContent;

  const lines = cleanContent.split('\\n');
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

    // Strip ANSI codes from patch text
    const cleanText = stripAnsiCodes(text);

    for (let i = 0; i < cleanText.length; i++) {
      const char = cleanText[i];
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

  // Strip ANSI codes from resize content
  const cleanContent = stripAnsiCodes(data.content || '');
  outputElement.textContent = cleanContent;

  const lines = cleanContent.split('\\n');
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
  const card = document.createElement('div');
  card.className = 'pane-card';
  card.style.cursor = 'pointer';
  card.onclick = () => {
    console.log('Card clicked!', pane.id, pane.slug);
    openTerminal(pane.id, pane.slug);
  };

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