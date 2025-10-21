import { execSync } from "child_process"
import path from "path"
import type { DmuxPane } from "../types.js"
import { generateSlug } from "../utils/slug.js"
import { enforceControlPaneSize } from "../utils/tmux.js"
import { capturePaneContent } from "../utils/paneCapture.js"

export interface PaneCreationConfig {
  projectName: string
  sidebarWidth: number
  controlPaneId?: string
  dmuxVersion: string
}

export interface PaneCreationCallbacks {
  setStatusMessage: (message: string) => void
  savePanes: (panes: DmuxPane[]) => Promise<void>
  loadPanes: () => Promise<void>
}

export class PaneCreationService {
  private config: PaneCreationConfig
  private callbacks: PaneCreationCallbacks

  constructor(config: PaneCreationConfig, callbacks: PaneCreationCallbacks) {
    this.config = config
    this.callbacks = callbacks
  }

  /**
   * Create a new pane with agent
   */
  async createPane(
    prompt: string,
    agent: "claude" | "opencode" | undefined,
    existingPanes: DmuxPane[]
  ): Promise<DmuxPane> {
    this.callbacks.setStatusMessage("Generating slug...")

    const slug = await generateSlug(prompt)

    this.callbacks.setStatusMessage(`Creating worktree: ${slug}...`)

    // Get git root directory for consistent worktree placement
    const projectRoot = this.getGitRoot()
    const worktreePath = path.join(projectRoot, ".dmux", "worktrees", slug)

    // Get the original pane ID (where dmux is running)
    const originalPaneId = this.getCurrentPaneId()

    // Minimal screen clearing
    this.clearScreen()

    // Enable pane borders to show titles
    this.enablePaneBorders()

    // Create new tmux pane
    const paneInfo = this.createTmuxPane()

    // Wait for pane creation to settle
    await this.delay(500)

    // Set pane title to match the slug
    this.setPaneTitle(paneInfo, slug)

    // Enforce sidebar width only (don't apply global layouts)
    if (this.config.controlPaneId) {
      enforceControlPaneSize(this.config.controlPaneId, this.config.sidebarWidth)
    }

    // Create git worktree and cd into it
    await this.createWorktree(paneInfo, worktreePath, slug)

    this.callbacks.setStatusMessage(
      agent
        ? `Worktree created, launching ${
            agent === "opencode" ? "opencode" : "Claude"
          }...`
        : "Worktree created."
    )

    // Launch agent if specified
    if (agent) {
      await this.launchAgent(paneInfo, agent, prompt)
    }

    // Keep focus on the new pane
    this.selectPane(paneInfo)

    // Save pane info
    const newPane: DmuxPane = {
      id: `dmux-${Date.now()}`,
      slug,
      prompt: prompt || "No initial prompt",
      paneId: paneInfo,
      worktreePath,
      agent,
    }

    const updatedPanes = [...existingPanes, newPane]
    await this.callbacks.savePanes(updatedPanes)

    // Switch back to the original pane (where dmux is running)
    this.selectPane(originalPaneId)

    // Re-set the title for the dmux pane
    this.setPaneTitle(
      originalPaneId,
      `dmux v${this.config.dmuxVersion} - ${this.config.projectName}`
    )

    // Clear the screen and redraw the UI
    this.clearScreen()

    this.callbacks.setStatusMessage("")

    // Force a reload of panes to ensure UI is up to date
    await this.callbacks.loadPanes()

    return newPane
  }

  /**
   * Get git root directory
   */
  private getGitRoot(): string {
    try {
      return execSync("git rev-parse --show-toplevel", {
        encoding: "utf-8",
        stdio: "pipe",
      }).trim()
    } catch {
      // Fallback to current directory if not in a git repo
      return process.cwd()
    }
  }

  /**
   * Get current tmux pane ID
   */
  private getCurrentPaneId(): string {
    return execSync('tmux display-message -p "#{pane_id}"', {
      encoding: "utf-8",
    }).trim()
  }

  /**
   * Clear screen with minimal clearing
   */
  private clearScreen(): void {
    process.stdout.write("\x1b[2J\x1b[H")
  }

  /**
   * Enable pane borders to show titles
   */
  private enablePaneBorders(): void {
    try {
      execSync(`tmux set-option -g pane-border-status top`, { stdio: "pipe" })
    } catch {
      // Ignore if already set or fails
    }
  }

  /**
   * Create new tmux pane
   */
  private createTmuxPane(): string {
    return execSync(`tmux split-window -h -P -F '#{pane_id}'`, {
      encoding: "utf-8",
    }).trim()
  }

  /**
   * Set pane title
   */
  private setPaneTitle(paneId: string, title: string): void {
    try {
      execSync(`tmux select-pane -t '${paneId}' -T "${title}"`, {
        stdio: "pipe",
      })
    } catch {
      // Ignore if setting title fails
    }
  }

