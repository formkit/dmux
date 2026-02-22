export const meta = { title: 'Configuration' };

export function render() {
  return `
    <h1>Configuration</h1>
    <p class="lead">dmux uses a layered configuration system with global and project-level settings. Project settings override global settings.</p>

    <h2>Configuration Files</h2>
    <table>
      <thead>
        <tr><th>File</th><th>Scope</th><th>Purpose</th></tr>
      </thead>
      <tbody>
        <tr><td><code>~/.dmux.global.json</code></td><td>Global</td><td>Default settings for all projects</td></tr>
        <tr><td><code>.dmux/settings.json</code></td><td>Project</td><td>Project-specific overrides</td></tr>
        <tr><td><code>.dmux/dmux.config.json</code></td><td>Project</td><td>Pane tracking (managed by dmux)</td></tr>
      </tbody>
    </table>

    <h2>Available Settings</h2>

    <h3><code>enableAutopilotByDefault</code></h3>
    <table>
      <tbody>
        <tr><td><strong>Type</strong></td><td><code>boolean</code></td></tr>
        <tr><td><strong>Default</strong></td><td><code>true</code></td></tr>
        <tr><td><strong>Description</strong></td><td>Automatically accept options when no risk is detected for new panes. When enabled, agents will run with less user intervention.</td></tr>
      </tbody>
    </table>

    <h3><code>permissionMode</code></h3>
    <table>
      <tbody>
        <tr><td><strong>Type</strong></td><td><code>'' | 'plan' | 'acceptEdits' | 'bypassPermissions'</code></td></tr>
        <tr><td><strong>Default</strong></td><td><code>'bypassPermissions'</code></td></tr>
        <tr><td><strong>Description</strong></td><td>Controls the permission flags dmux passes to launched agents. Use empty string to defer to each agent's own defaults.</td></tr>
      </tbody>
    </table>

    <h3><code>defaultAgent</code></h3>
    <table>
      <tbody>
        <tr><td><strong>Type</strong></td><td><code>'claude' | 'opencode' | 'codex' | ''</code></td></tr>
        <tr><td><strong>Default</strong></td><td><code>''</code> (ask each time)</td></tr>
        <tr><td><strong>Description</strong></td><td>Skip the agent selection dialog and always use this agent for new panes. Set to an empty string to be prompted each time.</td></tr>
      </tbody>
    </table>

    <h3><code>useTmuxHooks</code></h3>
    <table>
      <tbody>
        <tr><td><strong>Type</strong></td><td><code>boolean</code></td></tr>
        <tr><td><strong>Default</strong></td><td><code>false</code></td></tr>
        <tr><td><strong>Description</strong></td><td>Use tmux hooks for event-driven pane updates instead of polling. Lower CPU usage but requires tmux hook support.</td></tr>
      </tbody>
    </table>

    <h3><code>baseBranch</code></h3>
    <table>
      <tbody>
        <tr><td><strong>Type</strong></td><td><code>string</code></td></tr>
        <tr><td><strong>Default</strong></td><td><code>''</code> (current HEAD)</td></tr>
        <tr><td><strong>Description</strong></td><td>Branch to create new worktrees from. Leave empty to use the current HEAD. The branch must exist in the repository.</td></tr>
      </tbody>
    </table>

    <h3><code>branchPrefix</code></h3>
    <table>
      <tbody>
        <tr><td><strong>Type</strong></td><td><code>string</code></td></tr>
        <tr><td><strong>Default</strong></td><td><code>''</code> (no prefix)</td></tr>
        <tr><td><strong>Description</strong></td><td>Prefix for new branch names. For example, setting this to <code>feat/</code> will create branches like <code>feat/fix-auth</code>. The worktree directory name stays flat (just the slug).</td></tr>
      </tbody>
    </table>

    <h2>Accessing Settings</h2>

    <h3>TUI</h3>
    <p>Press <kbd>s</kbd> to open the settings dialog. You can switch between global and project scope, and toggle each setting.</p>

    <h3>Manual Editing</h3>
    <p>You can edit the JSON files directly:</p>
    <pre><code data-lang="json">{
  "enableAutopilotByDefault": true,
  "permissionMode": "bypassPermissions",
  "defaultAgent": "claude",
  "useTmuxHooks": false,
  "baseBranch": "develop",
  "branchPrefix": "feat/"
}</code></pre>

    <h2>Setting Precedence</h2>
    <p>When both global and project settings define the same key, the <strong>project setting wins</strong>:</p>
    <ol>
      <li>Project settings (<code>.dmux/settings.json</code>) — highest priority</li>
      <li>Global settings (<code>~/.dmux.global.json</code>) — fallback</li>
      <li>Built-in defaults — if neither file defines the setting</li>
    </ol>

    <h2>AI Features</h2>
    <p>dmux uses your installed AI agents (Claude Code, OpenCode, or Codex) for smart features like branch naming, commit message generation, pane status detection, and PR descriptions. No external API keys required &mdash; dmux calls the same agents already running in your panes.</p>

    <table>
      <thead>
        <tr><th>Feature</th><th>How It Works</th></tr>
      </thead>
      <tbody>
        <tr><td>Slug generation</td><td>Asks your agent to convert prompts into short branch names</td></tr>
        <tr><td>Commit messages</td><td>Generates conventional commit messages from git diffs</td></tr>
        <tr><td>Pane status</td><td>Detects agent state (working, idle, waiting) from terminal output</td></tr>
        <tr><td>PR descriptions</td><td>Generates PR title and body from your prompt and diff</td></tr>
        <tr><td>Conflict resolution</td><td>AI-powered merge conflict resolution</td></tr>
      </tbody>
    </table>

    <p>If no agent is available, these features gracefully degrade (e.g., branch names fall back to <code>dmux-{timestamp}</code>).</p>

    <h2>GitHub CLI Integration</h2>
    <p>dmux can create GitHub Pull Requests directly from panes. Install the <a href="https://cli.github.com/" target="_blank" rel="noopener">GitHub CLI</a> (<code>gh</code>) to enable this:</p>
    <pre><code data-lang="bash">brew install gh
gh auth login</code></pre>
    <p>When <code>gh</code> is available, pressing <kbd>m</kbd> on a pane offers "Open PR" alongside "Merge locally". You can also press <kbd>Shift+P</kbd> to open a PR directly.</p>

    <h2>Environment Variables</h2>
    <table>
      <thead>
        <tr><th>Variable</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr><td><code>DMUX_SESSION</code></td><td>Override the tmux session name</td></tr>
      </tbody>
    </table>
  `;
}
