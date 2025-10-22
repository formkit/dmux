# Merge Conflict Resolution Flow

This document explains the complete flow when merging a worktree with conflicts.

## Overview

The merge system implements a **2-phase merge strategy**:
1. **Phase 1**: Merge main → worktree (get latest changes, detect/resolve conflicts)
2. **Phase 2**: Merge worktree → main (bring changes back to main branch)

Conflicts are detected **before** attempting the actual merge using `git merge-tree` simulation.

---

## Complete Flow: User Presses 'm' on a Worktree Pane

### **Step 1: Pre-Validation**
**File**: `src/actions/implementations/mergeAction.ts:21-43`

- Calls `validateMerge()` which runs `git merge-tree` simulation
- **Location**: `src/utils/mergeValidation.ts:94-138`
- Detects conflicts **before** actually attempting the merge
- Returns validation result with `canMerge: false` and `merge_conflict` issue

### **Step 2: Issue Routing**
**File**: `src/actions/implementations/mergeAction.ts:72-102`

- Since `canMerge: false`, routes to `handleMergeIssues()`
- Finds `merge_conflict` issue type
- Calls `handleMergeConflict()`
- **Location**: `src/actions/merge/issueHandlers/mergeConflictHandler.ts:15-65`

### **Step 3: User Choice Dialog**

Shows choice dialog with 3 options:
- **AI-assisted merge** (default)
- Manual resolution
- Cancel

---

## Path A: AI-Assisted Merge

### **Step 4: Create Conflict Resolution Pane**
**File**: `src/actions/merge/conflictResolution.ts:14-67`

- Detects available agents (Claude Code, opencode)
- If multiple agents, shows agent choice dialog
- If only one agent, uses it directly

### **Step 5: Launch Conflict Pane**
**File**: `src/actions/merge/conflictResolution.ts:73-150`

- Calls `createConflictResolutionPane()` utility
- **Important**: Does NOT create a new worktree
- Creates new tmux pane that operates directly in the **original worktree directory**
  - Line 73-81 of `conflictResolutionPane.ts`: `cd`s into `targetRepoPath` (the original worktree)
  - The pane has **no worktreePath** field (line 140) - it's not a worktree pane
- Launches agent with pre-written conflict resolution prompt
- Adds conflict pane to state
- **Starts background monitor** (line 104-141):
  - Monitors `pane.worktreePath!` (the original worktree where conflicts exist)
  - Polls every 2 seconds via `conflictMonitor.ts`
  - Checks:
    - Does conflict pane still exist?
    - Are conflicts resolved?
      - `git diff --name-only --diff-filter=U` is empty
      - No MERGE_HEAD file exists

### **Step 6: Agent Works**

- Agent (Claude/opencode) analyzes conflicts in the **original worktree**
- Both panes (original and conflict resolution) point to the same filesystem location
- Agent edits files to resolve conflicts
- Agent commits the merge
- **Note**: Any changes made by the agent are immediately visible in the original pane since they share the same worktree

### **Step 7: Monitor Detects Completion**
**File**: `src/utils/conflictMonitor.ts:54-60`

- `areConflictsResolved()` returns true
- Calls `onResolved()` callback

### **Step 8: Auto-Cleanup Flow**
**File**: `src/actions/merge/conflictResolution.ts:107-140`

1. **Kills conflict pane**: `tmux kill-pane -t '${conflictPane.paneId}'`
2. **Removes conflict pane from dmux state**
3. **Creates updated context** without conflict pane (prevents stale context bug)
4. **Re-runs `executeMerge()`** with the original pane

### **Step 9: Execute Merge**
**File**: `src/actions/merge/mergeExecution.ts:86-227`

1. **Phase 1**: `mergeMainIntoWorktree()` - now succeeds because conflicts were resolved
2. **Phase 2**: `mergeWorktreeIntoMain()` - merges worktree branch into main
3. Triggers `post_merge` hook
4. **Shows cleanup confirmation dialog** via `onActionResult` callback

### **Step 10: User Confirms Cleanup**
**File**: `src/actions/merge/mergeExecution.ts:191-227`

1. **Kills original worktree pane**: `tmux kill-pane -t '${pane.paneId}'`
2. Runs `cleanupAfterMerge()`: removes worktree, deletes branch
3. Removes pane from dmux state
4. Calls `onPaneRemove()` callback
5. Shows success message

**Result**: Both conflict pane and original worktree pane are closed, worktree cleaned up, branch merged to main.

---

## Path B: Manual Resolution

### **Step 4-Alt: Manual Flow**
**File**: `src/actions/merge/issueHandlers/mergeConflictHandler.ts:49-52`

- Calls `executeMergeWithConflictHandling()` with `strategy: 'manual'`

### **Step 5-Alt: Start Merge**
**File**: `src/actions/merge/mergeExecution.ts:15-78`

