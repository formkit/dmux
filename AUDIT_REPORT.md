# COMPREHENSIVE CODEBASE AUDIT - DMUX

## EXECUTIVE SUMMARY

This audit identified:
- **Dead Code**: 50+ unused functions and exports across multiple files
- **DRY Violations**: Multiple instances of duplicate git/tmux operations scattered across 4+ locations
- **Duplicate Implementations**: Two separate merge execution paths with overlapping logic
- **Extraction Artifacts**: 10 unused frontend files from incomplete refactoring
- **Unused Utility Functions**: 30+ exported functions never imported elsewhere

---

## 1. DEAD CODE

### 1.1 Unused Server/Static Functions

**File**: `src/server/static.ts` (Lines 1-N)
- `getTerminalViewerHtml()` - DEAD (not called anywhere)
- `getDashboardHtml()` - DEAD (not called anywhere)
- `getDashboardCss()` - DEAD (not called anywhere)
- `getDashboardJs()` - DEAD (not called anywhere)
- `getTerminalJs()` - DEAD (not called anywhere)

**Why**: The `healthRoutes.ts` directly calls `getEmbeddedAsset()` instead of using these function helpers. These were likely left over from an earlier implementation.

**Impact**: ~200 lines of unused code, confusing code organization

---

### 1.2 Unused Embedded Assets Functions

**File**: `src/server/embedded-assets.ts`
- `hasEmbeddedAsset()` - DEAD (defined but never called anywhere)

---

### 1.3 Unused Popup Functions

**File**: `src/utils/popup.ts`
- `launchPopup()` - DEAD (replaced by new action system)
- `launchNodePopup()` - DEAD (replaced by new action system)
- `launchPopupNonBlocking()` - DEAD (replaced by new action system)
- `launchNodePopupNonBlocking()` - DEAD (replaced by new action system)
- `ensureMouseMode()` - DEAD (not called anywhere)

**Why**: These were the old popup system before migrating to the action-based dialog system.

**Impact**: ~400 lines of legacy code

---

### 1.4 Unused Welcome Pane Functions

**File**: `src/utils/welcomePaneManager.ts`
- `destroyWelcomePaneCoordinated()` - DEAD (not called anywhere)
- `createWelcomePaneCoordinated()` - DEAD (called but unused result)
- `ensureWelcomePane()` - DEAD (not called anywhere)

**Why**: These were part of an older welcome pane system. Only 2 calls found in code but results not used.

---

### 1.5 Unused Utility Functions

**File**: `src/utils/paneCapture.ts`
- `capturePaneContentRaw()` - DEAD (only `capturePaneContent()` is used)

**File**: `src/utils/mergeValidation.ts`
- `getGitStatus()` - DEAD (never imported/called elsewhere)
- `getCurrentBranch()` - DEAD (duplicated logic in hooks, never imported)
- `hasCommitsToMerge()` - DEAD (never imported/called)
- `detectMergeConflicts()` - DEAD (never imported/called)
- `validateMerge()` - Used once, heavy over-engineering
- `stageAllChanges()` - DEAD (generic git operation)
- `commitChanges()` - DEAD (generic git operation)
- `stashChanges()` - DEAD (generic git operation)

**Why**: Module created during refactoring but logic was duplicated or moved to action handlers

**Impact**: ~266 lines of unused git validation utilities

**File**: `src/utils/mergeExecution.ts`
- `mergeMainIntoWorktree()` - DEAD (same logic in `actions/merge/mergeExecution.ts`)
- `mergeWorktreeIntoMain()` - DEAD (same logic in `actions/merge/mergeExecution.ts`)
- `getConflictingFiles()` - DEAD (inline implementation exists)

**Why**: Logic was duplicated when moving to action system

**Impact**: ~233 lines of duplicate merge logic

**File**: `src/utils/aiMerge.ts`
- `getComprehensiveDiff()` - DEAD (never called as standalone)
- `generateCommitMessage()` - DEAD (replaced by action handler)
- `aiResolveConflict()` - DEAD (replaced by `aiResolveAllConflicts()`)
- `aiResolveAllConflicts()` - Barely used (2 calls total, could be inlined)

**File**: `src/utils/conflictMonitor.ts`
- `startConflictMonitoring()` - Used once in one file, excessive abstraction

**File**: `src/utils/conflictResolutionPane.ts`
- `createConflictResolutionPane()` - Used once, could be inlined

