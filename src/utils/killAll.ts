import { execSync } from "child_process"
import { getStatusDetector } from "../services/StatusDetector.js"

/**
 * Kill the entire tmux session, destroying all panes.
 * Shuts down status detection workers first, then kills the session.
 */
export async function killAll(sessionName: string): Promise<void> {
  // Shut down all status detection workers gracefully
  try {
    await getStatusDetector().shutdown()
  } catch {
    // Ignore errors - we're tearing everything down anyway
  }

  // Kill the entire tmux session (destroys all panes including control pane)
  try {
    execSync(`tmux kill-session -t '${sessionName}'`, {
      stdio: "pipe",
      timeout: 5_000,
    })
  } catch {
    // Session may already be gone
  }
}
