export const meta = { title: 'Multi-Project' };

export function render() {
  return `
    <h1>Multi-Project</h1>
    <p class="lead">dmux supports attaching multiple git repositories to a single tmux session, letting you manage panes across different projects side by side.</p>

    <h2>Attaching a Project</h2>
    <p>Press <kbd>p</kbd> in the dmux TUI to create a pane in a different project. dmux will prompt you to select a project directory. The new project is attached to the current session and appears as a separate group in the sidebar.</p>

    <div class="callout callout-info">
      <div class="callout-title">How it works</div>
      Each attached project gets its own <code>.dmux/</code> directory and worktree space. The tmux session is shared, but pane tracking is per-project.
    </div>

    <h2>Project Navigation</h2>
    <p>When multiple projects are attached:</p>
    <ul>
      <li>Use <kbd>←</kbd> <kbd>→</kbd> to switch between project groups in the sidebar</li>
      <li>Use <kbd>↑</kbd> <kbd>↓</kbd> to navigate panes within a project</li>
      <li>Each project's panes are visually grouped and labeled</li>
    </ul>

    <h2>Pane Grouping</h2>
    <p>The sidebar organizes panes by project. Each group shows:</p>
    <ul>
      <li>The project name (derived from the directory)</li>
      <li>The number of active panes</li>
      <li>Individual pane status indicators</li>
    </ul>

    <h2>Sub-Worktree Discovery</h2>
    <p>dmux automatically discovers when a worktree is nested inside another project's directory. This is useful for monorepo setups where you might have:</p>
    <div class="file-tree">monorepo/
├── .dmux/worktrees/
│   └── feat-api/           # Worktree for the monorepo
│       └── packages/
│           └── api/
└── packages/
    └── api/
        └── .dmux/worktrees/
            └── fix-endpoint/  # Worktree for the api package</div>

    <p>dmux tracks these relationships so it can merge in the correct order.</p>

    <h2>Multi-Merge Orchestration</h2>
    <p>When merging across multiple projects with nested worktrees, dmux merges <strong>deepest first</strong>. This ensures that:</p>
    <ol>
      <li>Child project changes are merged before parent project changes</li>
      <li>The parent worktree sees the child's merged state when it merges</li>
      <li>No conflicts arise from stale sub-project references</li>
    </ol>

    <h2>Creating Panes in Other Projects</h2>
    <p>There are two ways to create panes in attached projects:</p>
    <table>
      <thead>
        <tr><th>Method</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr><td><kbd>p</kbd></td><td>Interactive project selection then prompt input</td></tr>
        <tr><td>API</td><td><code>POST /api/panes</code> with <code>project</code> field specifying the target</td></tr>
      </tbody>
    </table>

    <h2>Session Layout</h2>
    <p>All projects share the same tmux session. When using sidebar layout mode (<kbd>L</kbd>), panes from all projects are arranged in the grid. The sidebar clearly labels which project each pane belongs to.</p>

    <div class="callout callout-tip">
      <div class="callout-title">Tip</div>
      Multi-project is especially useful for full-stack development — attach your frontend and backend repos to the same session and run agents on both simultaneously.
    </div>
  `;
}
