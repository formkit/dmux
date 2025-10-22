import { execSync } from "child_process"
import { ASCII_ART_RENDER_DELAY } from "../constants/timing.js"

export interface RenderAsciiArtOptions {
  paneId: string
  art: string[]
  fillChar?: string
  centerVertically?: boolean
  centerHorizontally?: boolean
}

/**
 * Get dimensions of a tmux pane
 */
function getPaneDimensions(paneId: string): { width: number; height: number } {
  try {
    const output = execSync(
      `tmux display-message -t '${paneId}' -p '#{pane_width} #{pane_height}'`,
      { encoding: "utf-8", stdio: "pipe" }
    ).trim()

    const [width, height] = output.split(" ").map((n) => parseInt(n))
    return { width, height }
  } catch {
    return { width: 80, height: 24 } // Fallback
  }
}

/**
 * Render ASCII art centered in a tmux pane with fill characters
 * Uses a persistent node script that re-renders on resize
 *
 * @param options - Rendering options
 * @param options.paneId - The tmux pane ID to render to
 * @param options.art - Array of strings representing each line of ASCII art (unused, uses default art)
 * @param options.fillChar - Character to fill empty space (unused, uses default)
 * @param options.centerVertically - Center art vertically (unused, always centered)
 * @param options.centerHorizontally - Center art horizontally (unused, always centered)
 */
export async function renderAsciiArt(
  options: RenderAsciiArtOptions
): Promise<void> {
  const { paneId } = options

  // Find the decorative pane script - check both dist and src directories
  const path = await import("path")
  const { fileURLToPath } = await import("url")
  const fs = await import("fs")

  const __dirname = path.dirname(fileURLToPath(import.meta.url))

  // Try multiple possible locations
  const possiblePaths = [
    path.join(__dirname, "..", "..", "dist", "decorative-pane.js"),
    path.join(__dirname, "..", "decorative-pane.js"),
    path.join(process.cwd(), "dist", "decorative-pane.js"),
  ]

  let scriptPath = possiblePaths[0] // Default
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      scriptPath = p
      break
    }
  }

  // Verify the script exists
  if (!fs.existsSync(scriptPath)) {
    throw new Error(
      `Decorative pane script not found at ${scriptPath}. Tried: ${possiblePaths.join(
        ", "
      )}`
    )
  }

  // Kill any existing process in the pane
  try {
    execSync(`tmux send-keys -t '${paneId}' C-c`, { stdio: "pipe" })
  } catch {
    // Pane might not have a running process, that's okay
  }
  await new Promise((resolve) => setTimeout(resolve, ASCII_ART_RENDER_DELAY))

  // Run the decorative pane script with absolute path
  const absolutePath = path.isAbsolute(scriptPath)
    ? scriptPath
    : path.resolve(scriptPath)
  execSync(`tmux send-keys -t '${paneId}' 'node "${absolutePath}"' Enter`, {
    stdio: "pipe",
  })
  await new Promise((resolve) => setTimeout(resolve, 150))
}

/**
 * Predefined ASCII art designs
 */
export const ASCII_ART = {
  dmuxWelcome: `
╭─────────────────────────────────────────────────────────╮
│                                                         │
│           ███                                           │
│           ███                                           │
│       ███████  █████████████   ███  ███  ███  ███       │
│      ███  ███  ███  ███  ████  ███  ███  ███  ███       │
│      ███  ███  ███  ███  ████  ███  ███    █████        │
│      ███  ███  ███  ███  ████  ███  ███  ███  ███       │
│      ████████  ███  ███  ████  ████████  ███  ███       │
│                                                         │
│              AI developer agent multiplexer             │
│              Press [n] to create a new agent            │
│                                                         │
╰─────────────────────────────────────────────────────────╯
  `,
}