**File**: `src/utils/hooks.ts`
- `findHook()` - Exported but only used internally
- `buildHookEnvironment()` - Exported but only used via `triggerHook()`
- `triggerHookSync()` - DEAD (async version exists)
- `hasHook()` - DEAD
- `listAvailableHooks()` - DEAD
- `initializeHooksDirectory()` - DEAD

**Impact**: ~500+ lines total of unused/barely-used hook utilities

**File**: `src/utils/agentDetection.ts`
- `findClaudeCommand()` - DEAD (only `getAvailableAgents()` used)
- `findOpencodeCommand()` - DEAD (only `getAvailableAgents()` used)

---

### 1.6 Unused API Action Functions

**File**: `src/server/actionsApi.ts`
- `handleListActions()` - DEAD (called but should be direct router handler)
- `handleGetPaneActions()` - DEAD
- `handleExecuteAction()` - DEAD
- `handleConfirmCallback()` - DEAD
- `handleChoiceCallback()` - DEAD
- `handleInputCallback()` - DEAD

**Why**: These are defined as exportable functions but only used internally in the same file as event handlers. Should be internal functions, not exported.

---

### 1.7 Unused Utility Functions - Misc

**File**: `src/utils/postPaneCleanup.ts`
- `handleLastPaneRemoved()` - DEAD (never called)

---

### 1.8 Frontend Extraction Artifacts

**Directory**: `frontend/`
- `dashboard-data.js` - Extracted fragment, unused
- `dashboard-methods.js` - Extracted fragment, unused
- `dashboard-mounted.js` - Extracted fragment, unused
- `vue-data.js` - Extracted fragment, unused
- `vue-methods.js` - Extracted fragment, unused
- `vue-mounted.js` - Extracted fragment, unused
- `extracted-dashboard.js` - Extracted file, unused
- `extracted-terminal.js` - Extracted file, unused
- `data-section.js` - Extracted fragment, unused
- `methods-section.js` - Extracted fragment, unused

**Why**: Temporary files created during Vue 3 refactoring/extraction, never integrated

**Impact**: 10 orphaned files taking up space and causing confusion

---

## 2. DRY VIOLATIONS - DUPLICATE CODE PATTERNS

### 2.1 Git Operations - `git branch --show-current`

Appears in 3 different locations:

**Location 1**: `src/utils/mergeValidation.ts:65`
```typescript
export function getCurrentBranch(repoPath: string): string {
  try {
    return execSync('git branch --show-current', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();
  } catch {
    return 'main';
  }
}
```

**Location 2**: `src/hooks/useWorktreeActions.ts:62`
```typescript
const mainBranch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
```

**Location 3**: `src/hooks/useWorktreeActions.ts:119`
```typescript
const mainBranch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
```

**Recommendation**: Create single utility: `src/utils/git.ts:getMainBranch()` (ALREADY EXISTS but not used!)

---

### 2.2 Git Operations - `git status --porcelain`

Appears in 7 different locations:

**Location 1**: `src/utils/git.ts:60`
```typescript
const status = execSync('git status --porcelain', { ... });
```

**Location 2**: `src/utils/mergeValidation.ts:34`
```typescript
const statusOutput = execSync('git status --porcelain', { ... });
```

**Location 3**: `src/hooks/useWorktreeActions.ts:63`
```typescript
const statusOutput = execSync(`git -C "${pane.worktreePath}" status --porcelain`, { ... });
```

**Location 4**: `src/hooks/useWorktreeActions.ts:120`
```typescript
const statusOutput = execSync(`git -C "${pane.worktreePath}" status --porcelain`, { ... });
```

**Location 5-7**: `src/utils/mergeValidation.ts`, `src/components/panes/MergePane.tsx`, `src/server/embedded-assets.ts`

**Pattern**: Same command with different working directories and error handling

**Recommendation**: Use `hasUncommittedChanges()` and `getConflictedFiles()` from `src/utils/git.ts`

---

### 2.3 Tmux Operations - `tmux split-window -h`

Appears in 7 different locations:

**Location 1**: `src/utils/tmux.ts` - Has utility function
**Location 2**: `src/DmuxApp.tsx:893`
```typescript
execSync(`tmux split-window -h -P -F '#{pane_id}'`, { ... })
```

**Location 3**: `src/services/InputHandler.ts:362`
```typescript
execSync(`tmux split-window -h -P -F '#{pane_id}'`, { ... })
```

**Location 4**: `src/services/PaneCreationService.ts:169`
```typescript
execSync(`tmux split-window -h -P -F '#{pane_id}'`, { ... })
```

