import path from "path"
import fs from "fs/promises"
import { execSync } from "child_process"
import { fileURLToPath } from "url"
import { dirname } from "path"
import {
  launchNodePopupNonBlocking,
  POPUP_POSITIONING,
  type PopupResult,
} from "../utils/popup.js"
import { StateManager } from "../shared/StateManager.js"
import { LogService } from "./LogService.js"
import { SETTING_DEFINITIONS } from "../utils/settingsManager.js"
import type { DmuxPane, ProjectSettings } from "../types.js"
import { getAvailableActions, type PaneAction } from "../actions/index.js"
import { INPUT_IGNORE_DELAY } from "../constants/timing.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export interface PopupManagerConfig {
  sidebarWidth: number
  projectRoot: string
  popupsSupported: boolean
  terminalWidth: number
  terminalHeight: number
  availableAgents: Array<"claude" | "opencode">
  agentChoice: "claude" | "opencode" | null
  serverPort?: number
  server?: any
  settingsManager: any
  projectSettings: ProjectSettings
}

interface PopupOptions {
  width: number
  height: number
  title: string
  positioning?: "standard" | "centered" | "large"
}

export class PopupManager {
  private config: PopupManagerConfig
  private setStatusMessage: (msg: string) => void
  private setIgnoreInput: (ignore: boolean) => void

  constructor(
    config: PopupManagerConfig,
    setStatusMessage: (msg: string) => void,
    setIgnoreInput: (ignore: boolean) => void
  ) {
    this.config = config
    this.setStatusMessage = setStatusMessage
    this.setIgnoreInput = setIgnoreInput
  }

  /**
   * Get the popup script path from project root
   */
  private getPopupScriptPath(scriptName: string): string {
    const projectRootForPopup = __dirname.includes("/dist")
      ? path.resolve(__dirname, "../..") // If in dist/services/, go up two levels
      : path.resolve(__dirname, "../..") // If in src/services/, go up two levels

    return path.join(projectRootForPopup, "dist", "components", "popups", scriptName)
  }

  /**
   * Show temporary status message
   */
  private showTempMessage(message: string, duration: number = 3000) {
    this.setStatusMessage(message)
    setTimeout(() => this.setStatusMessage(""), duration)
  }

  /**
   * Check if popups are supported
   */
  private checkPopupSupport(): boolean {
    if (!this.config.popupsSupported) {
      this.showTempMessage("Popups require tmux 3.2+")
      return false
    }
    return true
  }

  /**
   * Ignore input briefly after popup closes to prevent buffered keys
   */
  private ignoreInputBriefly() {
    this.setIgnoreInput(true)
    setTimeout(() => this.setIgnoreInput(false), INPUT_IGNORE_DELAY)
  }

  /**
   * Generic popup launcher with common logic
   */
  private async launchPopup<T>(
    scriptName: string,
    args: string[],
    options: PopupOptions,
    tempData?: any
  ): Promise<PopupResult<T>> {
    const popupScriptPath = this.getPopupScriptPath(scriptName)
    let tempFile: string | null = null

    try {
      // Write temp file if data provided
      if (tempData !== undefined) {
        tempFile = `/tmp/dmux-${scriptName.replace(".js", "")}-${Date.now()}.json`
        await fs.writeFile(tempFile, JSON.stringify(tempData))
        args = [tempFile, ...args]
      }

      // Get positioning
      let positioning
      if (options.positioning === "large") {
        const tmuxDims = execSync(
          'tmux display-message -p "#{client_width},#{client_height}"',
          { encoding: "utf-8" }
        ).trim()
        const [termWidth, termHeight] = tmuxDims.split(",").map(Number)
        positioning = POPUP_POSITIONING.large(
          this.config.sidebarWidth,
          termWidth,
          termHeight
        )
      } else if (options.positioning === "centered") {
        positioning = POPUP_POSITIONING.centeredWithSidebar(
          this.config.sidebarWidth
        )
      } else {
        positioning = POPUP_POSITIONING.standard(this.config.sidebarWidth)
      }

      // Launch popup
      const popupHandle = launchNodePopupNonBlocking<T>(popupScriptPath, args, {
        ...positioning,
        width: options.width,
        height: options.height,
        title: options.title,
      })

      // Wait for result
      const result = await popupHandle.resultPromise

      // Clean up temp file
      if (tempFile) {
        try {
          await fs.unlink(tempFile)
        } catch {
          // Intentionally silent - temp file cleanup is optional
        }
      }

      return result
    } catch (error: any) {
      // Clean up temp file on error
      if (tempFile) {
        try {
          await fs.unlink(tempFile)
        } catch {
          // Intentionally silent - temp file cleanup is optional
        }
      }
      throw error
    }
  }

