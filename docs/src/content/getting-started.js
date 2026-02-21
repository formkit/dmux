export const meta = { title: 'Getting Started' };

export function render() {
  return `
    <h1>Getting Started</h1>
    <p>Get dmux running in under a minute. All you need is tmux, Node.js, and at least one AI coding agent.</p>

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

    <a href="https://discord.gg/VGBx9dBYqy" target="_blank" rel="noopener" class="discord-cta">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
      <span>Join the Discord</span>
    </a>
  `;
}
