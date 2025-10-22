import { useInput } from "ink"
import type { DmuxPane } from "../types.js"
import { StateManager } from "../shared/StateManager.js"
import { LogService } from "../services/LogService.js"
import { TmuxService } from "../services/TmuxService.js"
import {
  STATUS_MESSAGE_DURATION_SHORT,
  STATUS_MESSAGE_DURATION_LONG,
  TUNNEL_COPY_FEEDBACK_DURATION,
  ANIMATION_DELAY,
} from "../constants/timing.js"
import { PaneAction } from "../actions/index.js"
import { getMainBranch } from "../utils/git.js"
import { enforceControlPaneSize } from "../utils/tmux.js"
import { SIDEBAR_WIDTH } from "../utils/layoutManager.js"
import { suggestCommand } from "../utils/commands.js"
import type { PopupManager } from "../services/PopupManager.js"

// Type for the action system returned by useActionSystem hook
interface ActionSystem {
  actionState: any
  executeAction: (actionId: any, pane: DmuxPane, params?: any) => Promise<void>
  executeCallback: (callback: (() => Promise<any>) | null, options?: { showProgress?: boolean; progressMessage?: string }) => Promise<void>
  clearDialog: (dialogType: any) => void
  clearStatus: () => void
  setActionState: (state: any) => void
}

interface UseInputHandlingParams {
  // State
  panes: DmuxPane[]
  selectedIndex: number
  setSelectedIndex: (index: number) => void
  isCreatingPane: boolean
  setIsCreatingPane: (value: boolean) => void
  runningCommand: boolean
  isUpdating: boolean
  isLoading: boolean
  ignoreInput: boolean
  quitConfirmMode: boolean
  setQuitConfirmMode: (value: boolean) => void

  // Dialog state
  showCommandPrompt: "test" | "dev" | null
  setShowCommandPrompt: (value: "test" | "dev" | null) => void
  commandInput: string
  setCommandInput: (value: string) => void
  showFileCopyPrompt: boolean
  setShowFileCopyPrompt: (value: boolean) => void
  currentCommandType: "test" | "dev" | null
  setCurrentCommandType: (value: "test" | "dev" | null) => void

  // Settings
  projectSettings: any
  saveSettings: (settings: any) => Promise<void>
  settingsManager: any

  // Tunnel state
  tunnelUrl: string | null
  setTunnelUrl: (url: string | null) => void
  tunnelCreating: boolean
  setTunnelCreating: (value: boolean) => void
  setTunnelCopied: (value: boolean) => void

  // Services
  popupManager: PopupManager
  actionSystem: ActionSystem
  server: any
  controlPaneId: string | undefined

  // Callbacks
  setStatusMessage: (message: string) => void
  copyNonGitFiles: (worktreePath: string) => Promise<void>
  runCommandInternal: (type: "test" | "dev", pane: DmuxPane) => Promise<void>
  handlePaneCreationWithAgent: (prompt: string) => Promise<void>
  loadPanes: () => Promise<void>
  cleanExit: () => void

  // Navigation
  findCardInDirection: (currentIndex: number, direction: "up" | "down" | "left" | "right") => number | null
}

/**
 * Hook that handles all keyboard input for the TUI
 * Extracted from DmuxApp.tsx to reduce component complexity
 */