  /**
   * Handle standard popup result (success/cancelled/error)
   */
  private handleResult<T>(
    result: PopupResult<T>,
    onSuccess?: (data: T) => T | null,
    onError?: (error: string) => void
  ): T | null {
    if (result.success && result.data !== undefined) {
      return onSuccess ? onSuccess(result.data) : result.data
    } else if (result.cancelled) {
      return null
    } else if (result.error) {
      const errorMsg = `Popup error: ${result.error}`
      if (onError) {
        onError(errorMsg)
      } else {
        this.showTempMessage(errorMsg)
      }
      return null
    }
    return null
  }

  async launchNewPanePopup(): Promise<string | null> {
    if (!this.checkPopupSupport()) return null

    try {
      const popupHeight = Math.floor(this.config.terminalHeight * 0.8)
      const result = await this.launchPopup<string>(
        "newPanePopup.js",
        [],
        {
          width: 90,
          height: popupHeight,
          title: "  ✨ dmux - Create New Pane  ",
          positioning: "centered",
        }
      )

      this.ignoreInputBriefly()
      return this.handleResult(result)
    } catch (error: any) {
      this.showTempMessage(`Failed to launch popup: ${error.message}`)
      return null
    }
  }

  async launchKebabMenuPopup(pane: DmuxPane): Promise<PaneAction | null> {
    if (!this.checkPopupSupport()) return null

    try {
      const actions = getAvailableActions(pane, this.config.projectSettings)
      const result = await this.launchPopup<string>(
        "kebabMenuPopup.js",
        [pane.slug, JSON.stringify(actions)],
        {
          width: 60,
          height: Math.min(20, actions.length + 5),
          title: `Menu: ${pane.slug}`,
        }
      )

      const actionId = this.handleResult(
        result,
        (data) => {
          LogService.getInstance().debug(`Action selected: ${data}`, "KebabMenu")
          return data
        },
        (error) => {
          LogService.getInstance().error(error, "KebabMenu")
          this.showTempMessage(error)
        }
      )
      return actionId as PaneAction | null
    } catch (error: any) {
      this.showTempMessage(`Failed to launch popup: ${error.message}`)
      return null
    }
  }

  async launchConfirmPopup(
    title: string,
    message: string,
    yesLabel?: string,
    noLabel?: string
  ): Promise<boolean> {
    if (!this.checkPopupSupport()) return false

    try {
      const result = await this.launchPopup<boolean>(
        "confirmPopup.js",
        [],
        {
          width: 60,
          height: 12,
          title: title || "Confirm",
        },
        { title, message, yesLabel, noLabel }
      )

      return this.handleResult(result) ?? false
    } catch (error: any) {
      this.showTempMessage(`Failed to launch popup: ${error.message}`)
      return false
    }
  }

  async launchAgentChoicePopup(): Promise<"claude" | "opencode" | null> {
    if (!this.checkPopupSupport()) return null

    try {
      const agentsJson = JSON.stringify(this.config.availableAgents)
      const defaultAgent =
        this.config.agentChoice || this.config.availableAgents[0] || "claude"

      const result = await this.launchPopup<"claude" | "opencode">(
        "agentChoicePopup.js",
        [agentsJson, defaultAgent],
        {
          width: 50,
          height: 10,
          title: "Select Agent",
        }
      )

      return this.handleResult(result)
    } catch (error: any) {
      this.showTempMessage(`Failed to launch popup: ${error.message}`)
      return null
    }
  }

  async launchHooksPopup(
    onEditHooks: () => Promise<void>
  ): Promise<void> {
    if (!this.checkPopupSupport()) return

    try {
      const { hasHook } = await import("../utils/hooks.js")
      const allHookTypes = [
        "before_pane_create",
        "pane_created",
        "worktree_created",
        "before_pane_close",
        "pane_closed",
        "before_worktree_remove",
        "worktree_removed",
        "pre_merge",
        "post_merge",
        "run_test",
        "run_dev",
      ]

      const hooks = allHookTypes.map((hookName) => ({
        name: hookName,
        active: hasHook(
          this.config.projectRoot || process.cwd(),
          hookName as any
        ),
      }))

      const result = await this.launchPopup<{ action?: "edit" | "view" }>(
        "hooksPopup.js",
        [JSON.stringify(hooks)],
        {
          width: 70,
          height: 24,
          title: "🪝 Manage Hooks",
        }
      )

      const data = this.handleResult(result)
      if (data?.action === "edit") {
        await onEditHooks()
      } else if (data?.action === "view") {
        this.showTempMessage("View in editor not yet implemented", 2000)
      }
    } catch (error: any) {
      this.showTempMessage(`Failed to launch popup: ${error.message}`)
    }
  }

  async launchLogsPopup(): Promise<void> {
    if (!this.checkPopupSupport()) return

    try {
      const stateManager = StateManager.getInstance()
      const logsData = {
        logs: stateManager.getLogs(),
        stats: stateManager.getLogStats(),
      }

      const result = await this.launchPopup<void>(
        "logsPopup.js",
        [],
        {
          width: 90,
          height: 35,
          title: "🪵 dmux Logs",
          positioning: "large",
        },
        logsData
      )

      if (result.success) {
        stateManager.markAllLogsAsRead()
      }
    } catch (error: any) {
      this.showTempMessage(`Failed to launch popup: ${error.message}`)
    }
  }