  /**
   * Select/focus a pane
   */
  private selectPane(paneId: string): void {
    try {
      execSync(`tmux select-pane -t '${paneId}'`, { stdio: "pipe" })
    } catch {
      // Ignore errors
    }
  }

  /**
   * Create git worktree and cd into it
   */
  private async createWorktree(
    paneId: string,
    worktreePath: string,
    slug: string
  ): Promise<void> {
    try {
      // Create worktree and cd into it as a single command
      // Use ; instead of && to ensure cd runs even if worktree already exists
      const worktreeCmd = `git worktree add "${worktreePath}" -b ${slug} 2>/dev/null ; cd "${worktreePath}"`
      execSync(`tmux send-keys -t '${paneId}' '${worktreeCmd}' Enter`, {
        stdio: "pipe",
      })

      // Wait for worktree creation and cd to complete
      // This is critical - if we don't wait long enough, agents will start in wrong directory
      await this.delay(2500)

      // Verify we're in the worktree directory by sending pwd command
      execSync(
        `tmux send-keys -t '${paneId}' 'echo "Worktree created at:" && pwd' Enter`,
        { stdio: "pipe" }
      )
      await this.delay(500)
    } catch (error) {
      // Log error but continue - worktree creation is essential
      this.callbacks.setStatusMessage(`Warning: Worktree issue: ${error}`)
      // Even if worktree creation failed, try to cd to the directory in case it exists
      execSync(
        `tmux send-keys -t '${paneId}' 'cd "${worktreePath}" 2>/dev/null || (echo "ERROR: Failed to create/enter worktree ${slug}" && pwd)' Enter`,
        { stdio: "pipe" }
      )
      await this.delay(1000)
    }
  }

  /**
   * Launch agent (Claude or opencode) with prompt
   */
  private async launchAgent(
    paneId: string,
    agent: "claude" | "opencode",
    prompt: string
  ): Promise<void> {
    if (agent === "claude") {
      await this.launchClaude(paneId, prompt)
    } else if (agent === "opencode") {
      await this.launchOpencode(paneId, prompt)
    }
  }

