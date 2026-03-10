import { afterEach, describe, expect, it } from "vitest"
import { shouldUseQuietDevWatchExit } from "../src/utils/devWatchExit.js"

const originalDevWatch = process.env.DMUX_DEV_WATCH

afterEach(() => {
  if (originalDevWatch === undefined) {
    delete process.env.DMUX_DEV_WATCH
    return
  }

  process.env.DMUX_DEV_WATCH = originalDevWatch
})

describe("shouldUseQuietDevWatchExit", () => {
  it("returns true for process-manager termination signals in dev watch mode", () => {
    process.env.DMUX_DEV_WATCH = "true"

    expect(shouldUseQuietDevWatchExit("SIGTERM")).toBe(true)
    expect(shouldUseQuietDevWatchExit("SIGINT")).toBe(true)
  })

  it("returns false outside dev watch mode", () => {
    process.env.DMUX_DEV_WATCH = "false"

    expect(shouldUseQuietDevWatchExit("SIGTERM")).toBe(false)
  })

  it("returns false for other signals", () => {
    process.env.DMUX_DEV_WATCH = "true"

    expect(shouldUseQuietDevWatchExit("SIGUSR1")).toBe(false)
    expect(shouldUseQuietDevWatchExit()).toBe(false)
  })
})
