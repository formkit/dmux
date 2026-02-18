export const meta = { title: 'Introduction' };

export function render() {
  return `
    <h1>What is dmux?</h1>
    <p class="lead">dmux is a tmux pane manager that creates AI-powered development sessions. It integrates tmux, git worktrees, and AI coding agents to enable parallel development workflows.</p>

    <h2>The Problem</h2>
    <p>Modern AI coding agents like Claude Code, opencode, and Codex are powerful — but they work best on isolated tasks. Running multiple agents on the same codebase means branch conflicts, context switching, and manual coordination.</p>

    <h2>The Solution</h2>
    <p>dmux gives each agent its own isolated environment:</p>
    <ul>
      <li><strong>Separate git worktrees</strong> — each agent works on its own branch with a full copy of the code</li>
      <li><strong>Dedicated tmux panes</strong> — visual separation and easy navigation between agents</li>
      <li><strong>Automatic branch management</strong> — AI-generated branch names from your prompts</li>
      <li><strong>One-command merging</strong> — auto-commit, merge to main, and cleanup</li>
    </ul>

    <h2>How It Works</h2>
    <p>When you create a new pane in dmux:</p>
    <ol>
      <li>An AI generates a short branch name from your prompt (e.g. "fix auth bug" → <code>fix-auth</code>)</li>
      <li>A new git worktree is created with its own branch</li>
      <li>A tmux pane opens in the worktree directory</li>
      <li>Your chosen agent launches with your prompt pre-loaded</li>
    </ol>
    <p>You can jump between panes, monitor progress, and merge completed work — all from the dmux TUI or the <a href="#/web-dashboard">web dashboard</a>.</p>

    <h2>Features at a Glance</h2>
    <table>
      <thead>
        <tr><th>Feature</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr><td>Parallel agents</td><td>Run multiple AI agents simultaneously in isolated environments</td></tr>
        <tr><td>Git worktrees</td><td>Each pane gets its own branch and working copy</td></tr>
        <tr><td>Smart merging</td><td>AI-generated commit messages, automatic merge-to-main</td></tr>
        <tr><td>Multi-project</td><td>Attach multiple repos to one tmux session</td></tr>
        <tr><td>Hooks</td><td>11 lifecycle hooks for custom automation</td></tr>
        <tr><td>Web dashboard</td><td>Browser-based UI with terminal streaming</td></tr>
        <tr><td>Agent support</td><td>Claude Code, opencode, and Codex</td></tr>
      </tbody>
    </table>

    <h2>Quick Start</h2>
    <p>If you're ready to jump in, run dmux in an existing project with a repository:</p>
    <pre><code data-lang="bash">dmux</code></pre>
    <p>Or head to <a href="#/getting-started">Getting Started</a> for a full walkthrough.</p>
  `;
}