  /**
   * Launch Claude Code with auto-approval of trust prompts
   */
  private async launchClaude(paneId: string, prompt: string): Promise<void> {
    // Build Claude command
    let claudeCmd: string
    if (prompt && prompt.trim()) {
      const escapedPrompt = this.escapeShellString(prompt)
      claudeCmd = `claude "${escapedPrompt}" --permission-mode=acceptEdits`
    } else {
      claudeCmd = `claude --permission-mode=acceptEdits`
    }

    // Send Claude command to new pane
    const escapedCmd = claudeCmd.replace(/'/g, "'\\''")
    execSync(`tmux send-keys -t '${paneId}' '${escapedCmd}'`, {
      stdio: "pipe",
    })
    execSync(`tmux send-keys -t '${paneId}' Enter`, { stdio: "pipe" })

    // Monitor for Claude Code trust prompt and auto-respond
    this.autoApproveTrustPrompt(paneId, escapedCmd, prompt)
  }

  /**
   * Launch opencode with prompt submission
   */
  private async launchOpencode(paneId: string, prompt: string): Promise<void> {
    const openCoderCmd = `opencode`
    const escapedOpenCmd = openCoderCmd.replace(/'/g, "'\\''")
    execSync(`tmux send-keys -t '${paneId}' '${escapedOpenCmd}'`, {
      stdio: "pipe",
    })
    execSync(`tmux send-keys -t '${paneId}' Enter`, { stdio: "pipe" })

    if (prompt && prompt.trim()) {
      await this.delay(1500)
      const bufName = `dmux_prompt_${Date.now()}`
      const promptEsc = prompt.replace(/\\/g, "\\\\").replace(/'/g, "'\\''")
      execSync(`tmux set-buffer -b '${bufName}' -- '${promptEsc}'`, {
        stdio: "pipe",
      })
      execSync(`tmux paste-buffer -b '${bufName}' -t '${paneId}'`, {
        stdio: "pipe",
      })
      await this.delay(200)
      execSync(`tmux delete-buffer -b '${bufName}'`, { stdio: "pipe" })
      execSync(`tmux send-keys -t '${paneId}' Enter`, { stdio: "pipe" })
    }
  }

  /**
   * Auto-approve Claude Code trust prompts
   */
  private async autoApproveTrustPrompt(
    paneId: string,
    escapedCmd: string,
    prompt: string
  ): Promise<void> {
    // Wait for Claude to start up before checking for prompts
    await this.delay(800)

    const maxChecks = 100 // 100 checks * 100ms = 10 seconds total
    const checkInterval = 100 // Check every 100ms
    let lastContent = ""
    let stableContentCount = 0
    let promptHandled = false

    // Trust prompt patterns
    const trustPromptPatterns = [
      /Do you trust the files in this folder\?/i,
      /Trust the files in this workspace\?/i,
      /Do you trust the authors of the files/i,
      /Do you want to trust this workspace\?/i,
      /trust.*files.*folder/i,
      /trust.*workspace/i,
      /Do you trust/i,
      /Trust this folder/i,
      /trust.*directory/i,
      /permission.*grant/i,
      /allow.*access/i,
      /workspace.*trust/i,
      /accept.*edits/i,
      /permission.*mode/i,
      /allow.*claude/i,
      /\[y\/n\]/i,
      /\(y\/n\)/i,
      /Yes\/No/i,
      /\[Y\/n\]/i,
      /press.*enter.*accept/i,
      /press.*enter.*continue/i,
      /❯\s*1\.\s*Yes,\s*proceed/i,
      /Enter to confirm.*Esc to exit/i,
      /1\.\s*Yes,\s*proceed/i,
      /2\.\s*No,\s*exit/i,
    ]

    for (let i = 0; i < maxChecks; i++) {
      await this.delay(checkInterval)

      try {
        const paneContent = capturePaneContent(paneId, 30)

        // Check if content has stabilized (same for 3 checks = prompt is waiting)
        if (paneContent === lastContent) {
          stableContentCount++
        } else {
          stableContentCount = 0
          lastContent = paneContent
        }

        // Look for trust prompt in the current content
        const hasTrustPrompt = trustPromptPatterns.some((pattern) =>
          pattern.test(paneContent)
        )

        // Also check if we see specific Claude permission text
        const hasClaudePermissionPrompt =
          paneContent.includes("Do you trust") ||
          paneContent.includes("trust the files") ||
          paneContent.includes("permission") ||
          paneContent.includes("allow") ||
          (paneContent.includes("folder") && paneContent.includes("?"))

        if ((hasTrustPrompt || hasClaudePermissionPrompt) && !promptHandled) {
          // Content is stable and we found a prompt
          if (stableContentCount >= 2) {
            // Check if this is the new Claude numbered menu format
            const isNewClaudeFormat =
              /❯\s*1\.\s*Yes,\s*proceed/i.test(paneContent) ||
              /Enter to confirm.*Esc to exit/i.test(paneContent)

            if (isNewClaudeFormat) {
              // For new Claude format, just press Enter to confirm default "Yes, proceed"
              execSync(`tmux send-keys -t '${paneId}' Enter`, {
                stdio: "pipe",
              })
            } else {
              // Try multiple response methods for older formats
              // Method 1: Send 'y' followed by Enter (most explicit)
              execSync(`tmux send-keys -t '${paneId}' 'y'`, {
                stdio: "pipe",
              })
              await this.delay(50)
              execSync(`tmux send-keys -t '${paneId}' Enter`, {
                stdio: "pipe",
              })

              // Method 2: Just Enter (if it's a yes/no with default yes)
              await this.delay(100)
              execSync(`tmux send-keys -t '${paneId}' Enter`, {
                stdio: "pipe",
              })
            }

            // Mark as handled to avoid duplicate responses
            promptHandled = true

            // Wait and check if prompt is gone
            await this.delay(500)

            // Verify the prompt is gone
            const updatedContent = capturePaneContent(paneId, 10)

            // If trust prompt is gone, check if we need to resend the Claude command
            const promptGone = !trustPromptPatterns.some((p) =>
              p.test(updatedContent)
            )

            if (promptGone) {
              // Check if Claude is running or if we need to restart it
              const claudeRunning =
                updatedContent.includes("Claude") ||
                updatedContent.includes("claude") ||
                updatedContent.includes("Assistant") ||
                (prompt &&
                  updatedContent.includes(
                    prompt.substring(0, Math.min(20, prompt.length))
                  ))

              if (!claudeRunning && !updatedContent.includes("$")) {
                await this.delay(300)
                execSync(`tmux send-keys -t '${paneId}' '${escapedCmd}'`, {
                  stdio: "pipe",
                })
                execSync(`tmux send-keys -t '${paneId}' Enter`, {
                  stdio: "pipe",
                })
              }

              break
            }
          }
        }

        // If we see Claude is already running without prompts, we're done
        if (
          !hasTrustPrompt &&
          !hasClaudePermissionPrompt &&
          (paneContent.includes("Claude") || paneContent.includes("Assistant"))
        ) {
          break
        }
      } catch (error) {
        // Continue checking, errors are non-fatal
      }
    }
  }

  /**
   * Escape shell string for safe command execution
   */
  private escapeShellString(str: string): string {
    return str
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/`/g, "\\`")
      .replace(/\$/g, "\\$")
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
