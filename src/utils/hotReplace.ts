import { execSync, spawn } from "child_process"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Resolves the dmux project root from the compiled dist directory.
 * __dirname points to dist/utils/, so we go up 2 levels.
 */
export function getDmuxRoot(): string {
  return resolve(__dirname, "..", "..")
}

/**
 * Pull latest changes from origin main.
 * Throws on failure.
 */
export function pullLatest(root: string): void {
  execSync("git pull origin main", {
    cwd: root,
    timeout: 30_000,
    stdio: "pipe",
  })
}

/**
 * Rebuild dmux via pnpm build.
 * Throws on failure.
 */
export function rebuild(root: string): void {
  execSync("pnpm build", {
    cwd: root,
    timeout: 120_000,
    stdio: "pipe",
  })
}

/**
 * Schedule a restart of dmux by spawning a detached process that sends
 * `./dmux` to the control pane after a short delay. The current process
 * should exit immediately after calling this.
 */
export function scheduleRestart(
  controlPaneId: string,
  dmuxRoot: string
): void {
  const child = spawn(
    "sh",
    [
      "-c",
      `sleep 0.5 && tmux send-keys -t '${controlPaneId}' '${dmuxRoot}/dmux' Enter`,
    ],
    {
      detached: true,
      stdio: "ignore",
      cwd: dmuxRoot,
    }
  )
  child.unref()
}
