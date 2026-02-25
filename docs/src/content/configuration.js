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

    <h2>OpenRouter Configuration</h2>
    <p>dmux uses <a href="https://openrouter.ai" target="_blank" rel="noopener">OpenRouter</a> for AI-powered features like smart branch naming and commit message generation.</p>

    <h3>Setting Up</h3>
    <ol>
      <li>Create an account at <a href="https://openrouter.ai" target="_blank" rel="noopener">openrouter.ai</a></li>
      <li>Generate an API key from the <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">keys page</a></li>
      <li>Set the environment variable:
        <pre><code data-lang="bash">export OPENROUTER_API_KEY="sk-or-v1-..."</code></pre>
      </li>
      <li>Add it to your shell profile for persistence:
        <pre><code data-lang="bash"># Add to ~/.zshrc or ~/.bashrc
echo 'export OPENROUTER_API_KEY="sk-or-v1-..."' >> ~/.zshrc</code></pre>
      </li>
    </ol>

    <h3>How It's Used</h3>
    <table>
      <thead>
        <tr><th>Feature</th><th>Model</th><th>Purpose</th></tr>
      </thead>
      <tbody>
        <tr><td>Slug generation</td><td>gpt-4o-mini</td><td>Convert prompts to short branch names</td></tr>
        <tr><td>Commit messages</td><td>gpt-4o-mini</td><td>Generate conventional commit messages from diffs</td></tr>
        <tr><td>Pane status</td><td>grok-4-fast (free)</td><td>Detect agent state from terminal output</td></tr>
      </tbody>
    </table>

    <h3>Without OpenRouter</h3>
    <p>If <code>OPENROUTER_API_KEY</code> is not set, dmux still works but with reduced functionality:</p>
    <ul>
      <li>Branch names fall back to <code>dmux-{timestamp}</code></li>
      <li>Commit messages fall back to <code>dmux: auto-commit changes</code></li>
      <li>Pane status detection uses heuristics instead of LLM analysis</li>
    </ul>

    <div class="callout callout-tip">
      <div class="callout-title">Tip</div>
      OpenRouter provides free credits for new accounts, and the models dmux uses (gpt-4o-mini, grok-4-fast) are very inexpensive. Even heavy usage costs only pennies per day.
    </div>


    <h2>Alibaba Cloud Coding Plan Integration</h2>
    <p>dmux supports Alibaba Cloud Coding Plan as an OpenRouter-compatible provider for AI features. This allows you to use Alibaba Cloud's Qwen models for branch naming, commit messages, and pane status detection.</p>

    <h3>Setting Up Alibaba Cloud Coding Plan</h3>
    <p>To use Alibaba Cloud Coding Plan instead of OpenRouter, configure the following environment variables:</p>
    <pre><code data-lang="bash"># Use Alibaba Cloud Coding Plan endpoint
export OPENROUTER_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"

# Your Alibaba Cloud API key
export OPENROUTER_API_KEY="sk-..."

# Optional: Specify which models to use
export DMUX_MODELS="qwen-coder-plus,qwen-max"

# Add to ~/.zshrc or ~/.bashrc for persistence
echo 'export OPENROUTER_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"' >> ~/.zshrc
echo 'export OPENROUTER_API_KEY="sk-..."' >> ~/.zshrc
echo 'export DMUX_MODELS="qwen-coder-plus,qwen-max"' >> ~/.zshrc
source ~/.zshrc</code></pre>

    <h3>Available Alibaba Cloud Models</h3>
    <p>Alibaba Cloud Coding Plan provides several Qwen models compatible with dmux:</p>
    <table>
      <thead>
        <tr><th>Model ID</th><th>Best For</th></tr>
      </thead>
      <tbody>
        <tr><td>qwen-coder-plus</td><td>Code-related tasks (branch names, commit messages)</td></tr>
        <tr><td>qwen-max</td><td>Complex reasoning and analysis</td></tr>
        <tr><td>qwen-plus</td><td>General-purpose tasks</td></tr>
        <tr><td>qwen-turbo</td><td>Fast, lightweight operations</td></tr>
      </tbody>
    </table>

    <h3>Model Configuration</h3>
    <p>Use the <code>DMUX_MODELS</code> environment variable to specify which models dmux should use:</p>
    <pre><code data-lang="bash"># Use a single model for all features
export DMUX_MODELS="qwen-coder-plus"

# Use different models (dmux will try them in order)
export DMUX_MODELS="qwen-coder-plus,qwen-max"

# Recommended configuration for best performance
export DMUX_MODELS="qwen-coder-plus"</code></pre>

    <h3>Backward Compatibility</h3>
    <p>The new environment variables are fully backward compatible:</p>
    <ul>
      <li>If <code>OPENROUTER_BASE_URL</code> is not set, dmux uses the default OpenRouter endpoint</li>
      <li>If <code>DMUX_MODELS</code> is not set, dmux uses the default models (gpt-4o-mini, grok-4-fast)</li>
      <li>Existing OpenRouter configurations continue to work without any changes</li>
      <li>You can switch between OpenRouter and Alibaba Cloud Coding Plan by changing environment variables</li>
    </ul>

    <div class="callout callout-info">
      <div class="callout-title">Note</div>
      <p>When using Alibaba Cloud Coding Plan, the <code>OPENROUTER_BASE_URL</code> must be set to the compatible-mode endpoint. The API key format is different from OpenRouter keys.</p>
    </div>

    <h2>Environment Variables</h2>
    <table>
      <thead>
        <tr><th>Variable</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr><td><code>OPENROUTER_API_KEY</code></td><td>API key for OpenRouter AI features</td></tr>
        <tr><td><code>OPENROUTER_BASE_URL</code></td><td>Custom base URL for OpenRouter API (defaults to <code>https://openrouter.ai/api/v1</code>). Use this to connect to OpenRouter-compatible services like Alibaba Cloud Coding Plan.</td></tr>
        <tr><td><code>DMUX_MODELS</code></td><td>Comma-separated list of model IDs to use for AI features. When set, overrides default model selection. Example: <code>qwen-coder-plus,qwen-max</code></td></tr>
        <tr><td><code>DMUX_SESSION</code></td><td>Override the tmux session name</td></tr>
      </tbody>
    </table>
  `;
}
