import { useState, useEffect } from "react"

/**
 * Hook to manage tunnel/network state in DmuxApp
 * Handles: tunnel URL, creation status, spinner animation, copy feedback, local IP
 */
export function useTunnelManagement() {
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null)
  const [tunnelCreating, setTunnelCreating] = useState(false)
  const [tunnelSpinnerFrame, setTunnelSpinnerFrame] = useState(0)
  const [tunnelCopied, setTunnelCopied] = useState(false)
  const [localIp, setLocalIp] = useState<string>("127.0.0.1")

  // Spinner animation for tunnel creation
  useEffect(() => {
    if (!tunnelCreating) return

    const spinnerInterval = setInterval(() => {
      setTunnelSpinnerFrame((prev) => (prev + 1) % 10)
    }, 80) // Update every 80ms

    return () => clearInterval(spinnerInterval)
  }, [tunnelCreating])

  /**
   * Get the current spinner frame character
   */
  const getSpinnerChar = () => {
    const spinnerFrames = [
      "⠋",
      "⠙",
      "⠹",
      "⠸",
      "⠼",
      "⠴",
      "⠦",
      "⠧",
      "⠇",
      "⠏",
    ]
    return spinnerFrames[tunnelSpinnerFrame]
  }

  return {
    // State
    tunnelUrl,
    setTunnelUrl,
    tunnelCreating,
    setTunnelCreating,
    tunnelSpinnerFrame,
    setTunnelSpinnerFrame,
    tunnelCopied,
    setTunnelCopied,
    localIp,
    setLocalIp,

    // Helper functions
    getSpinnerChar,
  }
}
