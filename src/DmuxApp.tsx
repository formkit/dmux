import React, { useState, useEffect } from "react"
import { Box, Text, useApp, useStdout } from "ink"
import { execSync } from "child_process"
import { createRequire } from "module"

// Hooks
import usePanes from "./hooks/usePanes.js"
import useProjectSettings from "./hooks/useProjectSettings.js"
import useTerminalWidth from "./hooks/useTerminalWidth.js"
import useNavigation from "./hooks/useNavigation.js"
import useAutoUpdater from "./hooks/useAutoUpdater.js"
import useAgentDetection from "./hooks/useAgentDetection.js"
import useAgentStatus from "./hooks/useAgentStatus.js"
import usePaneRunner from "./hooks/usePaneRunner.js"
import usePaneCreation from "./hooks/usePaneCreation.js"
import useActionSystem from "./hooks/useActionSystem.js"
import { useStatusMessages } from "./hooks/useStatusMessages.js"
import { useLayoutManagement } from "./hooks/useLayoutManagement.js"
import { useInputHandling } from "./hooks/useInputHandling.js"

// Utils
import { SIDEBAR_WIDTH } from "./utils/layoutManager.js"
import { supportsPopups } from "./utils/popup.js"
import { StateManager } from "./shared/StateManager.js"
import {
  REPAINT_SPINNER_DURATION,
  STATUS_MESSAGE_DURATION_SHORT,
  TUNNEL_COPY_FEEDBACK_DURATION,
} from "./constants/timing.js"
import {
  getStatusDetector,
  type StatusUpdateEvent,
} from "./services/StatusDetector.js"
import {
  type ActionResult,
} from "./actions/index.js"
import { SettingsManager } from "./utils/settingsManager.js"
import { useServices } from "./hooks/useServices.js"
import { getMainBranch } from "./utils/git.js"
import { fileURLToPath } from "url"
import { dirname } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const require = createRequire(import.meta.url)
const packageJson = require("../package.json")
import type {
  DmuxPane,
  DmuxAppProps,
} from "./types.js"
import PanesGrid from "./components/panes/PanesGrid.js"
import CommandPromptDialog from "./components/dialogs/CommandPromptDialog.js"
import FileCopyPrompt from "./components/ui/FileCopyPrompt.js"
import LoadingIndicator from "./components/indicators/LoadingIndicator.js"
import RunningIndicator from "./components/indicators/RunningIndicator.js"
import UpdatingIndicator from "./components/indicators/UpdatingIndicator.js"
import FooterHelp from "./components/ui/FooterHelp.js"