**Location 5**: `src/hooks/usePanes.ts:136`
```typescript
const newPaneId = execSync(`tmux split-window -h -P -F '#{pane_id}' -c "${missingPane.worktreePath || process.cwd()}"`, { ... })
```

**Location 6**: `src/utils/conflictResolutionPane.ts:51`
```typescript
const paneInfo = execSync(`tmux split-window -h -P -F '#{pane_id}'`, { ... })
```

**Location 7**: `src/server/embedded-assets.ts:1918`

**Recommendation**: Create utility `src/utils/tmux.ts:splitPane()` to consolidate logic

---

### 2.4 Merge Execution - Duplicate Functions

**Location 1**: `src/utils/mergeExecution.ts:20-61` (DEAD CODE)
```typescript
export function mergeMainIntoWorktree(
  worktreePath: string,
  mainBranch: string
): MergeResult { ... }
```

**Location 2**: `src/actions/merge/mergeExecution.ts:88-245` (ACTIVE)
Same logic but implemented differently within the action flow

**Issue**: Same merge logic in two places, causing maintenance burden

---

### 2.5 Conflict Checking - Duplicate Patterns

**Pattern 1**: Check for conflict markers
```typescript
// Location 1: src/utils/mergeExecution.ts
if (errorMessage.includes('CONFLICT') || errorMessage.includes('conflict'))

// Location 2: src/hooks/useWorktreeActions.ts:78
if (errorMessage.includes('CONFLICT') || errorMessage.includes('conflict'))

// Location 3: src/actions/merge/issueHandlers/mergeConflictHandler.ts
// Same pattern repeated
```

---

### 2.6 Status Message Pattern

Appears 20+ times with identical pattern:
```typescript
setStatusMessage('Message');
setTimeout(() => setStatusMessage(''), 2000);
```

**Recommendation**: Create custom hook `useTemporaryStatus()` to avoid duplication

---

## 3. DUPLICATE CODE PATHS

### 3.1 Merge Execution Has Two Implementations

**Path 1 (Legacy)**: `src/utils/mergeExecution.ts`
- `mergeMainIntoWorktree()`
- `mergeWorktreeIntoMain()`
- `cleanupAfterMerge()`
- Helper functions

**Path 2 (Current)**: `src/actions/merge/` directory
- `src/actions/merge/mergeExecution.ts` - orchestration
- `src/actions/merge/commitMessageHandler.ts` - commit logic
- `src/actions/merge/conflictResolution.ts` - conflict handling
- `src/actions/merge/issueHandlers/` - specific handlers

**Overlap**: Both paths handle:
1. Checking git status
2. Creating commits
3. Merging branches
4. Handling conflicts
5. Cleanup

**Problem**: Maintenance nightmare - bug fix in one place doesn't fix the other

---

### 3.2 Merge Validation Has Two Implementations

**Location 1**: `src/utils/mergeValidation.ts` - Comprehensive utilities
- `validateMerge()` - Pre-merge checks
- `detectMergeConflicts()` - Dry-run conflict detection
- State checking functions

**Location 2**: Inline in action handlers
- `src/actions/implementations/mergeAction.ts` - Does validation before action
- `src/actions/merge/issueHandlers/*.ts` - Individual issue checks

**Problem**: Validation logic is scattered and not DRY

---

## 4. CONSOLIDATION RECOMMENDATIONS

### Priority 1: High Impact, Easy Fix

1. **Delete Dead Frontend Files** (~10 files)
   - Delete all files in `frontend/*.js` (extraction artifacts)
   - Files: dashboard-data.js, dashboard-methods.js, etc.
   - Impact: ~0 code, just cleanup

2. **Remove Unused Static Functions** 
   - Delete `src/server/static.ts` completely (5 dead functions)
   - Already replaced by embedded asset system
   - Impact: ~200 lines

3. **Remove Unused Popup System**
   - Delete: `launchPopup()`, `launchNodePopup()`, all non-blocking variants
   - Keep only: `ensureMouseMode()` and interfaces
   - Impact: ~300 lines

4. **Consolidate tmux split-window**
   - Create: `src/utils/tmux.ts:splitPane(options)` 
   - Usage: `const paneId = await splitPane({ dir: worktreePath })`
   - Replace all 7 duplicates
   - Impact: Eliminate 7 code paths

---

### Priority 2: Medium Impact, Moderate Effort

