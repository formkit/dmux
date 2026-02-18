export const meta = { title: 'Troubleshooting' };

export function render() {
  return `
    <h1>Troubleshooting</h1>
    <p class="lead">Common issues and how to resolve them.</p>

    <h2>Agent Not Found</h2>
    <p><strong>Symptom:</strong> dmux shows no agents available or fails to create panes.</p>
    <p><strong>Solution:</strong> Ensure at least one agent CLI is installed and in your PATH:</p>
    <pre><code data-lang="bash"># Check if agents are available
which claude
which opencode
which codex

# If not found, install one:
npm install -g @anthropic-ai/claude-code</code></pre>
    <p>dmux searches your shell's PATH and common installation directories like <code>/usr/local/bin</code>, <code>/opt/homebrew/bin</code>, and <code>~/.local/bin</code>.</p>

    <h2>OpenRouter API Errors</h2>
    <p><strong>Symptom:</strong> Branch names fall back to <code>dmux-{timestamp}</code>, commit messages are generic.</p>
    <p><strong>Solution:</strong></p>
    <ol>
      <li>Check your API key is set:
        <pre><code data-lang="bash">echo $OPENROUTER_API_KEY</code></pre>
      </li>
      <li>Test the API directly:
        <pre><code data-lang="bash">curl https://openrouter.ai/api/v1/models \\
  -H "Authorization: Bearer $OPENROUTER_API_KEY"</code></pre>
      </li>
      <li>Ensure the key is in your shell profile, not just the current session</li>
    </ol>

    <div class="callout callout-info">
      <div class="callout-title">Note</div>
      dmux works fine without OpenRouter — it just uses fallback values for branch names and commit messages. This is safe to ignore if you don't need AI-generated names.
    </div>

    <h2>Panes Not Appearing</h2>
    <p><strong>Symptom:</strong> You create a pane but it doesn't show up in the sidebar or tmux.</p>
    <p><strong>Possible causes:</strong></p>
    <ul>
      <li><strong>tmux version too old</strong> — dmux requires tmux 3.0+. Check with <code>tmux -V</code></li>
      <li><strong>Git version too old</strong> — worktrees require git 2.20+. Check with <code>git --version</code></li>
      <li><strong>Permission issues</strong> — the <code>.dmux/</code> directory needs write permissions</li>
      <li><strong>Stale config</strong> — check <code>.dmux/dmux.config.json</code> for orphaned pane entries</li>
    </ul>

    <h2>Screen Artifacts</h2>
    <p><strong>Symptom:</strong> The TUI displays garbled text or misaligned elements.</p>
    <p><strong>Solution:</strong></p>
    <ul>
      <li>Press <kbd>Ctrl+L</kbd> to redraw the screen</li>
      <li>Run <code>tmux refresh-client</code> from another pane</li>
      <li>Resize the terminal window to trigger a re-render</li>
    </ul>

    <h2>Merge Conflicts</h2>
    <p><strong>Symptom:</strong> Merge fails with "conflicts detected" error.</p>
    <p><strong>Solution:</strong></p>
    <ol>
      <li>Jump to the pane (<kbd>j</kbd>)</li>
      <li>Resolve conflicts manually in the worktree files</li>
      <li>Return to the dmux sidebar and retry the merge</li>
    </ol>
    <p>See <a href="#/merging">Merging</a> for a detailed explanation of the merge process.</p>

    <h2>Worktree Errors</h2>
    <p><strong>Symptom:</strong> "fatal: worktree already exists" or similar git errors.</p>
    <p><strong>Solution:</strong></p>
    <pre><code data-lang="bash"># List all worktrees
git worktree list

# Remove a stale worktree
git worktree remove .dmux/worktrees/slug-name --force

# Prune orphaned worktree references
git worktree prune</code></pre>

    <h2>Debug Commands</h2>
    <p>Useful commands for diagnosing issues:</p>
    <pre><code data-lang="bash"># Check tmux sessions
tmux list-sessions

# View dmux config
cat .dmux/dmux.config.json

# Check running processes
ps aux | grep dmux

# View dmux logs
# Press 'l' in the TUI to view application logs

# List all worktrees
git worktree list

# Check worktree status
git -C .dmux/worktrees/slug-name status</code></pre>

    <h2>Performance Issues</h2>
    <p><strong>Symptom:</strong> TUI feels sluggish or unresponsive.</p>
    <p><strong>Possible causes:</strong></p>
    <ul>
      <li><strong>Many active panes</strong> — each pane has a worker thread polling every second. Consider closing panes you're not using.</li>
      <li><strong>Polling vs hooks</strong> — enable <code>useTmuxHooks</code> in <a href="#/configuration">settings</a> for lower CPU usage.</li>
      <li><strong>Background operations</strong> — dmux pauses background operations during input dialogs to prevent lag.</li>
    </ul>

    <h2>Getting Help</h2>
    <p>If you encounter an issue not covered here:</p>
    <ul>
      <li>Check the <a href="https://github.com/formkit/dmux/issues" target="_blank" rel="noopener">GitHub Issues</a> for known problems</li>
      <li>Open a new issue with your tmux version, Node.js version, and the output of the debug commands above</li>
    </ul>
  `;
}
