export const meta = { title: 'Agents' };

export function render() {
  return `
    <h1>Agents</h1>
    <p class="lead">dmux supports three AI coding agents. Each agent is automatically detected if its CLI is installed and available in your PATH.</p>

    <h2>Supported Agents</h2>

    <h3>Claude Code</h3>
    <p><a href="https://docs.anthropic.com/en/docs/claude-code" target="_blank" rel="noopener">Claude Code</a> is Anthropic's agentic coding tool. dmux always launches it with:</p>
    <pre><code data-lang="bash">claude --dangerously-skip-permissions</code></pre>

    <h3>opencode</h3>
    <p><a href="https://github.com/opencode-ai/opencode" target="_blank" rel="noopener">opencode</a> is an open-source coding agent. dmux launches it directly with your prompt.</p>

    <h3>Codex</h3>
    <p><a href="https://github.com/openai/codex" target="_blank" rel="noopener">Codex</a> is OpenAI's coding agent. dmux always launches it with:</p>
    <pre><code data-lang="bash">codex --dangerously-bypass-approvals-and-sandbox</code></pre>

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
    </ul>

    <h2>Autopilot Mode</h2>
    <p>When <code>enableAutopilotByDefault</code> is enabled in <a href="#/configuration">settings</a>, dmux will automatically accept agent option dialogs when no risk is detected. This reduces the need for manual intervention while agents work.</p>

    <div class="callout callout-warning">
      <div class="callout-title">Note</div>
      All agents are always launched with full permissions (<code>--dangerously-skip-permissions</code> for Claude, <code>--dangerously-bypass-approvals-and-sandbox</code> for Codex). The autopilot setting controls whether dmux automatically responds to agent option dialogs, not the permission level.
    </div>

    <h2>Agent Status Detection</h2>
    <p>dmux monitors each agent pane to determine its current state. This is used to show status indicators in the sidebar.</p>
    <p>The detection works by:</p>
    <ol>
      <li><strong>Activity tracking</strong> — if the terminal content is changing, the agent is considered "working"</li>
      <li><strong>LLM analysis</strong> — when activity stops, dmux uses a lightweight LLM (grok-4-fast, free tier) to analyze the terminal content and determine if the agent is waiting for input, showing a dialog, or idle</li>
      <li><strong>User typing detection</strong> — if the user is typing, dmux avoids false positives</li>
    </ol>
    <p>Each pane has its own worker thread that polls every second without blocking the main UI.</p>
  `;
}
