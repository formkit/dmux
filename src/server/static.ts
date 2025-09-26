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

      \${testStatus !== 'none' ? \`
      <div class="status-item">
        <span class="status-label">Tests:</span>
        <span class="status-value">
          <span class="status-badge \${testStatus}">\${testStatus}</span>
        </span>
      </div>
      \` : ''}

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