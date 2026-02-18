export const meta = { title: 'Getting Started' };

export function render() {
  return `
    <h1>Getting Started</h1>
    <p class="lead">Get dmux running in under a minute. All you need is tmux, Node.js, and at least one AI coding agent.</p>

    <h2>Prerequisites</h2>
    <ul>
      <li><strong>tmux</strong> 3.0 or later</li>
      <li><strong>Node.js</strong> 18 or later</li>
      <li><strong>Git</strong> 2.20 or later</li>
      <li>At least one agent CLI: <code>claude</code>, <code>opencode</code>, or <code>codex</code></li>
    </ul>

    <h3>Installing tmux</h3>
    <pre><code data-lang="bash"># macOS
brew install tmux

# Ubuntu/Debian
sudo apt install tmux

# Verify version
tmux -V</code></pre>

    <h3>Installing an Agent</h3>
    <p>dmux works with any of these AI coding agents. Install at least one:</p>
    <pre><code data-lang="bash"># Claude Code (Anthropic)
npm install -g @anthropic-ai/claude-code

# opencode
# See https://github.com/opencode-ai/opencode

# Codex (OpenAI)
npm install -g @openai/codex</code></pre>

    <h2>Install dmux</h2>
    <pre><code data-lang="bash">npm -g i dmux</code></pre>

    <h2>First Run</h2>
    <ol>
      <li>
        <p><strong>Navigate to a git repository:</strong></p>
        <pre><code data-lang="bash">cd /path/to/your/project</code></pre>
      </li>
      <li>
        <p><strong>Launch dmux:</strong></p>
        <pre><code data-lang="bash">dmux</code></pre>
        <p>dmux will create a tmux session named <code>dmux-{project-name}</code> and show the TUI.</p>
      </li>
      <li>
        <p><strong>Create your first pane:</strong> Press <kbd>n</kbd> to create a new pane. You'll be prompted for:</p>
        <ul>
          <li>A description of what you want the agent to do</li>
          <li>Which agent to use (if multiple are installed)</li>
        </ul>
      </li>
      <li>
        <p><strong>Watch the agent work:</strong> Press <kbd>j</kbd> to jump to the pane and see the agent running.</p>
      </li>
      <li>
        <p><strong>Merge when done:</strong> Navigate back to the dmux sidebar, select the pane, and press <kbd>m</kbd> to open the pane menu where you can merge the work back to your main branch.</p>
      </li>
    </ol>

    <h2>What Gets Created</h2>
    <p>When you first run dmux in a project, it creates a <code>.dmux/</code> directory:</p>
    <div class="file-tree">your-project/
├── .dmux/                  # dmux data (gitignored)
│   ├── dmux.config.json    # Pane tracking
│   ├── settings.json       # Project settings
│   └── worktrees/          # Git worktrees
│       └── fix-auth/       # One per pane
└── .dmux-hooks/            # Lifecycle hooks (optional)</div>

    <div class="callout callout-tip">
      <div class="callout-title">Tip</div>
      Add <code>.dmux/</code> to your project's <code>.gitignore</code>. dmux will suggest this on first run.
    </div>

    <h2>OpenRouter API Key (Optional)</h2>
    <p>dmux uses OpenRouter to generate smart branch names and commit messages. Without it, branch names fall back to <code>dmux-{timestamp}</code>.</p>
    <pre><code data-lang="bash">export OPENROUTER_API_KEY="sk-or-..."</code></pre>
    <p>Add this to your shell profile (<code>~/.zshrc</code> or <code>~/.bashrc</code>) to persist it. See <a href="#/configuration">Configuration</a> for details.</p>

    <h2>Next Steps</h2>
    <ul>
      <li><a href="#/core-concepts">Core Concepts</a> — understand worktrees, panes, and the merge flow</li>
      <li><a href="#/keyboard-shortcuts">Keyboard Shortcuts</a> — navigate the TUI efficiently</li>
      <li><a href="#/configuration">Configuration</a> — customize dmux settings</li>
    </ul>
  `;
}
