export const meta = { title: 'Agents' };

export function render() {
  return `
    <h1>Agents</h1>
    <p class="lead">dmux supports three AI coding agents. Each agent is automatically detected if its CLI is installed and available in your PATH.</p>

    <h2>Supported Agents</h2>

    <h3>Claude Code</h3>
    <p><a href="https://docs.anthropic.com/en/docs/claude-code" target="_blank" rel="noopener">Claude Code</a> is Anthropic's agentic coding tool. dmux launches it with:</p>
    <pre><code data-lang="bash">claude --permission-mode acceptEdits</code></pre>
    <p>You can configure the permission level in <a href="#/configuration">settings</a>, including using Claude's true default (ask for all permissions).</p>

    <h3>opencode</h3>
    <p><a href="https://github.com/opencode-ai/opencode" target="_blank" rel="noopener">opencode</a> is an open-source coding agent. dmux launches it directly with your prompt. opencode has no permission flags.</p>

    <h3>Codex</h3>
    <p><a href="https://github.com/openai/codex" target="_blank" rel="noopener">Codex</a> is OpenAI's coding agent. dmux launches it with:</p>
    <pre><code data-lang="bash">codex --approval-mode auto-edit</code></pre>
    <p>You can configure the permission level in <a href="#/configuration">settings</a>.</p>

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

    <h2>Permission Mode</h2>
    <p>The <code>permissionMode</code> setting controls what permissions agents are granted when launched. Configure it via TUI (<kbd>s</kbd>), settings JSON, or the API.</p>
    <table>
      <thead>
        <tr><th>Setting</th><th>Claude Code Flag</th><th>Codex Flag</th></tr>
      </thead>
      <tbody>
        <tr><td>Agent default (ask for permissions)</td><td><em>(no flags)</em></td><td><em>(no flags)</em></td></tr>
        <tr><td>Accept edits automatically</td><td><code>--permission-mode acceptEdits</code></td><td><code>--approval-mode auto-edit</code></td></tr>
        <tr><td>Plan mode (Claude only)</td><td><code>--permission-mode plan</code></td><td><em>(no flags)</em></td></tr>
        <tr><td>Bypass all permissions</td><td><code>--dangerously-skip-permissions</code></td><td><code>--dangerously-bypass-approvals-and-sandbox</code></td></tr>
      </tbody>
    </table>
    <p>opencode has no permission flags — all modes map to no flags. The dmux default is "Accept edits automatically" — set to "Agent default" if you want agents to ask before every action.</p>

    <div class="callout callout-warning">
      <div class="callout-title">Caution</div>
      "Bypass all permissions" gives agents broad permissions to modify files and run commands without confirmation. Use it only in isolated environments where you trust the agent's actions.
    </div>

    <h2>Autopilot Mode</h2>
    <p>When <code>enableAutopilotByDefault</code> is enabled in <a href="#/configuration">settings</a>, dmux automatically accepts agent options when no risk is detected. This is independent of the permission mode — autopilot controls dmux's behavior in response to agent prompts, while permission mode controls what the agent can do without asking.</p>

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