1. **Consolidate Git Utilities**
   - Move all duplicate git operations to `src/utils/git.ts`
   - Already has `getMainBranch()`, `hasUncommittedChanges()`, `getConflictedFiles()`
   - Delete from: `mergeValidation.ts`, `hooks/useWorktreeActions.ts`
   - Impact: ~150 lines, improved reusability

2. **Create Merge Utilities Layer**
   - Move: `mergeMainIntoWorktree()`, `mergeWorktreeIntoMain()` from utils → new file
   - Use in: both action paths and legacy paths
   - Mark: old implementations as deprecated wrappers
   - Impact: Single source of truth for merge logic

3. **Extract Status Message Pattern**
   - Create: `useTemporaryStatus(message, duration = 2000)`
   - Replace: All 20+ instances of manual timeout pattern
   - Impact: ~100 lines saved, better maintainability

4. **Delete Unused Utility Exports**
   - `src/utils/mergeValidation.ts` - Delete unused functions:
     - `getGitStatus()`, `getCurrentBranch()`, `hasCommitsToMerge()`, 
     - `detectMergeConflicts()`, `stageAllChanges()`, `commitChanges()`, `stashChanges()`
   - Impact: ~180 lines

5. **Delete Unused Merge Utilities**
   - Keep: Logic in `src/actions/merge/` (active path)
   - Delete or deprecate: `src/utils/mergeExecution.ts` (~233 lines)
   - Impact: Remove dead code path

---

### Priority 3: Lower Impact, High Effort (Consider)

1. **Unify Merge Conflict Detection**
   - Create: Single source for conflict detection logic
   - Currently in: `mergeValidation.ts`, `conflictMonitor.ts`, action handlers
   - Impact: ~100 lines saved, but requires careful refactoring

2. **Consolidate Hook Functions**
   - Delete: `findHook()`, `buildHookEnvironment()`, `triggerHookSync()`, etc.
   - Keep only: `triggerHook()` as public API
   - Impact: ~300+ lines of unused hook utilities

3. **Clean Up Embedded Assets**
   - The `embedded-assets.ts` file is 5000+ lines of component code
   - Consider: Verify no dead code is embedded there
   - Impact: Lower priority - already minified

---

## 5. DUPLICATION ANALYSIS BY CATEGORY

| Category | Locations | Total Lines | Priority |
|----------|-----------|------------|----------|
| git branch --show-current | 3 | 30 | High |
| git status --porcelain | 7 | 70 | High |
| tmux split-window | 7 | 140 | High |
| merge execution | 2 paths | 800+ | High |
| merge validation | 2 locations | 400+ | High |
| status message pattern | 20+ | 100+ | Medium |
| git operations | scattered | 200+ | Medium |
| unused api handlers | 6 | 100+ | Low (refactor only) |
| unused hooks | 7 | 300+ | Low |
| unused popups | 5 | 400+ | High |
| **TOTAL** | | **2,500+** | |

---

## 6. FILES TO DELETE/DEPRECATE

### DELETE IMMEDIATELY (Safe)
- `/frontend/dashboard-data.js`
- `/frontend/dashboard-methods.js`
- `/frontend/dashboard-mounted.js`
- `/frontend/vue-data.js`
- `/frontend/vue-methods.js`
- `/frontend/vue-mounted.js`
- `/frontend/extracted-dashboard.js`
- `/frontend/extracted-terminal.js`
- `/frontend/data-section.js`
- `/frontend/methods-section.js`
- `/src/server/static.ts` (entirely)

### DELETE WITH REVIEW (Verify No Usage)
- `/src/utils/welcomePaneManager.ts` (all functions)
- `/src/utils/paneCapture.ts:capturePaneContentRaw()` (function only)
- `/src/utils/mergeExecution.ts` (entire file - logic moved to actions)
- Most functions in `/src/utils/mergeValidation.ts`

### REFACTOR (Internal Only)
- Move popup functions to internal-only (remove exports)
- Delete unused hook utility functions
- Remove unused API action handlers (or make internal)

---

## 7. SPECIFIC FILE AUDIT

### src/utils/mergeValidation.ts
- Lines: 266
- Used: ~50 lines (only `validateMerge()` actively used)
- Unused exports: 8 functions (~200 lines)
- **Recommendation**: Delete entire file or keep only `validateMerge()`

### src/utils/mergeExecution.ts  
- Lines: 233
- Status: **DEAD CODE** - Exact duplicates exist in `src/actions/merge/mergeExecution.ts`
- **Recommendation**: Delete entirely

