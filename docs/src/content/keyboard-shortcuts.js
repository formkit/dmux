export const meta = { title: 'Keyboard Shortcuts' };

export function render() {
  return `
    <h1>Keyboard Shortcuts</h1>
    <p class="lead">dmux is designed for keyboard-first navigation. All major actions are available through single-key shortcuts.</p>

    <h2>Pane Management</h2>
    <table class="shortcut-table">
      <thead>
        <tr><th>Key</th><th>Action</th></tr>
      </thead>
      <tbody>
        <tr><td><kbd>n</kbd></td><td>Create a new pane in the main project</td></tr>
        <tr><td><kbd>t</kbd></td><td>Create a terminal pane (no agent, just a shell in a worktree)</td></tr>
        <tr><td><kbd>p</kbd></td><td>Create a pane in another attached project</td></tr>
        <tr><td><kbd>j</kbd></td><td>Jump to the selected pane (switch tmux focus)</td></tr>
        <tr><td><kbd>m</kbd></td><td>Open the kebab menu for the selected pane</td></tr>
        <tr><td><kbd>x</kbd></td><td>Close the selected pane</td></tr>
        <tr><td><kbd>r</kbd></td><td>Reopen a previously closed worktree</td></tr>
      </tbody>
    </table>

    <h2>Navigation</h2>
    <table class="shortcut-table">
      <thead>
        <tr><th>Key</th><th>Action</th></tr>
      </thead>
      <tbody>
        <tr><td><kbd>↑</kbd> <kbd>↓</kbd></td><td>Navigate between panes in the list</td></tr>
        <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Navigate between projects (in multi-project mode)</td></tr>
        <tr><td><kbd>Enter</kbd></td><td>Select / confirm highlighted item</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>Cancel current dialog or action</td></tr>
      </tbody>
    </table>

    <h2>Application</h2>
    <table class="shortcut-table">
      <thead>
        <tr><th>Key</th><th>Action</th></tr>
      </thead>
      <tbody>
        <tr><td><kbd>s</kbd></td><td>Open settings dialog</td></tr>
        <tr><td><kbd>l</kbd></td><td>View application logs</td></tr>
        <tr><td><kbd>L</kbd></td><td>Toggle sidebar layout mode (when using grid layout)</td></tr>
        <tr><td><kbd>h</kbd></td><td>Create or modify hooks with AI</td></tr>
        <tr><td><kbd>?</kbd></td><td>Show keyboard shortcuts help</td></tr>
        <tr><td><kbd>q</kbd></td><td>Quit dmux</td></tr>
      </tbody>
    </table>

    <h2>Text Input</h2>
    <p>When typing in a prompt or dialog:</p>
    <table class="shortcut-table">
      <thead>
        <tr><th>Key</th><th>Action</th></tr>
      </thead>
      <tbody>
        <tr><td><kbd>Enter</kbd></td><td>Submit input</td></tr>
        <tr><td><kbd>Shift+Enter</kbd></td><td>New line (multiline input)</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>Cancel input</td></tr>
      </tbody>
    </table>

    <div class="callout callout-tip">
      <div class="callout-title">Tip</div>
      You can paste large prompts using your terminal's paste function. dmux supports bracketed paste mode and will handle multi-line pastes correctly.
    </div>

    <h2>Pane Menu Actions</h2>
    <p>When you press <kbd>m</kbd> on a pane, a context menu appears with these actions:</p>
    <ul>
      <li><strong>View</strong> — jump to the pane</li>
      <li><strong>Merge</strong> — merge the pane's work back to main</li>
      <li><strong>Close</strong> — close the pane and optionally remove the worktree</li>
      <li><strong>Rename</strong> — rename the pane slug</li>
      <li><strong>Duplicate</strong> — create a new pane with the same prompt</li>
      <li><strong>Run Test</strong> — execute the project's test hook</li>
      <li><strong>Run Dev</strong> — execute the project's dev hook</li>
    </ul>
  `;
}
