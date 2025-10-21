import { execSync } from "child_process"
import type { DmuxPane, ProjectSettings } from "../types.js"
import type { PopupManager } from "./PopupManager.js"
import { StateManager } from "../shared/StateManager.js"
import { PaneAction } from "../actions/index.js"
import { enforceControlPaneSize } from "../utils/tmux.js"
import { suggestCommand } from "../utils/commands.js"

export interface InputHandlerConfig {
  controlPaneId?: string
  sidebarWidth: number
  serverPort?: number
  server?: any
  isLoading: boolean
}

export interface InputHandlerCallbacks {
  setQuitConfirmMode: (mode: boolean) => void
  setShowFileCopyPrompt: (show: boolean) => void
  setShowCommandPrompt: (type: "test" | "dev" | null) => void
  setCommandInput: (input: string) => void
  setCurrentCommandType: (type: "test" | "dev" | null) => void
  setSelectedIndex: (index: number) => void
  setIsCreatingPane: (creating: boolean) => void
  setStatusMessage: (message: string) => void
  cleanExit: () => void
  launchTunnel: () => Promise<void>
}

export interface InputHandlerState {
  quitConfirmMode: boolean
  showFileCopyPrompt: boolean
  showCommandPrompt: "test" | "dev" | null
  commandInput: string
  currentCommandType: "test" | "dev" | null
  selectedIndex: number
  isCreatingPane: boolean
  runningCommand: boolean
  isUpdating: boolean
  tunnelUrl: string | null
  tunnelCreating: boolean
}

export interface InputHandlerDependencies {
  panes: DmuxPane[]
  projectSettings: ProjectSettings
  saveSettings: (settings: ProjectSettings) => Promise<void>
  actionSystem: any
  popupManager: PopupManager
  copyNonGitFiles: (worktreePath: string) => Promise<void>
  runCommandInternal: (type: "test" | "dev", pane: DmuxPane) => Promise<void>
  findCardInDirection: (currentIndex: number, direction: "up" | "down" | "left" | "right") => number | null
  loadPanes: () => Promise<void>
  createNewPaneHook: (prompt: string, agent?: "claude" | "opencode") => Promise<void>
}

export class InputHandler {
  private config: InputHandlerConfig
  private callbacks: InputHandlerCallbacks
  private deps: InputHandlerDependencies

  constructor(
    config: InputHandlerConfig,
    callbacks: InputHandlerCallbacks,
    deps: InputHandlerDependencies
  ) {
    this.config = config
    this.callbacks = callbacks
    this.deps = deps
  }

  /**
   * Main input handler - processes all keyboard input
   */
  async handleInput(input: string, key: any, state: InputHandlerState): Promise<void> {
    // Handle Ctrl+C for quit confirmation (must be first)
    if (key.ctrl && input === "c") {
      if (state.quitConfirmMode) {
        this.callbacks.cleanExit()
      } else {
        this.callbacks.setQuitConfirmMode(true)
        setTimeout(() => this.callbacks.setQuitConfirmMode(false), 3000)
      }
      return
    }

    // Disable input while performing operations or loading
    if (state.isCreatingPane || state.runningCommand || state.isUpdating || this.config.isLoading) {
      return
    }

    // Handle quit confirm mode - ESC cancels it
    if (state.quitConfirmMode) {
      if (key.escape) {
        this.callbacks.setQuitConfirmMode(false)
        return
      }
    }

    // Handle file copy prompt
    if (state.showFileCopyPrompt) {
      await this.handleFileCopyPrompt(input, key, state)
      return
    }

    // Handle command prompt
    if (state.showCommandPrompt) {
      await this.handleCommandPrompt(input, key, state)
      return
    }

    // Handle directional navigation
    if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
      this.handleNavigation(key, state)
      return
    }

