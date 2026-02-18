export const meta = { title: 'Getting Started' };

export function render() {
  return `
    <h1>Getting Started</h1>
    <p class="lead">Get dmux running in under a minute. All you need is tmux, Node.js, and at least one AI coding agent.</p>

    <h2>Install dmux</h2>
    <pre><code data-lang="bash">npm -g i dmux</code></pre>

    <h2>Set Up OpenRouter (Recommended)</h2>
    <p>Before your first run, we recommend setting up an <a href="https://openrouter.ai" target="_blank" rel="noopener">OpenRouter</a> API key. dmux uses it to generate smart branch names from your prompts and AI-powered commit messages when merging. Without it, branch names fall back to <code>dmux-{timestamp}</code> and commit messages will be generic.</p>
    <pre><code data-lang="bash">export OPENROUTER_API_KEY="sk-or-..."</code></pre>
    <p>Add this to your shell profile (<code>~/.zshrc</code> or <code>~/.bashrc</code>) so it persists across sessions. See <a href="#configuration">Configuration</a> for model options and details.</p>

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

    <h2>tmux Configuration</h2>
    <p>On first run, dmux will detect if you have no tmux config and offer to install a recommended preset (dark or light theme). This handles pane borders, navigation bindings, mouse support, and clipboard integration automatically.</p>
    <p>If you'd rather configure tmux manually, edit <code>~/.tmux.conf</code> (or <code>~/.config/tmux/tmux.conf</code>). Here's a solid starting point:</p>
    <pre><code data-lang="bash"># Extended keys for Ctrl-Shift-Arrow support
set -g extended-keys on

# Active/inactive pane dimming — makes it obvious which pane has focus
set -g window-style 'fg=colour247,bg=colour236'
set -g window-active-style 'fg=default,bg=colour234'

# Pane borders with labels showing pane number and current command
set -g pane-border-style "fg=colour238 bg=default"
set -g pane-active-border-style "fg=blue bg=default"
set -g pane-border-format ' #[bold]#P #[default]#{?pane_title,#{pane_title},#{pane_current_command}} '
set -g pane-border-status top

# Status bar
set -g status-style 'bg=colour236'

# Fast pane navigation with Ctrl+Shift+Arrow
bind -n C-S-Left select-pane -L
bind -n C-S-Right select-pane -R
bind -n C-S-Up select-pane -U
bind -n C-S-Down select-pane -D

# Mouse support — click panes, resize, scroll
set -g mouse on

# Clipboard and terminal passthrough
set -g set-clipboard on
set -g allow-passthrough all

# Copy mouse selection to system clipboard (macOS)
bind-key -T copy-mode MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "pbcopy"
bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "pbcopy"

# Terminal overrides for image/cursor passthrough
set -ga terminal-overrides ',xterm-256color:Ms=\\E]52;c;%p2%s\\007'
set -ga terminal-overrides ',*:Ss=\\E[%p1%d q:Se=\\E[2 q'
set -ga update-environment "TERM_PROGRAM"</code></pre>
    <p>After editing, reload with <code>tmux source-file ~/.tmux.conf</code> or restart tmux.</p>

    <div class="callout callout-info">
      <div class="callout-title">Note</div>
      On Linux, swap <code>pbcopy</code> for <code>wl-copy</code> (Wayland) or <code>xclip -selection clipboard -in</code> (X11) in the clipboard bindings.
    </div>

    <h2>Next Steps</h2>
    <ul>
      <li><a href="#/core-concepts">Core Concepts</a> — understand worktrees, panes, and the merge flow</li>
      <li><a href="#/keyboard-shortcuts">Keyboard Shortcuts</a> — navigate the TUI efficiently</li>
      <li><a href="#/configuration">Configuration</a> — customize dmux settings</li>
    </ul>
  `;
}