export function useInputHandling(params: UseInputHandlingParams) {
  const {
    panes,
    selectedIndex,
    setSelectedIndex,
    isCreatingPane,
    setIsCreatingPane,
    runningCommand,
    isUpdating,
    isLoading,
    ignoreInput,
    quitConfirmMode,
    setQuitConfirmMode,
    showCommandPrompt,
    setShowCommandPrompt,
    commandInput,
    setCommandInput,
    showFileCopyPrompt,
    setShowFileCopyPrompt,
    currentCommandType,
    setCurrentCommandType,
    projectSettings,
    saveSettings,
    settingsManager,
    tunnelUrl,
    setTunnelUrl,
    tunnelCreating,
    setTunnelCreating,
    setTunnelCopied,
    popupManager,
    actionSystem,
    server,
    controlPaneId,
    setStatusMessage,
    copyNonGitFiles,
    runCommandInternal,
    handlePaneCreationWithAgent,
    loadPanes,
    cleanExit,
    findCardInDirection,
  } = params

  useInput(async (input: string, key: any) => {
    const logService = LogService.getInstance()

    // Log all input for debugging (only first 50 chars to avoid spam)
    // Commented out to reduce log noise
    // const inputPreview =
    //   input.length > 50 ? input.substring(0, 50) + "..." : input
    // logService.debug(`Input: "${inputPreview}"`, "InputDebug")

    // Ignore input temporarily after popup operations (prevents buffered keys from being processed)
    if (ignoreInput) {
      return
    }

    // Handle Ctrl+C for quit confirmation (must be first, before any other checks)
    if (key.ctrl && input === "c") {
      if (quitConfirmMode) {
        // Second Ctrl+C - actually quit
        cleanExit()
      } else {
        // First Ctrl+C - show confirmation
        setQuitConfirmMode(true)
        // Reset after 3 seconds if user doesn't press Ctrl+C again
        setTimeout(() => {
          setQuitConfirmMode(false)
        }, 3000)
      }
      return
    }

    if (isCreatingPane || runningCommand || isUpdating || isLoading) {
      // Disable input while performing operations or loading
      return
    }

    // Handle quit confirm mode - ESC cancels it
    if (quitConfirmMode) {
      if (key.escape) {
        setQuitConfirmMode(false)
        return
      }
      // Allow other inputs to continue (don't return early)
    }

    if (showFileCopyPrompt) {
      if (input === "y" || input === "Y") {
        setShowFileCopyPrompt(false)
        const selectedPane = panes[selectedIndex]
        if (selectedPane && selectedPane.worktreePath && currentCommandType) {
          await copyNonGitFiles(selectedPane.worktreePath)

          // Mark as not first run and continue with command
          const newSettings = {
            ...projectSettings,
            [currentCommandType === "test" ? "firstTestRun" : "firstDevRun"]:
              true,
          }
          await saveSettings(newSettings)

          // Now run the actual command
          await runCommandInternal(currentCommandType, selectedPane)
        }
        setCurrentCommandType(null)
      } else if (input === "n" || input === "N" || key.escape) {
        setShowFileCopyPrompt(false)
        const selectedPane = panes[selectedIndex]
        if (selectedPane && currentCommandType) {
          // Mark as not first run and continue without copying
          const newSettings = {
            ...projectSettings,
            [currentCommandType === "test" ? "firstTestRun" : "firstDevRun"]:
              true,
          }
          await saveSettings(newSettings)

          // Now run the actual command
          await runCommandInternal(currentCommandType, selectedPane)
        }
        setCurrentCommandType(null)
      }
      return
    }

    if (showCommandPrompt) {
      if (key.escape) {
        setShowCommandPrompt(null)
        setCommandInput("")
      } else if (key.return) {
        if (commandInput.trim() === "") {
          // If empty, suggest a default command based on package manager
          const suggested = await suggestCommand(showCommandPrompt)
          if (suggested) {
            setCommandInput(suggested)
          }
        } else {
          // User provided manual command
          const newSettings = {
            ...projectSettings,
            [showCommandPrompt === "test" ? "testCommand" : "devCommand"]:
              commandInput.trim(),
          }
          await saveSettings(newSettings)
          const selectedPane = panes[selectedIndex]
          if (selectedPane) {
            // Check if first run
            const isFirstRun =
              showCommandPrompt === "test"
                ? !projectSettings.firstTestRun
                : !projectSettings.firstDevRun
            if (isFirstRun) {
              setCurrentCommandType(showCommandPrompt)
              setShowCommandPrompt(null)
              setShowFileCopyPrompt(true)
            } else {
              await runCommandInternal(showCommandPrompt, selectedPane)
              setShowCommandPrompt(null)
              setCommandInput("")
            }
          } else {
            setShowCommandPrompt(null)
            setCommandInput("")
          }
        }
      }
      return
    }

    // Handle directional navigation with spatial awareness based on card grid layout
    if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
      let targetIndex: number | null = null

      if (key.upArrow) {
        targetIndex = findCardInDirection(selectedIndex, "up")
      } else if (key.downArrow) {
        targetIndex = findCardInDirection(selectedIndex, "down")
      } else if (key.leftArrow) {
        targetIndex = findCardInDirection(selectedIndex, "left")
      } else if (key.rightArrow) {
        targetIndex = findCardInDirection(selectedIndex, "right")
      }

      if (targetIndex !== null) {
        setSelectedIndex(targetIndex)
      }
      return
    }

    if (input === "m" && selectedIndex < panes.length) {
      // Open kebab menu popup for selected pane
      const selectedPane = panes[selectedIndex]
      const actionId = await popupManager.launchKebabMenuPopup(selectedPane)
      if (actionId) {
        await actionSystem.executeAction(actionId, selectedPane, {
          mainBranch: getMainBranch(),
        })
      }
    } else if (input === "s") {
      // Open settings popup
      const result = await popupManager.launchSettingsPopup(async () => {
        // Launch hooks popup
        await popupManager.launchHooksPopup(async () => {
          // Edit hooks using an agent
          const prompt =
            "I would like to edit my dmux hooks in .dmux-hooks, please read the instructions in there and ask me what I want to edit"
          await handlePaneCreationWithAgent(prompt)
        })
      })
      if (result) {
        settingsManager.updateSetting(
          result.key as keyof import("../types.js").DmuxSettings,
          result.value,
          result.scope
        )
        setStatusMessage(`Setting saved (${result.scope})`)
        setTimeout(() => setStatusMessage(""), STATUS_MESSAGE_DURATION_SHORT)
      }
    } else if (input === "l") {
      // Open logs popup
      await popupManager.launchLogsPopup()
    } else if (input === "?") {
      // Open keyboard shortcuts popup
      await popupManager.launchShortcutsPopup(!!controlPaneId)
    } else if (input === "L" && controlPaneId) {
      // Reset layout to sidebar configuration (Shift+L)
      enforceControlPaneSize(controlPaneId, SIDEBAR_WIDTH)
      setStatusMessage("Layout reset")
      setTimeout(() => setStatusMessage(""), STATUS_MESSAGE_DURATION_SHORT)
    } else if (input === "T") {
      // Demo toasts (Shift+T) - cycles through different types
      const stateManager = StateManager.getInstance()
      const demos = [
        { msg: "Pane created successfully", severity: "success" as const },
        { msg: "Failed to merge: conflicts detected", severity: "error" as const },
        { msg: "Warning: API key not configured", severity: "warning" as const },
        { msg: "This is a longer informational message that will wrap to multiple lines if needed to demonstrate how toasts handle longer content", severity: "info" as const },
      ]
      // Queue all demo toasts
      demos.forEach(demo => stateManager.showToast(demo.msg, demo.severity))
    } else if (input === "q") {
      cleanExit()
    } else if (input === "r" && server) {
      // Handle remote tunnel
      if (tunnelUrl) {
        // Tunnel exists - open popup with QR code
        await popupManager.launchRemotePopup(tunnelUrl, () => {
          setTunnelCopied(true)
          setTimeout(() => setTunnelCopied(false), TUNNEL_COPY_FEEDBACK_DURATION)
        })
      } else if (!tunnelCreating) {
        // Start tunnel creation
        setTunnelCreating(true)
        ;(async () => {
          try {
            const url = await server.startTunnel()
            setTunnelUrl(url)
          } catch (error: any) {
            setStatusMessage(`Failed to create tunnel: ${error.message}`)
            setTimeout(() => setStatusMessage(""), STATUS_MESSAGE_DURATION_LONG)
          } finally {
            setTunnelCreating(false)
          }
        })()
      }
      // If tunnelCreating is true, do nothing (already creating)
      return
    } else if (
      !isLoading &&
      (input === "n" || (key.return && selectedIndex === panes.length))
    ) {
      // Launch popup modal for new pane
      const promptValue = await popupManager.launchNewPanePopup()
      if (promptValue) {
        await handlePaneCreationWithAgent(promptValue)
      }
      return
    } else if (
      !isLoading &&
      (input === "t" || (key.return && selectedIndex === panes.length + 1))
    ) {
      // Create a new terminal pane without an agent
      try {
        setIsCreatingPane(true)
        setStatusMessage("Creating terminal pane...")

        const tmuxService = TmuxService.getInstance()

        // Create a simple tmux pane split
        await tmuxService.splitPane({})

        // Wait for pane creation to settle
        await new Promise((resolve) => setTimeout(resolve, ANIMATION_DELAY))

        // The shell pane will be automatically detected by the shell pane detection system
        // No need to manually add it to the panes array

        setIsCreatingPane(false)
        setStatusMessage("Terminal pane created")
        setTimeout(() => setStatusMessage(""), STATUS_MESSAGE_DURATION_SHORT)

        // Force a reload to pick up the new shell pane
        await loadPanes()
      } catch (error: any) {
        setIsCreatingPane(false)
        setStatusMessage(`Failed to create terminal pane: ${error.message}`)
        setTimeout(() => setStatusMessage(""), STATUS_MESSAGE_DURATION_LONG)
      }
      return
    } else if (input === "j" && selectedIndex < panes.length) {
      // Jump to pane (NEW: using action system)
      StateManager.getInstance().setDebugMessage(
        `Jumping to pane: ${panes[selectedIndex].slug}`
      )
      setTimeout(() => StateManager.getInstance().setDebugMessage(""), STATUS_MESSAGE_DURATION_SHORT)
      actionSystem.executeAction(PaneAction.VIEW, panes[selectedIndex])
    } else if (input === "x" && selectedIndex < panes.length) {
      // Close pane (NEW: using action system)
      StateManager.getInstance().setDebugMessage(
        `Closing pane: ${panes[selectedIndex].slug}`
      )
      setTimeout(() => StateManager.getInstance().setDebugMessage(""), STATUS_MESSAGE_DURATION_SHORT)
      actionSystem.executeAction(PaneAction.CLOSE, panes[selectedIndex])
    } else if (key.return && selectedIndex < panes.length) {
      // Jump to pane (NEW: using action system)
      StateManager.getInstance().setDebugMessage(
        `Jumping to pane: ${panes[selectedIndex].slug}`
      )
      setTimeout(() => StateManager.getInstance().setDebugMessage(""), STATUS_MESSAGE_DURATION_SHORT)
      actionSystem.executeAction(PaneAction.VIEW, panes[selectedIndex])
    }
  })
}
