import { useState } from "react"

/**
 * Hook to manage all dialog-related state in DmuxApp
 * Centralizes: command prompts, file copy dialog, running status, quit confirmation
 */
export function useDialogState() {
  const [showCommandPrompt, setShowCommandPrompt] = useState<"test" | "dev" | null>(null)
  const [commandInput, setCommandInput] = useState("")
  const [showFileCopyPrompt, setShowFileCopyPrompt] = useState(false)
  const [currentCommandType, setCurrentCommandType] = useState<"test" | "dev" | null>(null)
  const [runningCommand, setRunningCommand] = useState(false)
  const [quitConfirmMode, setQuitConfirmMode] = useState(false)

  /**
   * Check if any dialog is currently open
   * Used to determine if input should be blocked
   */
  const isAnyDialogOpen = () => {
    return !!(
      showCommandPrompt ||
      showFileCopyPrompt ||
      runningCommand ||
      quitConfirmMode
    )
  }

  /**
   * Check if any modal dialog is open (excluding running indicator)
   * Used for input routing decisions
   */
  const isModalDialogOpen = () => {
    return !!(showCommandPrompt || showFileCopyPrompt)
  }

  /**
   * Close all dialogs
   * Useful for cleanup or reset scenarios
   */
  const closeAllDialogs = () => {
    setShowCommandPrompt(null)
    setCommandInput("")
    setShowFileCopyPrompt(false)
    setCurrentCommandType(null)
    setRunningCommand(false)
    setQuitConfirmMode(false)
  }

  return {
    // State
    showCommandPrompt,
    setShowCommandPrompt,
    commandInput,
    setCommandInput,
    showFileCopyPrompt,
    setShowFileCopyPrompt,
    currentCommandType,
    setCurrentCommandType,
    runningCommand,
    setRunningCommand,
    quitConfirmMode,
    setQuitConfirmMode,

    // Helper functions
    isAnyDialogOpen,
    isModalDialogOpen,
    closeAllDialogs,
  }
}
