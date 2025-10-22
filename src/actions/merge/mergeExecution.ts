/**
 * Merge Execution - UI logic for merge execution workflows
 *
 * This module handles ActionResult flows for executing merges with
 * conflict handling, cleanup, and post-merge actions.
 */

import type { ActionResult, ActionContext } from "../types.js"
import type { DmuxPane } from "../../types.js"
import { triggerHook } from "../../utils/hooks.js"

/**
 * Execute merge with conflict handling
 */
export async function executeMergeWithConflictHandling(
  pane: DmuxPane,
  context: ActionContext,
  mainBranch: string,
  mainRepoPath: string,
  strategy: "manual" | "ai"
): Promise<ActionResult> {
  const { mergeMainIntoWorktree, completeMerge } = await import(
    "../../utils/mergeExecution.js"
  )

  // Step 1: Merge main into worktree
  const result = mergeMainIntoWorktree(pane.worktreePath!, mainBranch)

  if (!result.success && result.needsManualResolution) {
    if (strategy === "ai") {
      // Try AI resolution
      const { aiResolveAllConflicts } = await import("../../utils/aiMerge.js")
      const aiResult = await aiResolveAllConflicts(
        pane.worktreePath!,
        result.conflictFiles || []
      )

      if (aiResult.success) {
        // AI resolved all conflicts, complete the merge
        const completeResult = completeMerge(
          pane.worktreePath!,
          "Merge with AI-resolved conflicts"
        )

        if (completeResult.success) {
          // Continue with the second phase of merge
          return executeMerge(pane, context, mainBranch, mainRepoPath)
        } else {
          return {
            type: "error",
            message: `Failed to complete merge: ${completeResult.error}`,
            dismissable: true,
          }
        }
      } else {
        // AI couldn't resolve, fall back to manual
        return {
          type: "error",
          title: "AI Merge Failed",
          message: `AI couldn't resolve conflicts in: ${aiResult.failedFiles.join(
            ", "
          )}.\nPlease resolve manually.`,
          dismissable: true,
        }
      }
    } else {
      // Manual resolution - jump to pane
      return {
        type: "navigation",
        title: "Manual Conflict Resolution",
        message: `Conflicts in: ${result.conflictFiles?.join(
          ", "
        )}.\nResolve in the pane, then try merge again.`,
        targetPaneId: pane.id,
        dismissable: true,
      }
    }
  }

  if (!result.success) {
    return {
      type: "error",
      message: `Merge failed: ${result.error}`,
      dismissable: true,
    }
  }

  // No conflicts, proceed with the main merge
  return executeMerge(pane, context, mainBranch, mainRepoPath)
}

/**
 * Execute the actual merge operation (called after all pre-checks pass)
 * This implements the 2-phase merge:
 * 1. Merge main INTO worktree (to get latest changes and detect conflicts)
 * 2. Merge worktree INTO main (to bring changes back)
 *
 * @param skipWorktreeMerge - Set to true when resuming after conflict resolution (step 1 already done)
 */
export async function executeMerge(
  pane: DmuxPane,
  context: ActionContext,
  mainBranch: string,
  mainRepoPath: string,
  skipWorktreeMerge: boolean = false
): Promise<ActionResult> {
  const { mergeMainIntoWorktree, mergeWorktreeIntoMain } = await import(
    "../../utils/mergeExecution.js"
  )

  // Step 1: Merge main into worktree first (get latest changes from main)
  // Skip this if we're resuming after conflict resolution (already done by agent)
  if (!skipWorktreeMerge) {
    const step1 = mergeMainIntoWorktree(pane.worktreePath!, mainBranch)

    if (!step1.success) {
      // Check if this is a conflict that needs manual resolution
      if (
        step1.needsManualResolution &&
        step1.conflictFiles &&
        step1.conflictFiles.length > 0
      ) {
        // Offer AI/manual conflict resolution
        return {
          type: "choice",
          title: "Merge Conflicts Detected",
          message: `Conflicts occurred while merging ${mainBranch} into worktree:\n${step1.conflictFiles
            .slice(0, 5)
            .join("\n")}${step1.conflictFiles.length > 5 ? "\n..." : ""}`,
          options: [
            {
              id: "ai_merge",
              label: "Try AI-assisted merge",
              description: "Let AI intelligently combine both versions",
              default: true,
            },
            {
              id: "manual_merge",
              label: "Manual resolution",
              description: "Resolve conflicts yourself in the pane",
            },
            {
              id: "abort",
              label: "Abort merge",
              description: "Cancel and clean up",
            },
          ],
          onSelect: async (optionId: string) => {
            if (optionId === "abort") {
              // Abort the merge
              const { abortMerge } = await import(
                "../../utils/mergeExecution.js"
              )
              abortMerge(pane.worktreePath!)
              return {
                type: "info",
                message: "Merge aborted",
                dismissable: true,
              }
            }

            if (optionId === "manual_merge") {
              // Jump to the pane so user can resolve manually
              return {
                type: "navigation",
                title: "Manual Conflict Resolution",
                message: `Conflicts in: ${step1.conflictFiles?.join(
                  ", "
                )}.\nResolve in the pane, then try merge again.`,
                targetPaneId: pane.id,
                dismissable: true,
              }
            }

            if (optionId === "ai_merge") {
              // Create conflict resolution pane with AI
              const { createConflictResolutionPaneForMerge } = await import(
                "./conflictResolution.js"
              )
              return createConflictResolutionPaneForMerge(
                pane,
                context,
                mainBranch,
                mainRepoPath
              )
            }

            return {
              type: "info",
              message: "Unknown option",
              dismissable: true,
            }
          },
          dismissable: true,
        }
      }

      // Non-conflict error (e.g., permission denied, git failure)
      return {
        type: "error",
        title: "Merge Failed",
        message: `Failed to merge ${mainBranch} into worktree: ${step1.error}`,
        dismissable: true,
      }
    }
  }

  // Step 2: Merge worktree into main (bring changes back to main)
  const step2 = mergeWorktreeIntoMain(mainRepoPath, pane.slug)

  if (!step2.success) {
    return {
      type: "error",
      title: "Merge Failed",
      message: `Failed to merge into ${mainBranch}: ${step2.error}`,
      dismissable: true,
    }
  }

  // Trigger post_merge hook after successful merge
  console.error(
    `[mergeExecution] About to trigger post_merge hook for ${pane.slug}`
  )
  await triggerHook("post_merge", mainRepoPath, pane, {
    DMUX_TARGET_BRANCH: mainBranch,
  })
  console.error(`[mergeExecution] post_merge hook completed for ${pane.slug}`)

  // Merge successful! Show cleanup options using the existing closePane dialog
  // This reuses the CLOSE action which handles everything properly:
  // - Hooks (before_pane_close, before_worktree_remove, worktree_removed, pane_closed)
  // - Layout recalculation after pane removal
  // - Last pane handling (recreates welcome pane)
  // - Terminal clearing to prevent artifacts
  console.error(
    `[mergeExecution] Merge complete for ${pane.slug}, showing cleanup options via closePane`
  )
  console.error(
    `[mergeExecution] Context has ${context.panes.length} panes: ${context.panes.map(p => p.id).join(', ')}`
  )
  console.error(
    `[mergeExecution] Pane to close: ${pane.id} (slug: ${pane.slug})`
  )

  const { closePane } = await import("../implementations/closeAction.js")
  const closeResult = await closePane(pane, context)
  console.error(
    `[mergeExecution] closePane returned result type: ${closeResult.type}`
  )
  return closeResult
}
