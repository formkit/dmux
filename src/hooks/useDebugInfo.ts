import { useState, useEffect } from "react"
import { execSync } from "child_process"

/**
 * Hook to manage debug information and development-only state
 * Handles: debug messages, current git branch detection
 */
export function useDebugInfo(__dirname: string) {
  const [debugMessage, setDebugMessage] = useState<string>("")
  const [currentBranch, setCurrentBranch] = useState<string | null>(null)

  // Get current git branch on mount (only for dev builds)
  useEffect(() => {
    const isDev =
      process.env.DMUX_DEV === "true" || __dirname.includes("dist") === false
    if (isDev) {
      try {
        const branch = execSync("git rev-parse --abbrev-ref HEAD", {
          encoding: "utf-8",
          stdio: "pipe",
        }).trim()
        setCurrentBranch(branch)
      } catch {
        // Not in a git repository or git not available - that's fine
        setCurrentBranch(null)
      }
    }
  }, [__dirname])

  return {
    debugMessage,
    setDebugMessage,
    currentBranch,
    setCurrentBranch,
  }
}
