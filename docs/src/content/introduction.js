export const meta = { title: 'Introduction' };

export function render() {
  return `
    <h1>What is dmux?</h1>
    <p class="lead">dmux is a tool for running multiple coding agents (Claude Code, Codex, or OpenCode) in parallel using tmux and git worktrees. It provides hooks to automate every portion of the worktree lifecycle, supports multiple projects in the same session, as well as multiple worktrees under the root directory. If you provide an OpenRouter key, it will write your commit messages for you, name your window panes, and auto-advance annoying babysitting tasks.</p>
  `;
}