  async launchShortcutsPopup(hasSidebarLayout: boolean): Promise<void> {
    if (!this.checkPopupSupport()) return

    try {
      await this.launchPopup<void>(
        "shortcutsPopup.js",
        [],
        {
          width: 50,
          height: 20,
          title: "⌨️  Keyboard Shortcuts",
        },
        {
          hasSidebarLayout,
          showRemoteKey: !!this.config.server,
        }
      )
    } catch (error: any) {
      this.showTempMessage(`Failed to launch popup: ${error.message}`)
    }
  }

  async launchRemotePopup(
    tunnelUrl: string,
    onCopied: () => void
  ): Promise<void> {
    if (!this.checkPopupSupport()) return
    if (!this.config.server || !this.config.serverPort || !tunnelUrl) {
      this.showTempMessage("Tunnel not ready")
      return
    }

    try {
      // Prepare status file with existing tunnel URL
      const tunnelStatusFile = `/tmp/dmux-tunnel-status-${Date.now()}.json`
      await fs.writeFile(tunnelStatusFile, JSON.stringify({ url: tunnelUrl }))

      const result = await this.launchPopup<{ closed: boolean; copied: boolean }>(
        "remotePopup.js",
        [],
        {
          width: 60,
          height: 30,
          title: "🌐 Remote Access",
          positioning: "centered",
        },
        {
          loading: false,
          serverPort: this.config.serverPort,
          statusFile: tunnelStatusFile,
        }
      )

      // Clean up status file
      try {
        await fs.unlink(tunnelStatusFile)
      } catch {
        // Intentionally silent - status file cleanup is optional
      }

      if (result && (result as any).copied) {
        onCopied()
      }
    } catch (error: any) {
      this.showTempMessage(`Failed to launch popup: ${error.message}`)
    }
  }

  async launchSettingsPopup(
    onLaunchHooks: () => Promise<void>
  ): Promise<{ key: string; value: any; scope: "global" | "project" } | null> {
    if (!this.checkPopupSupport()) return null

    try {
      const result = await this.launchPopup<any>(
        "settingsPopup.js",
        [
          JSON.stringify({
            settingDefinitions: SETTING_DEFINITIONS,
            settings: this.config.settingsManager.getSettings(),
            globalSettings: this.config.settingsManager.getGlobalSettings(),
            projectSettings: this.config.settingsManager.getProjectSettings(),
          }),
        ],
        {
          width: 70,
          height: Math.min(25, SETTING_DEFINITIONS.length + 8),
          title: "⚙️  Settings",
        }
      )

      if (result.success) {
        // Check if this is an action result
        if ((result as any).action === "hooks") {
          await onLaunchHooks()
          return null
        } else if (result.data) {
          return result.data
        }
      }
      return null
    } catch (error: any) {
      this.showTempMessage(`Failed to launch popup: ${error.message}`)
      return null
    }
  }


  async launchChoicePopup(
    title: string,
    message: string,
    options: Array<{
      id: string
      label: string
      description?: string
      danger?: boolean
      default?: boolean
    }>
  ): Promise<string | null> {
    if (!this.checkPopupSupport()) return null

    try {
      const result = await this.launchPopup<string>(
        "choicePopup.js",
        [],
        {
          width: 70,
          height: Math.min(25, options.length * 3 + 8),
          title: title || "Choose Option",
        },
        { title, message, options }
      )

      return this.handleResult(result)
    } catch (error: any) {
      this.showTempMessage(`Failed to launch popup: ${error.message}`)
      return null
    }
  }

  async launchInputPopup(
    title: string,
    message: string,
    placeholder?: string,
    defaultValue?: string
  ): Promise<string | null> {
    if (!this.checkPopupSupport()) return null

    try {
      const result = await this.launchPopup<string>(
        "inputPopup.js",
        [],
        {
          width: 70,
          height: 15,
          title: title || "Input",
        },
        { title, message, placeholder, defaultValue }
      )

      return this.handleResult(result)
    } catch (error: any) {
      this.showTempMessage(`Failed to launch popup: ${error.message}`)
      return null
    }
  }

  async launchProgressPopup(
    message: string,
    type: "info" | "success" | "error" = "info",
    timeout: number = 2000
  ): Promise<void> {
    if (!this.config.popupsSupported) {
      this.showTempMessage(message, timeout)
      return
    }

    try {
      const lines = Math.ceil(message.length / 60) + 3
      const titleText =
        type === "success"
          ? "✓ Success"
          : type === "error"
          ? "✗ Error"
          : "ℹ Info"

      await this.launchPopup<void>(
        "progressPopup.js",
        [],
        {
          width: 70,
          height: Math.min(15, lines + 4),
          title: titleText,
        },
        { message, type, timeout }
      )
    } catch (error: any) {
      this.showTempMessage(message, timeout)
    }
  }
}
