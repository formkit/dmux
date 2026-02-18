export const meta = { title: 'Multi-Agent' };

export function render() {
  return `
    <h1>Multi-Agent</h1>
    <p class="lead">Run two different agents on the same task side-by-side. Compare approaches, pick the best result, and merge the winner.</p>

    <h2>A/B Agent Pairs</h2>
    <p>When you create a new pane, dmux offers <strong>A/B pair options</strong> alongside the standard single-agent choices. Selecting a pair launches two panes — one per agent — both receiving the same prompt in separate worktrees.</p>
    <p>For example, with Claude Code and opencode installed, you'll see:</p>
    <pre><code data-lang="bash">1. Claude Code
2. OpenCode
3. A/B: Claude Code + OpenCode</code></pre>
    <p>All available two-agent combinations are generated automatically based on which agents are installed.</p>

    <h2>How It Works</h2>
    <ol>
      <li>Press <kbd>n</kbd> and enter your prompt</li>
      <li>Select an A/B pair from the agent list</li>
      <li>dmux generates a shared base slug from your prompt (e.g. <code>fix-auth</code>)</li>
      <li>Two panes are created with agent-specific suffixes:
        <ul>
          <li><code>fix-auth-claude-code</code> &mdash; running Claude Code</li>
          <li><code>fix-auth-opencode</code> &mdash; running opencode</li>
        </ul>
      </li>
      <li>Each pane gets its own git worktree and branch, both receiving the same prompt</li>
    </ol>

    <h2>Slug Suffixes</h2>
    <p>When creating a pair, dmux appends the agent name to the shared slug:</p>
    <table>
      <thead>
        <tr><th>Agent</th><th>Suffix</th></tr>
      </thead>
      <tbody>
        <tr><td>Claude Code</td><td><code>-claude-code</code></td></tr>
        <tr><td>opencode</td><td><code>-opencode</code></td></tr>
        <tr><td>Codex</td><td><code>-codex</code></td></tr>
      </tbody>
    </table>

    <h2>Comparing Results</h2>
    <p>Once both agents finish, you can:</p>
    <ul>
      <li>Jump between panes with <kbd>j</kbd> to review each agent's work</li>
      <li>Merge the better result with <kbd>m</kbd></li>
      <li>Close the other pane with <kbd>x</kbd> to discard it</li>
    </ul>
    <p>Since each agent works in an independent worktree, there are no conflicts between them. You pick the winner and merge it to your main branch like any other pane.</p>

    <div class="callout callout-tip">
      <div class="callout-title">Tip</div>
      A/B pairs are great for complex tasks where different agents may take very different approaches. Try it on refactoring, architecture decisions, or tricky bug fixes.
    </div>
  `;
}