    // Handle action shortcuts
    await this.handleActionShortcuts(input, key, state)
  }

  /**
   * Handle file copy prompt (y/n)
   */
  private async handleFileCopyPrompt(input: string, key: any, state: InputHandlerState): Promise<void> {
    if (input === "y" || input === "Y") {
      this.callbacks.setShowFileCopyPrompt(false)
      const selectedPane = this.deps.panes[state.selectedIndex]
      if (selectedPane && selectedPane.worktreePath && state.currentCommandType) {
        await this.deps.copyNonGitFiles(selectedPane.worktreePath)

        // Mark as not first run and continue with command
        const newSettings = {
          ...this.deps.projectSettings,
          [state.currentCommandType === "test" ? "firstTestRun" : "firstDevRun"]: true,
        }
        await this.deps.saveSettings(newSettings)

        // Now run the actual command
        await this.deps.runCommandInternal(state.currentCommandType, selectedPane)
      }
      this.callbacks.setCurrentCommandType(null)
    } else if (input === "n" || input === "N" || key.escape) {
      this.callbacks.setShowFileCopyPrompt(false)
      const selectedPane = this.deps.panes[state.selectedIndex]
      if (selectedPane && state.currentCommandType) {
        // Mark as not first run and continue without copying
        const newSettings = {
          ...this.deps.projectSettings,
          [state.currentCommandType === "test" ? "firstTestRun" : "firstDevRun"]: true,
        }
        await this.deps.saveSettings(newSettings)

        // Now run the actual command
        await this.deps.runCommandInternal(state.currentCommandType, selectedPane)
      }
      this.callbacks.setCurrentCommandType(null)
    }
  }

  /**
   * Handle command prompt (test/dev command input)
   */
  private async handleCommandPrompt(input: string, key: any, state: InputHandlerState): Promise<void> {
    if (key.escape) {
      this.callbacks.setShowCommandPrompt(null)
      this.callbacks.setCommandInput("")
    } else if (key.return) {
      if (state.commandInput.trim() === "") {
        // If empty, suggest a default command based on package manager
        if (state.showCommandPrompt) {
          const suggested = await suggestCommand(state.showCommandPrompt)
          if (suggested) {
            this.callbacks.setCommandInput(suggested)
          }
        }
      } else {
        // User provided manual command
        const newSettings = {
          ...this.deps.projectSettings,
          [state.showCommandPrompt === "test" ? "testCommand" : "devCommand"]:
            state.commandInput.trim(),
        }
        await this.deps.saveSettings(newSettings)
        const selectedPane = this.deps.panes[state.selectedIndex]
        if (selectedPane) {
          // Check if first run
          const isFirstRun =
            state.showCommandPrompt === "test"
              ? !this.deps.projectSettings.firstTestRun
              : !this.deps.projectSettings.firstDevRun
          if (isFirstRun) {
            this.callbacks.setCurrentCommandType(state.showCommandPrompt)
            this.callbacks.setShowCommandPrompt(null)
            this.callbacks.setShowFileCopyPrompt(true)
          } else if (state.showCommandPrompt) {
            await this.deps.runCommandInternal(state.showCommandPrompt, selectedPane)
            this.callbacks.setShowCommandPrompt(null)
            this.callbacks.setCommandInput("")
          }
        } else {
          this.callbacks.setShowCommandPrompt(null)
          this.callbacks.setCommandInput("")
        }
      }
    }
  }

  /**
   * Handle directional navigation (arrow keys)
   */
  private handleNavigation(key: any, state: InputHandlerState): void {
    let targetIndex: number | null = null

    if (key.upArrow) {
      targetIndex = this.deps.findCardInDirection(state.selectedIndex, "up")
    } else if (key.downArrow) {
      targetIndex = this.deps.findCardInDirection(state.selectedIndex, "down")
    } else if (key.leftArrow) {
      targetIndex = this.deps.findCardInDirection(state.selectedIndex, "left")
    } else if (key.rightArrow) {
      targetIndex = this.deps.findCardInDirection(state.selectedIndex, "right")
    }

    if (targetIndex !== null) {
      this.callbacks.setSelectedIndex(targetIndex)
    }
  }

  /**
   * Handle action shortcuts (m, s, l, ?, q, r, n, t, j, x, etc.)
   */
  private async handleActionShortcuts(input: string, key: any, state: InputHandlerState): Promise<void> {
    const selectedPane = this.deps.panes[state.selectedIndex]

    // Kebab menu (m)
    if (input === "m" && state.selectedIndex < this.deps.panes.length) {
      const actionId = await this.deps.popupManager.launchKebabMenuPopup(selectedPane)
      if (actionId) {
        await this.deps.actionSystem.executeAction(actionId, selectedPane, {
          mainBranch: await this.getMainBranch(),
        })
      }
    }
    // Settings (s)
    else if (input === "s") {
      const settingResult = await this.deps.popupManager.launchSettingsPopup(
        async () => {
          await this.deps.popupManager.launchHooksPopup(async () => {
            await this.handleEditHooks()
          })
        }
      )
      if (settingResult) {
        // Handle setting change (already done in popup manager)
        this.callbacks.setStatusMessage(`Setting saved (${settingResult.scope})`)
        setTimeout(() => this.callbacks.setStatusMessage(""), 2000)
      }
    }
    // Logs (l)
    else if (input === "l") {
      await this.deps.popupManager.launchLogsPopup()
    }
    // Shortcuts (?)
    else if (input === "?") {
      await this.deps.popupManager.launchShortcutsPopup(!!this.config.controlPaneId)
    }
    // Reset layout (Shift+L)
    else if (input === "L" && this.config.controlPaneId) {
      enforceControlPaneSize(this.config.controlPaneId, this.config.sidebarWidth)
      this.callbacks.setStatusMessage("Layout reset")
      setTimeout(() => this.callbacks.setStatusMessage(""), 2000)
    }
    // Quit (q)
    else if (input === "q") {
      this.callbacks.cleanExit()
    }
    // Remote tunnel (r)
    else if (input === "r" && this.config.server) {
      if (state.tunnelUrl) {
        // Tunnel exists - open popup with QR code
        await this.deps.popupManager.launchRemotePopup(state.tunnelUrl, () => {
          // onCopied callback - handled by DmuxApp
        })
      } else if (!state.tunnelCreating) {
        // Start tunnel creation
        await this.callbacks.launchTunnel()
      }
    }
    // New pane (n)
    else if (
      !this.config.isLoading &&
      (input === "n" || (key.return && state.selectedIndex === this.deps.panes.length))
    ) {
      await this.handleNewPane()
    }
    // Terminal pane (t)
    else if (
      !this.config.isLoading &&
      (input === "t" || (key.return && state.selectedIndex === this.deps.panes.length + 1))
    ) {
      await this.handleNewTerminalPane()
    }
    // Jump to pane (j)
    else if (input === "j" && state.selectedIndex < this.deps.panes.length) {
      StateManager.getInstance().setDebugMessage(
        `Jumping to pane: ${selectedPane.slug}`
      )
      setTimeout(() => StateManager.getInstance().setDebugMessage(""), 2000)
      await this.deps.actionSystem.executeAction(PaneAction.VIEW, selectedPane)
    }
    // Close pane (x)
    else if (input === "x" && state.selectedIndex < this.deps.panes.length) {
      StateManager.getInstance().setDebugMessage(
        `Closing pane: ${selectedPane.slug}`
      )
      setTimeout(() => StateManager.getInstance().setDebugMessage(""), 2000)
      await this.deps.actionSystem.executeAction(PaneAction.CLOSE, selectedPane)
    }
    // Enter to jump
    else if (key.return && state.selectedIndex < this.deps.panes.length) {
      StateManager.getInstance().setDebugMessage(
        `Jumping to pane: ${selectedPane.slug}`
      )
      setTimeout(() => StateManager.getInstance().setDebugMessage(""), 2000)
      await this.deps.actionSystem.executeAction(PaneAction.VIEW, selectedPane)
    }
  }

  /**
   * Handle new pane creation
   */
  private async handleNewPane(): Promise<void> {
    const promptValue = await this.deps.popupManager.launchNewPanePopup()
    if (!promptValue) return

    const agents = ["claude", "opencode"] // Will be from config in real implementation

    if (agents.length === 0) {
      await this.deps.createNewPaneHook(promptValue)
    } else if (agents.length === 1) {
      await this.deps.createNewPaneHook(promptValue, agents[0] as "claude" | "opencode")
    } else {
      // Multiple agents available - check for default agent setting first
      // This logic will be handled by settings manager in real implementation
      const selectedAgent = await this.deps.popupManager.launchAgentChoicePopup()
      if (selectedAgent) {
        await this.deps.createNewPaneHook(promptValue, selectedAgent)
      }
    }
  }

  /**
   * Handle new terminal pane creation (no agent)
   */
  private async handleNewTerminalPane(): Promise<void> {
    try {
      this.callbacks.setIsCreatingPane(true)
      this.callbacks.setStatusMessage("Creating terminal pane...")

      // Create a simple tmux pane split
      execSync(`tmux split-window -h -P -F '#{pane_id}'`, {
        encoding: "utf-8",
      })

      // Wait for pane creation to settle
      await new Promise((resolve) => setTimeout(resolve, 300))

      // The shell pane will be automatically detected by the shell pane detection system
      this.callbacks.setIsCreatingPane(false)
      this.callbacks.setStatusMessage("Terminal pane created")
      setTimeout(() => this.callbacks.setStatusMessage(""), 2000)

      // Force a reload to pick up the new shell pane
      await this.deps.loadPanes()
    } catch (error: any) {
      this.callbacks.setIsCreatingPane(false)
      this.callbacks.setStatusMessage(`Failed to create terminal pane: ${error.message}`)
      setTimeout(() => this.callbacks.setStatusMessage(""), 3000)
    }
  }

  /**
   * Handle edit hooks action
   */
  private async handleEditHooks(): Promise<void> {
    const prompt =
      "I would like to edit my dmux hooks in .dmux-hooks, please read the instructions in there and ask me what I want to edit"

    const agents = ["claude", "opencode"] // Will be from config in real implementation

    if (agents.length === 0) {
      await this.deps.createNewPaneHook(prompt)
    } else if (agents.length === 1) {
      await this.deps.createNewPaneHook(prompt, agents[0] as "claude" | "opencode")
    } else {
      const selectedAgent = await this.deps.popupManager.launchAgentChoicePopup()
      if (selectedAgent) {
        await this.deps.createNewPaneHook(prompt, selectedAgent)
      }
    }
  }

  /**
   * Get main branch name
   */
  private async getMainBranch(): Promise<string> {
    const { getMainBranch } = await import("../utils/git.js")
    return getMainBranch()
  }
}
