export const meta = { title: 'Agents' };

export function render() {
  return `
    <h1>Agents</h1>
    <p class="lead">dmux supports three AI coding agents. Each agent is automatically detected if its CLI is installed and available in your PATH.</p>

    <h2>Supported Agents</h2>

    <h3>Claude Code</h3>
    <p><a href="https://docs.anthropic.com/en/docs/claude-code" target="_blank" rel="noopener">Claude Code</a> is Anthropic's agentic coding tool. dmux launches it with:</p>
    <pre><code data-lang="bash">claude "your prompt" [permission flags from permissionMode]</code></pre>
    <p>By default, dmux uses <code>"permissionMode": "bypassPermissions"</code> (most permissive).</p>

    <h3>opencode</h3>
    <p><a href="https://github.com/opencode-ai/opencode" target="_blank" rel="noopener">opencode</a> is an open-source coding agent. dmux launches it directly with your prompt.</p>

    <h3>Codex</h3>
    <p><a href="https://github.com/openai/codex" target="_blank" rel="noopener">Codex</a> is OpenAI's coding agent. dmux launches it with:</p>
    <pre><code data-lang="bash">codex "your prompt" [permission flags from permissionMode]</code></pre>

    <h2>Agent Detection</h2>
    <p>dmux automatically detects installed agents by searching:</p>
    <ol>
      <li>Your shell's command path (<code>command -v</code>)</li>
      <li>Common installation directories:
        <ul>
          <li><code>~/.claude/local/claude</code></li>
          <li><code>~/.local/bin/</code></li>
          <li><code>/usr/local/bin/</code></li>
          <li><code>/opt/homebrew/bin/</code></li>
        </ul>
      </li>
    </ol>
    <p>If only one agent is found, dmux uses it automatically. If multiple agents are available, you'll be prompted to choose (unless <code>defaultAgent</code> is set in <a href="#/configuration">configuration</a>).</p>

    <h2>Default Agent</h2>
    <p>To skip the agent selection dialog, set a default agent:</p>
    <ul>
      <li><strong>TUI:</strong> Press <kbd>s</kbd> → set "Default Agent"</li>
      <li><strong>Config:</strong> Add <code>"defaultAgent": "claude"</code> to your settings JSON</li>
      <li><strong>API:</strong> <code>PATCH /api/settings</code> with <code>{"defaultAgent": "claude"}</code></li>
    </ul>

    <h2>Permission Modes</h2>
    <p>The <code>permissionMode</code> setting controls what flags dmux passes to each agent:</p>
    <table>
      <thead>
        <tr><th>permissionMode</th><th>Claude Code</th><th>Codex</th><th>opencode</th></tr>
      </thead>
      <tbody>
        <tr><td><code>''</code> (empty)</td><td>No flags</td><td>No flags</td><td>No flags</td></tr>
        <tr><td><code>plan</code></td><td><code>--permission-mode plan</code></td><td>No flags</td><td>No flags</td></tr>
        <tr><td><code>acceptEdits</code></td><td><code>--permission-mode acceptEdits</code></td><td><code>--approval-mode auto-edit</code></td><td>No flags</td></tr>
        <tr><td><code>bypassPermissions</code></td><td><code>--dangerously-skip-permissions</code></td><td><code>--dangerously-bypass-approvals-and-sandbox</code></td><td>No flags</td></tr>
      </tbody>
    </table>

    <h2>Autopilot Mode</h2>
    <p><code>enableAutopilotByDefault</code> controls whether dmux auto-selects safe options when agents prompt with choices. This is separate from <code>permissionMode</code>.</p>

    <div class="callout callout-warning">
      <div class="callout-title">Caution</div>
      <code>bypassPermissions</code> and autopilot together provide highly autonomous behavior. Use only in isolated/trusted environments.
    </div>

    <h2>Agent Status Detection</h2>
    <p>dmux monitors each agent pane to determine its current state. This is used to show status indicators in the sidebar and web dashboard.</p>
    <p>The detection works by:</p>
    <ol>
      <li><strong>Activity tracking</strong> — if the terminal content is changing, the agent is considered "working"</li>
      <li><strong>LLM analysis</strong> — when activity stops, dmux uses a lightweight LLM (grok-4-fast, free tier) to analyze the terminal content and determine if the agent is waiting for input, showing a dialog, or idle</li>
      <li><strong>User typing detection</strong> — if the user is typing, dmux avoids false positives</li>
    </ol>
    <p>Each pane has its own worker thread that polls every second without blocking the main UI.</p>
  `;
}
