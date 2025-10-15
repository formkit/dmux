#!/usr/bin/env node

// Spacer pane - displays only gray dots, no ASCII art
// Used to fill empty space in layouts

const DIM_GRAY = "\x1b[38;5;238m" // Same gray as decorative-pane
const RESET = "\x1b[0m"
const FILL_CHAR = "·"

function render(width: number, height: number): void {
  const lines: string[] = []

  for (let row = 0; row < height; row++) {
    let line = ""
    for (let col = 0; col < width; col++) {
      line += DIM_GRAY + FILL_CHAR + RESET
    }
    lines.push(line)
  }

  // Clear screen and render
  process.stdout.write("\x1b[2J\x1b[H") // Clear screen and home cursor
  process.stdout.write(lines.join("\n"))
}

// Initial render
const initialWidth = process.stdout.columns || 80
const initialHeight = process.stdout.rows || 24
render(initialWidth, initialHeight)

// Re-render on terminal resize
process.stdout.on("resize", () => {
  const width = process.stdout.columns || 80
  const height = process.stdout.rows || 24
  render(width, height)
})

// Keep the process running
process.stdin.resume()

// Handle Ctrl+C gracefully
process.on("SIGINT", () => {
  process.exit(0)
})

process.on("SIGTERM", () => {
  process.exit(0)
})
