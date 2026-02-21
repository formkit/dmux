export const meta = { title: 'Merging' };

export function render() {
  return `
    <h1>Merging</h1>
    <p class="lead">dmux handles the entire merge lifecycle — from auto-committing changes to merging branches and cleaning up worktrees.</p>

    <h2>The Two-Phase Merge</h2>
    <p>When you merge a pane, dmux performs a safe two-phase merge to minimize the chance of conflicts landing on your main branch:</p>

    <h3>Phase 1: Merge Main → Worktree</h3>
    <p>First, dmux merges the latest changes from your main branch <em>into</em> the worktree branch. This ensures any conflicts are resolved in the isolated worktree — not on main.</p>
    <ul>
      <li>If there are no conflicts, dmux proceeds to Phase 2</li>
      <li>If there are conflicts, the merge is <strong>aborted</strong> and dmux reports the conflicting files</li>
    </ul>

    <h3>Phase 2: Merge Worktree → Main</h3>
    <p>After Phase 1 succeeds (all conflicts resolved), dmux merges the worktree branch back into main. Since conflicts were already resolved, this should be a clean merge.</p>

    <h2>Auto-Commit</h2>
    <p>Before merging, dmux checks for uncommitted changes in the worktree. If there are any, it:</p>
    <ol>
      <li>Stages all changes</li>
      <li>Generates a commit message using your installed AI agent</li>
      <li>Creates the commit automatically</li>
    </ol>
    <p>The AI analyzes the git diff and generates a conventional commit message like <code>feat: add user authentication flow</code> or <code>fix: resolve null pointer in search handler</code>.</p>

    <div class="callout callout-info">
      <div class="callout-title">Note</div>
      If no agent is available, dmux will use a generic commit message like "dmux: auto-commit changes".
    </div>

    <h2>Handling Merge Conflicts</h2>
    <p>When conflicts are detected during Phase 1:</p>
    <ol>
      <li>dmux aborts the merge to keep the worktree clean</li>
      <li>The conflicting files are listed in the TUI</li>
      <li>dmux offers to <strong>resolve using AI</strong> — this sends the conflicting files to your agent to automatically resolve the conflicts for you</li>
      <li>Alternatively, you can jump to the pane (<kbd>j</kbd>) and resolve conflicts manually</li>
      <li>After resolving, retry the merge from the pane menu</li>
    </ol>

    <h2>Cleanup After Merge</h2>
    <p>After a successful merge, dmux:</p>
    <ul>
      <li>Removes the git worktree</li>
      <li>Deletes the branch (using <code>git branch -d</code> for safety)</li>
      <li>Removes the pane from tracking</li>
      <li>Optionally closes the tmux pane</li>
    </ul>

    <h2>Merge Hooks</h2>
    <p>dmux fires lifecycle hooks during the merge process. See <a href="#/hooks">Hooks</a> for details:</p>
    <ul>
      <li><code>pre_merge</code> — runs before the merge begins</li>
      <li><code>post_merge</code> — runs after a successful merge</li>
      <li><code>before_worktree_remove</code> — runs before the worktree is deleted</li>
      <li><code>worktree_removed</code> — runs after the worktree is deleted</li>
    </ul>

    <h2>Multi-Project Merging</h2>
    <p>When working with <a href="#/multi-project">multiple projects</a> that have nested worktrees, dmux merges in the correct order — deepest worktrees first — to avoid conflicts between parent and child projects.</p>

    <div class="callout callout-info">
      <div class="callout-title">A note on merge strategy</div>
      Lots of people have lots of opinions on how git merges should be done. For now dmux simply performs a <code>git merge</code>. If you want or need additional options like rebase, squash, or custom strategies — <a href="https://github.com/formkit/dmux" target="_blank" rel="noopener">PRs are open</a>.
    </div>
  `;
}
