#!/usr/bin/env node

// Decorative pane renderer - displays ASCII art with animated falling binary characters
// This runs continuously without showing a command prompt

import { ASCII_ART as ASCII_ART_EXPORTS } from "../utils/asciiArt.js"

// Parse the ASCII art string into an array of lines
const ASCII_ART = ASCII_ART_EXPORTS.dmuxWelcome.trim().split("\n")

const FILL_CHAR = "·"
const ORANGE = "\x1b[38;5;208m" // ANSI 256-color orange
const DIM_GRAY = "\x1b[38;5;238m" // Dim gray for fill dots
const RESET = "\x1b[0m" // Reset color
const HIDE_CURSOR = "\x1b[?25l"
const SHOW_CURSOR = "\x1b[?25h"

const TAIL_LENGTH = 8
const FRAME_INTERVAL = 80 // ms between frames

// Shades from bright to dim for the tail effect (orange)
const SHADES = [
  "\x1b[38;5;214m", // Bright orange
  "\x1b[38;5;208m", // Orange
  "\x1b[38;5;202m", // Darker orange
  "\x1b[38;5;166m", // Even darker
  "\x1b[38;5;130m", // Very dark orange
  "\x1b[38;5;94m", // Brown-orange
  "\x1b[38;5;58m", // Dark brown
  "\x1b[38;5;236m", // Almost black
]

interface GridCell {
  char: string
  color: string
}

// A single falling column stream
interface Drop {
  column: number
  y: number // head position (moves down each tick)
  speed: number // rows to advance per tick
  chars: string[] // rotating binary characters in the tail
  accumulator: number // fractional movement accumulator
}

// State
let drops: Drop[] = []
let width = process.stdout.columns || 80
let height = process.stdout.rows || 24
let animationTimer: ReturnType<typeof setInterval> | null = null

/**
 * Initialize drops to cover the screen — spread across columns with staggered starts
 */
function initDrops(): void {
  drops = []
  // Roughly one drop per 2 columns, density scales with terminal width
  const numDrops = Math.floor(width / 2)
  for (let i = 0; i < numDrops; i++) {
    drops.push(createDrop(true))
  }
}

/**
 * Create a single drop. If `randomStart` is true, scatter it across the screen
 * for the initial fill; otherwise start above the viewport for continuous rain.
 */
function createDrop(randomStart: boolean): Drop {
  const column = Math.floor(Math.random() * width)
  const speed = 0.3 + Math.random() * 0.7 // 0.3–1.0 rows per tick
  const y = randomStart
    ? Math.floor(Math.random() * (height + TAIL_LENGTH)) - TAIL_LENGTH
    : -Math.floor(Math.random() * TAIL_LENGTH)
  const chars = Array.from({ length: TAIL_LENGTH }, () =>
    Math.random() > 0.5 ? "1" : "0"
  )
  return { column, y, speed, chars, accumulator: 0 }
}

/**
 * Advance all drops, recycle those that have fully left the screen
 */
function tickDrops(): void {
  for (let i = 0; i < drops.length; i++) {
    const drop = drops[i]
    drop.accumulator += drop.speed
    while (drop.accumulator >= 1) {
      drop.y++
      drop.accumulator -= 1
      // Randomly mutate one character in the tail for that flickering effect
      const mutIdx = Math.floor(Math.random() * drop.chars.length)
      drop.chars[mutIdx] = Math.random() > 0.5 ? "1" : "0"
    }
    // If the entire tail is below the screen, respawn
    if (drop.y - TAIL_LENGTH > height) {
      drops[i] = createDrop(false)
    }
  }
}

/**
 * Render the current frame
 */
function render(): void {
  // Build background grid from drops
  const grid: (GridCell | null)[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => null)
  )

  for (const drop of drops) {
    for (let i = 0; i < drop.chars.length; i++) {
      const row = Math.floor(drop.y - i)
      if (row >= 0 && row < height && drop.column >= 0 && drop.column < width) {
        const shadeIndex = Math.min(i, SHADES.length - 1)
        grid[row][drop.column] = {
          char: drop.chars[i],
          color: SHADES[shadeIndex],
        }
      }
    }
  }

  // ASCII art dimensions and centering
  const artHeight = ASCII_ART.length
  const artMaxWidth = Math.max(...ASCII_ART.map((line) => line.length))
  const topPadding = Math.floor((height - artHeight) / 2)

  const lines: string[] = []

  for (let row = 0; row < height; row++) {
    const isArtRow = row >= topPadding && row < topPadding + artHeight
    const artLine = isArtRow ? ASCII_ART[row - topPadding] : null

    let line = ""

    for (let col = 0; col < width; col++) {
      if (isArtRow && artLine) {
        const trimmedArt = artLine.trimEnd()
        const leftPadding = Math.max(
          0,
          Math.floor((width - trimmedArt.length) / 2)
        )
        const artCol = col - leftPadding

        if (artCol >= 0 && artCol < trimmedArt.length) {
          line += ORANGE + trimmedArt[artCol] + RESET
        } else {
          const bg = grid[row][col]
          line += bg ? bg.color + bg.char + RESET : DIM_GRAY + FILL_CHAR + RESET
        }
      } else {
        const bg = grid[row][col]
        line += bg ? bg.color + bg.char + RESET : DIM_GRAY + FILL_CHAR + RESET
      }
    }

    lines.push(line)
  }

  process.stdout.write("\x1b[H") // Home cursor (no clear — reduces flicker)
  process.stdout.write(lines.join("\n"))
}

/**
 * Start the animation loop
 */
function startAnimation(): void {
  if (animationTimer) return
  process.stdout.write(HIDE_CURSOR)
  process.stdout.write("\x1b[2J") // Clear screen once at start
  initDrops()
  render()
  animationTimer = setInterval(() => {
    tickDrops()
    render()
  }, FRAME_INTERVAL)
}

/**
 * Restart animation (e.g. on resize)
 */
function restartAnimation(): void {
  if (animationTimer) {
    clearInterval(animationTimer)
    animationTimer = null
  }
  width = process.stdout.columns || 80
  height = process.stdout.rows || 24
  startAnimation()
}

// Start
startAnimation()

// Re-init on terminal resize
process.stdout.on("resize", restartAnimation)

// Keep the process running
process.stdin.resume()

function cleanup(): void {
  if (animationTimer) clearInterval(animationTimer)
  process.stdout.write(SHOW_CURSOR)
  process.exit(0)
}

process.on("SIGINT", cleanup)
process.on("SIGTERM", cleanup)