const DmuxApp: React.FC<DmuxAppProps> = ({
  panesFile,
  projectName,
  sessionName,
  settingsFile,
  projectRoot,
  autoUpdater,
  serverPort,
  server,
  controlPaneId,
}) => {
  const { stdout } = useStdout()
  const terminalHeight = stdout?.rows || 40

  /* panes state moved to usePanes */
  const [selectedIndex, setSelectedIndex] = useState(0)
  const { statusMessage, setStatusMessage, showStatus, clearStatus } = useStatusMessages()
  const [isCreatingPane, setIsCreatingPane] = useState(false)

  // Settings state
  const [settingsManager] = useState(() => new SettingsManager(projectRoot))
  // Force repaint trigger - incrementing this causes Ink to re-render
  const [forceRepaintTrigger, setForceRepaintTrigger] = useState(0)
  // Spinner state - shows for a few frames to force render
  const [showRepaintSpinner, setShowRepaintSpinner] = useState(false)
  const { projectSettings, saveSettings } = useProjectSettings(settingsFile)
  const [showCommandPrompt, setShowCommandPrompt] = useState<
    "test" | "dev" | null
  >(null)
  const [commandInput, setCommandInput] = useState("")
  const [showFileCopyPrompt, setShowFileCopyPrompt] = useState(false)
  const [currentCommandType, setCurrentCommandType] = useState<
    "test" | "dev" | null
  >(null)
  const [runningCommand, setRunningCommand] = useState(false)
  const [quitConfirmMode, setQuitConfirmMode] = useState(false)
  // Debug message state - for temporary logging messages
  const [debugMessage, setDebugMessage] = useState<string>("")
  // Current git branch state (for dev builds)
  const [currentBranch, setCurrentBranch] = useState<string | null>(null)
  // Update state handled by hook
  const {
    updateInfo,
    isUpdating,
    updateAvailable,
  } = useAutoUpdater(autoUpdater, setStatusMessage)
  const { exit } = useApp()

  // Flag to ignore input temporarily after popup closes (prevents buffered keys)
  const [ignoreInput, setIgnoreInput] = useState(false)

  // Agent selection state
  const { availableAgents } = useAgentDetection()
  const [agentChoice, setAgentChoice] = useState<"claude" | "opencode" | null>(
    null
  )

  // Popup support detection
  const [popupsSupported, setPopupsSupported] = useState(false)

  // Track terminal dimensions for responsive layout
  const terminalWidth = useTerminalWidth()

  // Track unread error and warning counts for logs badge
  const [unreadErrorCount, setUnreadErrorCount] = useState(0)
  const [unreadWarningCount, setUnreadWarningCount] = useState(0)

  // Tunnel state
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null)
  const [tunnelCreating, setTunnelCreating] = useState(false)
  const [tunnelSpinnerFrame, setTunnelSpinnerFrame] = useState(0)
  const [localIp, setLocalIp] = useState<string>("127.0.0.1")
  const [tunnelCopied, setTunnelCopied] = useState(false)

  // Subscribe to StateManager for unread error/warning count updates
  useEffect(() => {
    const stateManager = StateManager.getInstance()

    const updateCounts = () => {
      setUnreadErrorCount(stateManager.getUnreadErrorCount())
      setUnreadWarningCount(stateManager.getUnreadWarningCount())
    }

    // Initial count
    updateCounts()

    // Subscribe to changes
    const unsubscribe = stateManager.subscribe(updateCounts)

    return () => {
      unsubscribe()
    }
  }, [])

  // Panes state and persistence (skipLoading will be updated after actionSystem is initialized)
  const { panes, setPanes, isLoading, loadPanes, savePanes } = usePanes(
    panesFile,
    false
  )

  // Track intentionally closed panes to prevent race condition
  // When a user closes a pane, we add it to this set. If the worker detects
  // the pane is gone (which it will), we check this set first before re-saving.
  const intentionallyClosedPanes = React.useRef<Set<string>>(new Set())

  // Pane runner
  const {
    copyNonGitFiles,
    runCommandInternal,
  } = usePaneRunner({
    panes,
    savePanes,
    projectSettings,
    setStatusMessage,
    setRunningCommand,
  })

  // Force repaint helper - shows spinner for a few frames to force full re-render
  const forceRepaint = () => {
    setForceRepaintTrigger((prev) => prev + 1)
    setShowRepaintSpinner(true)
    // Hide spinner after a few frames (enough to trigger multiple renders)
    setTimeout(() => setShowRepaintSpinner(false), REPAINT_SPINNER_DURATION)
  }

  // Force repaint effect - ensures Ink re-renders when trigger changes
  useEffect(() => {
    if (forceRepaintTrigger > 0) {
      // Small delay to ensure terminal is ready
      const timer = setTimeout(() => {
        try {
          execSync("tmux refresh-client", { stdio: "pipe" })
        } catch {}
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [forceRepaintTrigger])

  // Get local network IP on mount
  useEffect(() => {
    try {
      // Get local IP address (not 127.0.0.1)
      const result = execSync(
        `hostname -I 2>/dev/null || ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1`,
        {
          encoding: "utf-8",
          stdio: "pipe",
        }
      ).trim()
      if (result) {
        setLocalIp(result.split(" ")[0]) // Take first IP if multiple
      }
    } catch {
      // Fallback to 127.0.0.1
      setLocalIp("127.0.0.1")
    }
  }, [])

  // Spinner animation for tunnel creation
  useEffect(() => {
    if (!tunnelCreating) return

    const spinnerInterval = setInterval(() => {
      setTunnelSpinnerFrame((prev) => (prev + 1) % 10)
    }, 80) // Update every 80ms

    return () => clearInterval(spinnerInterval)
  }, [tunnelCreating])

  // Get current git branch on mount (only for dev builds)
  useEffect(() => {
    const isDev =
      process.env.DMUX_DEV === "true" || __dirname.includes("dist") === false
    if (isDev) {
      try {
        const branch = execSync("git rev-parse --abbrev-ref HEAD", {
          encoding: "utf-8",
          stdio: "pipe",
          cwd: projectRoot,
        }).trim()
        setCurrentBranch(branch)
      } catch {
        // Not in a git repo or git not available
        setCurrentBranch(null)
      }
    }
  }, [projectRoot])

  // Pane creation
  const { createNewPane: createNewPaneHook } = usePaneCreation({
    panes,
    savePanes,
    projectName,
    setIsCreatingPane,
    setStatusMessage,
    loadPanes,
    panesFile,
    availableAgents,
    forceRepaint,
  })

  // Initialize services
  const { popupManager } = useServices({
    // PopupManager config
    sidebarWidth: SIDEBAR_WIDTH,
    projectRoot: projectRoot || process.cwd(),
    popupsSupported,
    terminalWidth,
    terminalHeight,
    availableAgents,
    agentChoice,
    serverPort,
    server,
    settingsManager,
    projectSettings,

    // Callbacks
    setStatusMessage,
    setIgnoreInput,
    savePanes,
    loadPanes,
  })

  // Listen for status updates with analysis data and merge into panes
  useEffect(() => {
    const statusDetector = getStatusDetector()

    const handleStatusUpdate = (event: StatusUpdateEvent) => {
      setPanes((prevPanes) => {
        const updatedPanes = prevPanes.map((pane) => {
          if (pane.id === event.paneId) {
            const updated: DmuxPane = {
              ...pane,
              agentStatus: event.status,
            }

            // Only update analysis fields if they're present in the event (not undefined)
            // This prevents simple status changes from overwriting PaneAnalyzer results
            if (event.optionsQuestion !== undefined) {
              updated.optionsQuestion = event.optionsQuestion
            }
            if (event.options !== undefined) {
              updated.options = event.options
            }
            if (event.potentialHarm !== undefined) {
              updated.potentialHarm = event.potentialHarm
            }
            if (event.summary !== undefined) {
              updated.agentSummary = event.summary
            }
            if (event.analyzerError !== undefined) {
              updated.analyzerError = event.analyzerError
            }

            // Clear option dialog data when transitioning away from 'waiting' state
            if (event.status !== "waiting" && pane.agentStatus === "waiting") {
              updated.optionsQuestion = undefined
              updated.options = undefined
              updated.potentialHarm = undefined
            }

            // Clear summary when transitioning away from 'idle' state
            if (event.status !== "idle" && pane.agentStatus === "idle") {
              updated.agentSummary = undefined
            }

            // Clear analyzer error when successfully getting a new analysis
            // or when transitioning to 'working' status
            if (event.status === "working") {
              updated.analyzerError = undefined
            } else if (event.status === "waiting" || event.status === "idle") {
              if (
                event.analyzerError === undefined &&
                (event.optionsQuestion || event.summary)
              ) {
                updated.analyzerError = undefined
              }
            }

            return updated
          }
          return pane
        })

        // Persist to disk - ConfigWatcher will handle syncing to StateManager
        savePanes(updatedPanes).catch((err) => {
          console.error("Failed to save panes after status update:", err)
        })

        return updatedPanes
      })
    }

    statusDetector.on("status-updated", handleStatusUpdate)

    return () => {
      statusDetector.off("status-updated", handleStatusUpdate)
    }
  }, [setPanes, savePanes])

  // Note: No need to sync panes with StateManager here.
  // The ConfigWatcher automatically updates StateManager when the config file changes.
  // This prevents unnecessary SSE broadcasts on every local state update.

  // Sync settings with StateManager
  useEffect(() => {
    const stateManager = StateManager.getInstance()
    stateManager.updateSettings(projectSettings)
  }, [projectSettings])

  // Expose debug message setter via StateManager
  useEffect(() => {
    const stateManager = StateManager.getInstance()
    stateManager.setDebugMessageCallback(setDebugMessage)
    return () => {
      stateManager.setDebugMessageCallback(undefined)
    }
  }, [])

  // Load panes and settings on mount and refresh periodically
  useEffect(() => {
    // SIGTERM should quit immediately (for process management)
    const handleTermination = () => {
      cleanExit()
    }
    process.on("SIGTERM", handleTermination)

    // Check if tmux supports popups (3.2+) and enable mouse mode for click-outside-to-close
    const popupSupport = supportsPopups()
    setPopupsSupported(popupSupport)
    if (popupSupport) {
      // Enable mouse mode only for this dmux session (not global)
    }

    return () => {
      process.removeListener("SIGTERM", handleTermination)
    }
  }, [])

  // Update checking moved to useAutoUpdater

  // Set default agent choice when detection completes
  useEffect(() => {
    if (agentChoice == null && availableAgents.length > 0) {
      setAgentChoice(availableAgents[0] || "claude")
    }
  }, [availableAgents])

  // Welcome pane is now fully event-based:
  // - Created at startup (in src/index.ts)
  // - Destroyed when first pane is created (in paneCreation.ts)
  // - Recreated when last pane is closed (in paneActions.ts)
  // No polling needed!

  // loadPanes moved to usePanes

  // getPanePositions moved to utils/tmux

  // Navigation logic moved to hook
  const { getCardGridPosition, findCardInDirection } = useNavigation(
    terminalWidth,
    panes.length,
    isLoading
  )

  // findCardInDirection provided by useNavigation

  // savePanes moved to usePanes

  // applySmartLayout moved to utils/tmux

  // Helper function to handle agent choice and pane creation
  const handlePaneCreationWithAgent = async (prompt: string) => {
    const agents = availableAgents
    if (agents.length === 0) {
      await createNewPaneHook(prompt)
    } else if (agents.length === 1) {
      await createNewPaneHook(prompt, agents[0])
    } else {
      // Multiple agents available - check for default agent setting first
      const settings = settingsManager.getSettings()
      if (settings.defaultAgent && agents.includes(settings.defaultAgent)) {
        await createNewPaneHook(prompt, settings.defaultAgent)
      } else {
        // Show agent choice popup
        const selectedAgent = await popupManager.launchAgentChoicePopup()
        if (selectedAgent) {
          await createNewPaneHook(prompt, selectedAgent)
        }
      }
    }
  }

  // Action system - initialized after services are defined
  const actionSystem = useActionSystem({
    panes,
    savePanes,
    sessionName,
    projectName,
    onPaneRemove: (paneId) => {
      // Mark the pane as intentionally closed to prevent race condition with worker
      intentionallyClosedPanes.current.add(paneId)

      // Remove from panes list
      const updatedPanes = panes.filter((p) => p.paneId !== paneId)
      savePanes(updatedPanes)

      // Clean up after a delay
      setTimeout(() => {
        intentionallyClosedPanes.current.delete(paneId)
      }, 5000)
    },
    onActionResult: async (result: ActionResult) => {
      // Handle ActionResults from background callbacks (e.g., conflict resolution completion)
      // This allows showing dialogs even when not in the normal action flow
      if (!popupsSupported) return

      // Handle the result type and show appropriate dialog
      if (result.type === "confirm") {
        const confirmed = await popupManager.launchConfirmPopup(
          result.title || "Confirm",
          result.message,
          result.confirmLabel,
          result.cancelLabel
        )
        if (confirmed && result.onConfirm) {
          await result.onConfirm()
        } else if (!confirmed && result.onCancel) {
          await result.onCancel()
        }
      } else if (
        result.type === "info" ||
        result.type === "success" ||
        result.type === "error"
      ) {
        await popupManager.launchProgressPopup(
          result.message,
          result.type as "info" | "success" | "error",
          3000
        )
      }
    },
    forceRepaint,
    popupLaunchers: popupsSupported
      ? {
          launchConfirmPopup: popupManager.launchConfirmPopup.bind(popupManager),
          launchChoicePopup: popupManager.launchChoicePopup.bind(popupManager),
          launchInputPopup: popupManager.launchInputPopup.bind(popupManager),
          launchProgressPopup:
            popupManager.launchProgressPopup.bind(popupManager),
        }
      : undefined,
  })

  // Auto-show new pane dialog removed - users can press 'n' to create panes via popup

  // Periodic enforcement of control pane size and content pane rebalancing (left sidebar at 40 chars)
  useLayoutManagement({
    controlPaneId,
    hasActiveDialog:
      actionSystem.actionState.showConfirmDialog ||
      actionSystem.actionState.showChoiceDialog ||
      actionSystem.actionState.showInputDialog ||
      actionSystem.actionState.showProgressDialog ||
      !!showCommandPrompt ||
      showFileCopyPrompt ||
      isCreatingPane ||
      runningCommand ||
      isUpdating,
    onForceRepaint: forceRepaint,
  })

  // Monitor agent status across panes (returns a map of pane ID to status)
  const agentStatuses = useAgentStatus({
    panes,
    suspend:
      actionSystem.actionState.showConfirmDialog ||
      actionSystem.actionState.showChoiceDialog ||
      actionSystem.actionState.showInputDialog ||
      actionSystem.actionState.showProgressDialog ||
      !!showCommandPrompt ||
      showFileCopyPrompt,
    onPaneRemoved: (paneId: string) => {
      // Check if this pane was intentionally closed
      // If so, don't re-save - the close action already handled it
      if (intentionallyClosedPanes.current.has(paneId)) {
        return
      }

      // Pane was removed unexpectedly (e.g., user killed tmux pane manually)
      // Remove it from our tracking
      const updatedPanes = panes.filter((p) => p.id !== paneId)
      savePanes(updatedPanes)
    },
  })

  // jumpToPane and runCommand functions removed - now handled by action system and pane runner

  // Update handling moved to useAutoUpdater

  // clearScreen function removed - no longer used (was only used by removed jumpToPane function)

  // Cleanup function for exit
  const cleanExit = () => {
    // Clear screen before exiting Ink
    process.stdout.write("\x1b[2J\x1b[3J\x1b[H")

    // Exit the Ink app (this cleans up the React tree)
    exit()

    // Give Ink a moment to clean up its rendering, then do final cleanup
    setTimeout(() => {
      // Multiple aggressive clearing strategies
      process.stdout.write("\x1b[2J\x1b[H") // Clear screen and move cursor to home
      process.stdout.write("\x1b[3J") // Clear scrollback buffer
      process.stdout.write("\x1b[0m") // Reset all attributes

      // Clear tmux history and pane
      try {
        execSync("tmux clear-history", { stdio: "pipe" })
        execSync("tmux send-keys C-l", { stdio: "pipe" })
      } catch {}

      // One more final clear
      process.stdout.write("\x1b[2J\x1b[H")

      // Show clean goodbye message
      process.stdout.write("\n  Run dmux again to resume. Goodbye 👋\n\n")

      // Exit process
      process.exit(0)
    }, 100)
  }

  // Input handling - extracted to dedicated hook
  useInputHandling({
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
  })

  // Calculate available height for content (terminal height - footer lines - active status messages)
  // Footer height varies based on state:
  // - Quit confirm mode: 2 lines (marginTop + 1 text line)
  // - Normal mode calculation:
  //   - Base: 4 lines (marginTop + logs divider + logs line + keyboard shortcuts)
  //   - Network section: +4 lines (divider, local IP, remote tunnel, divider) if serverPort exists
  //   - Debug info: +1 line if DEBUG_DMUX
  //   - Status line: +1 line if updateAvailable/currentBranch/debugMessage
  //   - Status messages: +1 line per active message
  let footerLines = 2
  if (quitConfirmMode) {
    footerLines = 2
  } else {
    // Base footer (logs divider + logs + shortcuts - always shown)
    footerLines = 4 // marginTop + logs divider + logs + shortcuts
    // Add network section (now 2 lines for local IP + remote tunnel, plus 2 dividers)
    if (serverPort && serverPort > 0) {
      footerLines += 4
    }
    // Add debug info
    if (process.env.DEBUG_DMUX) {
      footerLines += 1
    }
    // Add status line
    if (updateAvailable || currentBranch || debugMessage) {
      footerLines += 1
    }
    // Add line for each active status message
    if (statusMessage) {
      footerLines += 1
    }
    if (actionSystem.actionState.statusMessage) {
      footerLines += 1
    }
  }
  const contentHeight = Math.max(terminalHeight - footerLines, 10)

  return (
    <Box flexDirection="column" height={terminalHeight}>
      {/* CRITICAL: Hidden spinner that forces re-render when shown */}
      {showRepaintSpinner && (
        <Box marginTop={-10} marginLeft={-100}>
          <Text>⟳</Text>
        </Box>
      )}

      {/* Main content area - height dynamically adjusts for status messages */}
      <Box flexDirection="column" height={contentHeight} overflow="hidden">
        <PanesGrid
          panes={panes}
          selectedIndex={selectedIndex}
          isLoading={isLoading}
          agentStatuses={agentStatuses}
        />

        {/* Loading dialog */}
        {isLoading && <LoadingIndicator />}

        {showCommandPrompt && (
          <CommandPromptDialog
            type={showCommandPrompt}
            value={commandInput}
            onChange={setCommandInput}
          />
        )}

        {showFileCopyPrompt && <FileCopyPrompt />}

        {runningCommand && <RunningIndicator />}

        {isUpdating && <UpdatingIndicator />}
      </Box>

      {/* Status messages - only render when present */}
      {statusMessage && (
        <Box>
          <Text color="green">{statusMessage}</Text>
        </Box>
      )}
      {actionSystem.actionState.statusMessage && (
        <Box>
          <Text
            color={
              actionSystem.actionState.statusType === "error"
                ? "red"
                : actionSystem.actionState.statusType === "success"
                ? "green"
                : "cyan"
            }
          >
            {actionSystem.actionState.statusMessage}
          </Text>
        </Box>
      )}

      {/* Footer - always at bottom */}
      <FooterHelp
        show={!showCommandPrompt}
        showRemoteKey={!!server}
        quitConfirmMode={quitConfirmMode}
        hasSidebarLayout={!!controlPaneId}
        serverPort={serverPort}
        unreadErrorCount={unreadErrorCount}
        unreadWarningCount={unreadWarningCount}
        localIp={localIp}
        tunnelUrl={tunnelUrl}
        tunnelCreating={tunnelCreating}
        tunnelCopied={tunnelCopied}
        tunnelSpinner={(() => {
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
        })()}
        gridInfo={(() => {
          if (!process.env.DEBUG_DMUX) return undefined
          const cols = Math.max(1, Math.floor(terminalWidth / 37))
          const rows = Math.ceil((panes.length + 1) / cols)
          const pos = getCardGridPosition(selectedIndex)
          return `Grid: ${cols} cols × ${rows} rows | Selected: row ${pos.row}, col ${pos.col} | Terminal: ${terminalWidth}w`
        })()}
      />

      {/* Status line - only for updates, branch info, and debug messages */}
      {(updateAvailable || currentBranch || debugMessage) && (
        <Text dimColor>
          {updateAvailable && updateInfo && (
            <Text color="red" bold>
              Update available: npm i -g dmux@latest{" "}
            </Text>
          )}
          {currentBranch && (
            <Text color="magenta" bold>
              branch: {currentBranch}
            </Text>
          )}
          {debugMessage && <Text dimColor> • {debugMessage}</Text>}
        </Text>
      )}
    </Box>
  )
}

export default DmuxApp