### src/utils/aiMerge.ts
- Lines: 358
- Used: ~50 lines (only `aiResolveAllConflicts()` actively called)
- Unused exports: 4 functions
- **Recommendation**: Keep only `aiResolveAllConflicts()`, delete others

### src/server/static.ts
- Lines: ~200
- Status: **All functions are DEAD CODE**
- **Recommendation**: Delete entire file

### src/utils/popup.ts
- Lines: ~400
- Used: Only `POPUP_POSITIONING` constant and interfaces
- Unused exports: 5 functions
- **Recommendation**: Keep interfaces/constants, delete function implementations

### frontend/*.js (10 files)
- Lines: ~500 total
- Status: **Extraction artifacts from incomplete refactoring**
- **Recommendation**: Delete all 10 files

---

## 8. CODE QUALITY IMPACT

### Current State
- **148 TypeScript/TSX files** (properly tracked)
- **10 orphaned JS files** (extraction artifacts)
- **2,500+ lines of dead code** (~10-15% of utility code)
- **7 duplicate implementations** of core operations
- **2 parallel merge execution systems** causing confusion

### After Cleanup
- **140-145 TypeScript/TSX files** (cleaner structure)
- **0 orphaned files**
- **~1,700 lines of dead code removed** (~70% reduction)
- **1 unified implementation** for each operation
- **Single authoritative merge system** (action-based)

---

## APPENDIX A: Import Map for Unused Functions

Functions exported but never imported elsewhere:

```
src/server/static.ts:
  - getTerminalViewerHtml (0 imports)
  - getDashboardHtml (0 imports)
  - getDashboardCss (0 imports)
  - getDashboardJs (0 imports)
  - getTerminalJs (0 imports)

src/server/embedded-assets.ts:
  - hasEmbeddedAsset (0 imports)

src/utils/popup.ts:
  - launchPopup (0 imports)
  - launchNodePopup (0 imports)
  - launchPopupNonBlocking (0 imports)
  - launchNodePopupNonBlocking (0 imports)

src/utils/mergeValidation.ts:
  - getGitStatus (0 imports)
  - getCurrentBranch (0 imports)
  - hasCommitsToMerge (0 imports)
  - detectMergeConflicts (0 imports)
  - stageAllChanges (1 import, result unused)
  - commitChanges (1 import, minimal use)
  - stashChanges (0 imports)

src/utils/mergeExecution.ts:
  - mergeMainIntoWorktree (1 import, duplicated elsewhere)
  - mergeWorktreeIntoMain (1 import, duplicated elsewhere)
  - getConflictingFiles (0 imports)

src/utils/aiMerge.ts:
  - generateCommitMessage (2 imports, legacy)
  - aiResolveConflict (0 imports)

src/utils/conflictMonitor.ts:
  - startConflictMonitoring (1 import, heavy for single use)

src/utils/hooks.ts:
  - findHook (0 imports externally)
  - buildHookEnvironment (0 imports externally)
  - triggerHookSync (0 imports)
  - hasHook (0 imports)
  - listAvailableHooks (0 imports)
  - initializeHooksDirectory (0 imports)

src/utils/agentDetection.ts:
  - findClaudeCommand (0 imports)
  - findOpencodeCommand (0 imports)

src/utils/postPaneCleanup.ts:
  - handleLastPaneRemoved (0 imports)

src/server/actionsApi.ts:
  - handleListActions (exported but internal use)
  - handleGetPaneActions (exported but internal use)
  - handleExecuteAction (exported but internal use)
  - handleConfirmCallback (exported but internal use)
  - handleChoiceCallback (exported but internal use)
  - handleInputCallback (exported but internal use)
```

---

## APPENDIX B: Duplicate Operation Locations

### Git Operations
- `git branch --show-current`: 3 locations
- `git status --porcelain`: 7 locations
- `git merge`: 5 locations
- `git worktree create`: 3 locations
- `git add -A`: 4 locations
- `git commit`: 5 locations

### Tmux Operations
- `tmux split-window -h`: 7 locations
- `tmux kill-pane`: 3 locations
- `tmux display-message`: 5 locations
- `tmux list-panes`: 3 locations

### Conflict Handling
- Conflict detection pattern: 4 locations
- Conflict file parsing: 3 locations
- Abort merge pattern: 2 locations

### Status Messages
- `setStatusMessage()` + timeout pattern: 20+ locations
- Error handling pattern: 10+ locations