- Calls `mergeMainIntoWorktree()` - this will fail with conflicts
- Detects `needsManualResolution: true`
- Returns **navigation** result jumping to the pane

### **Step 6-Alt: User Resolves Manually**

- User manually edits files, resolves conflicts
- User runs `git add` and `git commit`
- User presses 'm' again to retry merge

### **Step 7-Alt: Retry Merge**

- Goes through validation again
- This time conflicts are resolved, proceeds to Phase 2 of `executeMerge()`
- Completes merge and shows cleanup dialog

---

## Key Architecture Points

### Two Paths to Conflict Resolution

1. **AI path**: Creates new pane → monitors → auto-closes → shows cleanup
2. **Manual path**: Navigates to existing pane → user resolves → user retries

### Monitor Watches the Worktree

The conflict monitor watches `pane.worktreePath!` (not the main repo) because:
- Conflicts are resolved in the worktree
- Agent runs in the worktree directory
- MERGE_HEAD file exists in worktree during conflict state

### Three Pane Lifecycle Scenarios

1. **Conflict resolution pane**:
   - Temporary pane created in the original worktree directory
   - No separate worktree created - operates in the same filesystem as original pane
   - Agent resolves conflicts and commits
   - Auto-killed when conflicts are resolved

2. **Original worktree pane**:
   - Stays alive during conflict resolution
   - Shares filesystem with conflict resolution pane
   - After successful merge, cleanup dialog appears
   - Killed if user confirms cleanup

3. **Main repo**: Never touched by dmux UI (only git operations run there)

### Two-Phase Merge Strategy

**Why two phases?**

1. **Phase 1** (main → worktree):
   - Brings latest main branch changes into worktree
   - Detects and resolves conflicts in isolated environment
   - Doesn't touch main branch yet

2. **Phase 2** (worktree → main):
   - Only runs after conflicts are resolved
   - Fast-forward merge (no conflicts possible)
   - Brings completed work back to main

This prevents polluting main with conflict markers and allows safe experimentation.

---

## Files Involved

### Action System
- `src/actions/implementations/mergeAction.ts` - Main entry point, orchestration
- `src/actions/merge/mergeExecution.ts` - Merge execution logic
- `src/actions/merge/conflictResolution.ts` - Conflict pane creation and monitoring
- `src/actions/merge/issueHandlers/mergeConflictHandler.ts` - Conflict dialog

### Utilities
- `src/utils/mergeValidation.ts` - Pre-merge validation and git operations
- `src/utils/mergeExecution.ts` - Low-level merge operations
- `src/utils/conflictMonitor.ts` - Background monitoring system
- `src/utils/conflictResolutionPane.ts` - Conflict pane creation

### Adapters
- `src/hooks/useActionSystem.ts` - React hook bridging actions to TUI
- `src/DmuxApp.tsx` - TUI rendering and `onActionResult` callback

---

## Recent Bug Fixes

### Bug #6: Monitoring Wrong Repository
- **Problem**: Monitor was checking `targetRepoPath` (main repo) instead of worktree
- **Fix**: Changed to `pane.worktreePath!` in conflictResolution.ts:106
- **Impact**: Monitor now correctly detects when conflicts are resolved

### Bug #7: Wrong Pane Getting Cleaned Up
- **Problem**: Stale context caused cleanup to remove original pane instead of conflict pane
- **Fix**: Created `updatedContext` with fresh pane list before calling `executeMerge()`
- **Impact**: Cleanup now targets the correct pane (original worktree, not conflict pane)

### Bug #8: Zombie Panes in tmux
- **Problem**: Cleanup removed pane from dmux state but didn't kill tmux process
- **Fix**: Added `execSync(\`tmux kill-pane -t '${pane.paneId}'\`)` in mergeExecution.ts:204-210
- **Also fixed**: Changed callback from `onPaneUpdate` to `onPaneRemove`
- **Impact**: Original pane's tmux process is now properly terminated during cleanup

---

## Testing Checklist

When testing merge conflict resolution:

1. **Create test worktree** with conflicting changes
2. **Press 'm'** → should see "Merge Conflicts Detected" dialog
3. **Choose AI merge** → should create conflict pane with agent
4. **Wait for agent** to resolve conflicts and commit
5. **Verify conflict pane auto-closes** when merge completes
6. **Verify cleanup dialog appears** asking to close original pane
7. **Confirm cleanup** → verify both panes closed, worktree removed
8. **Check tmux** → verify no zombie panes remain
9. **Check git** → verify branch merged to main

### Expected Behavior

- ✅ Conflict pane created and agent launches
- ✅ Conflict pane auto-closes on successful resolution
- ✅ Cleanup dialog appears automatically
- ✅ Original worktree pane closed on cleanup confirmation
- ✅ No zombie tmux panes
- ✅ Worktree directory removed
- ✅ Branch merged to main
- ✅ Git worktree list shows worktree removed
