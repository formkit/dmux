export const meta = { title: 'Web Dashboard' };

export function render() {
  return `
    <h1>Web Dashboard</h1>
    <p class="lead">dmux includes a built-in web dashboard that mirrors the TUI functionality in your browser. It starts automatically when dmux runs.</p>

    <h2>Accessing the Dashboard</h2>
    <p>When dmux starts, it launches an HTTP server on an automatically selected port. The URL is displayed in the TUI:</p>
    <pre><code data-lang="bash">Dashboard: http://127.0.0.1:3847</code></pre>
    <p>Open this URL in your browser to access the dashboard.</p>

    <h2>Features</h2>
    <ul>
      <li><strong>Pane list</strong> — view all active panes with status indicators</li>
      <li><strong>Terminal streaming</strong> — real-time terminal output via Server-Sent Events (SSE)</li>
      <li><strong>Pane creation</strong> — create new panes from the browser</li>
      <li><strong>Keystroke sending</strong> — send keystrokes to panes remotely</li>
      <li><strong>Action menu</strong> — merge, close, rename, and more from the browser</li>
      <li><strong>Settings</strong> — view and edit settings</li>
    </ul>

    <h2>REST API</h2>
    <p>The dashboard is powered by a REST API that you can also use programmatically.</p>

    <h3>List Panes</h3>
    <pre><code data-lang="bash">curl http://127.0.0.1:PORT/api/panes</code></pre>

    <h3>Create a Pane</h3>
    <pre><code data-lang="bash">curl -X POST http://127.0.0.1:PORT/api/panes \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Add unit tests for the auth module",
    "agent": "claude"
  }'</code></pre>

    <h3>Stream Terminal Output</h3>
    <pre><code data-lang="bash"># SSE stream for a specific pane
curl http://127.0.0.1:PORT/api/stream/dmux-1</code></pre>

    <h3>Send Keystrokes</h3>
    <pre><code data-lang="bash"># Uses dmux IDs, not tmux pane IDs
curl -X POST http://127.0.0.1:PORT/api/keys/dmux-1 \\
  -H "Content-Type: application/json" \\
  -d '{"keys": "y\\n"}'</code></pre>

    <h3>Execute Actions</h3>
    <pre><code data-lang="bash"># List available actions
curl http://127.0.0.1:PORT/api/actions

# Execute an action on a pane
curl -X POST http://127.0.0.1:PORT/api/panes/dmux-1/actions/MERGE

# Respond to interactive prompts
curl -X POST http://127.0.0.1:PORT/api/callbacks/confirm/callback-id \\
  -H "Content-Type: application/json" \\
  -d '{"confirmed": true}'</code></pre>

    <h3>Settings</h3>
    <pre><code data-lang="bash"># Get settings
curl http://127.0.0.1:PORT/api/settings

# Update settings
curl -X PATCH http://127.0.0.1:PORT/api/settings \\
  -H "Content-Type: application/json" \\
  -d '{"defaultAgent": "claude", "scope": "global"}'</code></pre>

    <h2>Programmatic Usage</h2>
    <p>The API enables integration with CI/CD pipelines, project management tools, and custom scripts:</p>
    <pre><code data-lang="bash"># Batch create panes from a task list
while IFS= read -r task; do
  curl -s -X POST http://127.0.0.1:PORT/api/panes \\
    -H "Content-Type: application/json" \\
    -d "{\\"prompt\\": \\"$task\\", \\"agent\\": \\"claude\\"}"
done < tasks.txt</code></pre>

    <div class="callout callout-info">
      <div class="callout-title">Note</div>
      The server binds to <code>127.0.0.1</code> only, so it's only accessible from the local machine. All assets are embedded in the binary — no external CDN calls.
    </div>
  `;
}
