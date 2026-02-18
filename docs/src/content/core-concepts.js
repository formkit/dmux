export const meta = { title: 'Core Concepts' };

export function render() {
  return `
    <h1>Core Concepts</h1>
    <p class="lead">dmux is built around three core concepts: projects, panes, and worktrees. Understanding how they interact will help you get the most out of parallel development.</p>

    <h2>Projects</h2>
    <p>A <strong>project</strong> in dmux corresponds to a git repository. When you run <code>dmux</code> inside a repo, it creates a tmux session named <code>dmux-{project-name}</code> where the project name is derived from the directory name.</p>
    <ul>
      <li>Each project gets its own isolated tmux session</li>
      <li>Session state is stored in <code>.dmux/dmux.config.json</code></li>
      <li>Multiple projects can be attached to one session via <a href="#/multi-project">multi-project</a> support</li>
    </ul>

    <h2>Panes</h2>
    <p>A <strong>pane</strong> is a tmux pane running an AI agent in an isolated environment. Each pane has:</p>
    <ul>
      <li>A unique ID (e.g. <code>dmux-1</code>, <code>dmux-2</code>)</li>
      <li>A slug derived from your prompt (e.g. <code>fix-auth</code>)</li>
      <li>Its own git worktree and branch</li>
      <li>An agent (Claude Code, opencode, or Codex) running with your prompt</li>
    </ul>

    <h3>Pane Lifecycle</h3>
    <ol>
      <li><strong>Create</strong> — press <kbd>n</kbd>, enter a prompt, select an agent</li>
      <li><strong>Work</strong> — the agent runs in its isolated worktree</li>
      <li><strong>Monitor</strong> — dmux tracks agent status (working, waiting for input, idle)</li>
      <li><strong>Merge</strong> — bring changes back to main with auto-commit</li>
      <li><strong>Cleanup</strong> — worktree and branch are removed after merge</li>
    </ol>

    <h3>Pane Status Detection</h3>
    <p>dmux monitors each pane to detect the agent's state:</p>
    <table>
      <thead>
        <tr><th>Status</th><th>Meaning</th></tr>
      </thead>
      <tbody>
        <tr><td><code>in_progress</code></td><td>Agent is actively working</td></tr>
        <tr><td><code>open_prompt</code></td><td>Agent is waiting for user input</td></tr>
        <tr><td><code>option_dialog</code></td><td>Agent is showing a dialog/options</td></tr>
      </tbody>
    </table>

    <h2>Git Worktrees</h2>
    <p>Each pane operates in a <a href="https://git-scm.com/docs/git-worktree" target="_blank" rel="noopener">git worktree</a> — a separate working copy of your repository with its own branch. This means:</p>
    <ul>
      <li>Multiple agents can work simultaneously without conflicts</li>
      <li>Each agent has a clean, independent copy of the codebase</li>
      <li>No need to stash or commit before switching contexts</li>
      <li>Worktrees share the same <code>.git</code> directory, so they're space-efficient</li>
    </ul>

    <div class="file-tree">your-project/              # Main repository
├── .git/                  # Shared git directory
├── src/
└── .dmux/worktrees/
    ├── fix-auth/          # Worktree: branch "fix-auth"
    │   ├── .git           # Points to main .git
    │   └── src/           # Independent working copy
    └── add-tests/         # Worktree: branch "add-tests"
        ├── .git
        └── src/</div>

    <h2>The Merge Flow</h2>
    <p>When you merge a pane (press <kbd>m</kbd> to open the menu, then select merge), dmux performs a two-phase merge:</p>
    <ol>
      <li><strong>Auto-commit</strong> — any uncommitted changes in the worktree are committed with an AI-generated message</li>
      <li><strong>Merge main → worktree</strong> — the latest changes from main are merged into the worktree branch (to resolve conflicts in the worktree, not on main)</li>
      <li><strong>Merge worktree → main</strong> — the worktree branch is merged back into main</li>
      <li><strong>Cleanup</strong> — the worktree and branch are removed</li>
    </ol>

    <div class="callout callout-info">
      <div class="callout-title">Note</div>
      If there are merge conflicts in step 2, dmux will abort the merge and let you know which files conflict. You can resolve them manually in the worktree and retry.
    </div>

    <h2>The Sidebar</h2>
    <p>The dmux TUI shows a sidebar with all active panes. Each pane displays:</p>
    <ul>
      <li>The pane slug (branch name)</li>
      <li>A status indicator (working, idle, waiting)</li>
      <li>The original prompt</li>
    </ul>
    <p>You can optionally use a sidebar layout mode (press <kbd>L</kbd>) where the dmux sidebar occupies a fixed 40-column pane on the left, with agent panes arranged in a grid to the right.</p>

    <h2>Next Steps</h2>
    <ul>
      <li><a href="#/keyboard-shortcuts">Keyboard Shortcuts</a> — all TUI controls</li>
      <li><a href="#/merging">Merging</a> — detailed merge workflow</li>
      <li><a href="#/multi-project">Multi-Project</a> — working with multiple repos</li>
    </ul>
  `;
}
