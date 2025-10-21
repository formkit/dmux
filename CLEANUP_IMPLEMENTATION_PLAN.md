# Codebase Cleanup Implementation Plan

**Goal**: Remove 4,196 lines of verified dead code (27% of codebase)
**Time**: 45 minutes
**Risk**: Zero (all verified unused)

---

## Pre-Flight Check

```bash
# Ensure you're on the right branch
git status

# Ensure build is working before we start
pnpm build

# Ensure tests pass
pnpm test
```

**Expected**: All green ✅

---

## Phase 0: Delete Orphaned Phase 4 Services (15 min)

**Impact**: -974 lines
**Files affected**: 4

### Background
Phase 4 refactoring extracted code from DmuxApp.tsx into 3 service files, but only PopupManager was actually integrated. The other two services were never used.

### Step 0.1: Delete Unused Service Files

```bash
rm src/services/PaneCreationService.ts
rm src/services/InputHandler.ts
```

**Verify**:
```bash
ls src/services/PaneCreationService.ts src/services/InputHandler.ts
# Should show: No such file or directory
```

### Step 0.2: Remove Dead Method from PopupManager

**File**: `src/services/PopupManager.ts`

**Find and delete** the `launchMergePopup()` method (approximately lines 483-537):

```typescript
// DELETE THIS ENTIRE METHOD (including JSDoc comment):
  /**
   * Launch merge popup for a pane
   */
  async launchMergePopup(pane: DmuxPane): Promise<{
    action: "merge" | "cancel"
    commitMessage?: string
  }> {
    // ... implementation ...
    // Approximately 55 lines total
  }
```

**How to find it**:
```bash
grep -n "launchMergePopup" src/services/PopupManager.ts
```

### Step 0.3: Clean Up useServices Hook

**File**: `src/hooks/useServices.ts`

**Delete 1: Import statement (line 4)**
```typescript
// DELETE THIS LINE:
import { PaneCreationService } from "../services/PaneCreationService.js"
```

**Delete 2: Interface properties (lines ~21-24)**
```typescript
interface UseServicesProps {
  // ... other props ...

  // DELETE THESE 4 LINES:
  // PaneCreation config
  projectName: string
  controlPaneId?: string
  dmuxVersion: string

  // ... rest of props ...
}
```

**Delete 3: PaneCreationService initialization (lines ~71-94)**
```typescript
  // DELETE THIS ENTIRE BLOCK:
  // Initialize PaneCreationService
  const paneCreationService = useMemo(() => {
    return new PaneCreationService(
      {
        projectName: props.projectName,
        sidebarWidth: props.sidebarWidth,
        controlPaneId: props.controlPaneId,
        dmuxVersion: props.dmuxVersion,
      },
      {
        setStatusMessage: props.setStatusMessage,
        savePanes: props.savePanes,
        loadPanes: props.loadPanes,
      }
    )
  }, [
    props.projectName,
    props.sidebarWidth,
    props.controlPaneId,
    props.dmuxVersion,
    props.setStatusMessage,
    props.savePanes,
    props.loadPanes,
  ])
```

**Delete 4: Return value (line ~98)**
```typescript
  return {
    popupManager,
    paneCreationService,  // ← DELETE THIS LINE (keep the comma on popupManager)
  }
```

**After deletion, should look like**:
```typescript
  return {
    popupManager,
  }
```

### Step 0.4: Verify Phase 0

```bash
# Build should succeed
pnpm build

# Check for any remaining references
grep -r "PaneCreationService\|InputHandler\|launchMergePopup" src --include="*.ts" --include="*.tsx"
# Should return: No matches (or only in comments/docs)

# Run tests
pnpm test
```

**Expected**: Build succeeds, tests pass ✅

**Checkpoint**: Commit your work
```bash
git add -A
git commit -m "refactor: remove Phase 4 orphaned services (-974 lines)

- Delete PaneCreationService.ts (477 lines) - never integrated
- Delete InputHandler.ts (411 lines) - never instantiated
- Remove PopupManager.launchMergePopup() (55 lines) - replaced by actions
- Clean useServices.ts (31 lines) - remove dead config

All code verified unused via grep analysis.
Build verified: ✅ pnpm build succeeds"
```

---

## Phase 1: Delete Frontend Extraction Artifacts (5 min)

**Impact**: ~94KB
**Files affected**: 10

### Background
These are code fragments extracted during Vue 3 migration but never integrated into the actual application.

### Step 1.1: Delete All Orphaned JS Files

```bash
rm frontend/dashboard-data.js
rm frontend/dashboard-methods.js
rm frontend/dashboard-mounted.js
rm frontend/vue-data.js
rm frontend/vue-methods.js
rm frontend/vue-mounted.js
rm frontend/extracted-dashboard.js
rm frontend/extracted-terminal.js
rm frontend/data-section.js
rm frontend/methods-section.js
```

### Step 1.2: Verify Phase 1

```bash
# Verify files are gone
ls frontend/*.js 2>&1
# Should show: No such file or directory

# Build should still succeed (these files weren't imported anywhere)
pnpm build

# Tests should still pass
pnpm test
```

**Expected**: Build succeeds, tests pass ✅

**Checkpoint**: Commit your work
```bash
git add -A
git commit -m "refactor: remove frontend extraction artifacts (~94KB)

Delete 10 orphaned .js files from Vue 3 migration:
- dashboard-data.js, dashboard-methods.js, dashboard-mounted.js
- vue-data.js, vue-methods.js, vue-mounted.js
- extracted-dashboard.js, extracted-terminal.js
- data-section.js, methods-section.js

These were extraction fragments never integrated into the app.
Verified unused: grep found zero imports.
Build verified: ✅ pnpm build succeeds"
```

---

## Phase 2: Delete Server Static File (1 min)

**Impact**: -3,042 lines
**Files affected**: 1

### Background
This file contains 5 functions that were replaced by the embedded assets system. All functions are completely unused.

### Step 2.1: Delete the File

```bash
rm src/server/static.ts
```

### Step 2.2: Verify Phase 2

```bash
# Verify file is gone
ls src/server/static.ts 2>&1
# Should show: No such file or directory

# Build should succeed
pnpm build

# Check for any imports (should be none)
grep -r "from.*static\.js\|from.*static'" src --include="*.ts" --include="*.tsx"
# Should return: No matches

# Tests should pass
pnpm test
```

**Expected**: Build succeeds, tests pass ✅

**Checkpoint**: Commit your work
```bash
git add -A
git commit -m "refactor: remove server static.ts (-3,042 lines)

Delete src/server/static.ts entirely:
- All 5 functions unused (getTerminalViewerHtml, getDashboardHtml,
  getDashboardCss, getDashboardJs, getTerminalJs)
- Replaced by embedded asset system (serveEmbeddedAsset)

Verified unused: grep found zero imports of static.ts functions.
Build verified: ✅ pnpm build succeeds"
```

---

## Phase 3: Clean Up Merge Validation Utilities (20 min)

**Impact**: -180 lines
**Files affected**: 1

### Background
The `mergeValidation.ts` file has 8 exported functions, but only 1 (`validateMerge`) is actually used. The other 7 are unused helpers.

### Step 3.1: Identify What to Keep

**KEEP**: `validateMerge()` function (lines ~143-210)
**DELETE**: All other exported functions

### Step 3.2: Edit src/utils/mergeValidation.ts

Open `src/utils/mergeValidation.ts` and delete these functions:

1. **`getGitStatus()`** (lines ~32-61)
2. **`getCurrentBranch()`** (lines ~63-76)
3. **`hasCommitsToMerge()`** (lines ~78-92)
4. **`detectMergeConflicts()`** (lines ~94-141)
5. **`stageAllChanges()`** (lines ~212-229)
6. **`commitChanges()`** (lines ~231-251)
7. **`stashChanges()`** (lines ~253-266)

**Easier approach - rewrite the file**:

Keep only:
- The imports at the top
- The `GitStatus`, `ValidationIssue`, `ValidationResult` types
- The `validateMerge()` function

The file should go from 266 lines to ~90 lines.

### Step 3.3: Verify Phase 3

```bash
# Build should succeed
pnpm build

# Check that validateMerge is still used
grep -r "validateMerge" src --include="*.ts" --include="*.tsx" | grep import
# Should show 2 imports (in mergeAction.ts and mergePopup.tsx)

# Check that deleted functions aren't imported
grep -r "getGitStatus\|getCurrentBranch\|hasCommitsToMerge\|detectMergeConflicts\|stageAllChanges\|commitChanges\|stashChanges" src --include="*.ts" --include="*.tsx" | grep import
# Should return: No matches

# Tests should pass
pnpm test
```

**Expected**: Build succeeds, tests pass ✅

**Checkpoint**: Commit your work
```bash
git add -A
git commit -m "refactor: clean up mergeValidation.ts (-180 lines)

Remove 7 unused helper functions:
- getGitStatus(), getCurrentBranch(), hasCommitsToMerge()
- detectMergeConflicts(), stageAllChanges(), commitChanges()
- stashChanges()

Keep only validateMerge() which is actively used by:
- src/actions/implementations/mergeAction.ts
- src/components/popups/mergePopup.tsx

Verified unused: grep found zero imports of deleted functions.
Build verified: ✅ pnpm build succeeds
File reduced: 266 → ~90 lines"
```

---

## Final Verification

After completing all phases, run comprehensive checks:

```bash
# 1. Clean build
pnpm build

# 2. Run all tests
pnpm test

# 3. Check for broken imports (should be none)
grep -r "PaneCreationService\|InputHandler\|static\.js\|getGitStatus\|hasCommitsToMerge" src --include="*.ts" --include="*.tsx"
# Should return: No matches

# 4. Verify file deletions
ls src/services/PaneCreationService.ts 2>&1  # Should not exist
ls src/services/InputHandler.ts 2>&1         # Should not exist
ls src/server/static.ts 2>&1                 # Should not exist
ls frontend/*.js 2>&1                        # Should not exist

# 5. Check line count reduction
git diff --stat main..HEAD
```

**Expected Results**:
- ✅ Build succeeds with no errors
- ✅ All tests pass
- ✅ No broken imports
- ✅ All deleted files are gone
- ✅ ~4,196 lines removed

---

## Create Summary Commit (Optional)

If you committed each phase separately, you can create a summary:

```bash
git log --oneline -4
# Should show your 4 commits

# Optional: Create annotated tag
git tag -a cleanup-audit-v1 -m "Completed codebase audit cleanup

Total impact: -4,196 lines (27% reduction)
- Phase 0: Orphaned services (-974 lines)
- Phase 1: Frontend artifacts (~94KB)
- Phase 2: Server static.ts (-3,042 lines)
- Phase 3: Merge validation (-180 lines)

All code verified unused via grep analysis.
Build and tests verified at each phase."
```

---

## Rollback Plan (If Needed)

If something goes wrong at any phase:

```bash
# See what you've changed
git status

# Undo uncommitted changes
git restore <file>

# Or reset to before cleanup
git reset --hard HEAD~1  # Goes back 1 commit
git reset --hard HEAD~4  # Goes back all 4 commits

# Or reset to specific commit
git reset --hard <commit-hash>
```

---

## Metrics

### Before Cleanup
- Total files: ~148 TypeScript/TSX + 10 orphaned JS
- DmuxApp.tsx: 1,092 lines (after Phase 4)
- Service files: PopupManager (630), PaneCreationService (477), InputHandler (411)

### After Cleanup
- Total files: ~145 TypeScript/TSX
- Files deleted: 13 (2 services + 1 server file + 10 frontend)
- Lines removed: 4,196
- Codebase reduction: ~27%

### Verification Commands
```bash
# Count .ts and .tsx files
find src -name "*.ts" -o -name "*.tsx" | wc -l

# Total line count in src/
find src -name "*.ts" -o -name "*.tsx" | xargs wc -l | tail -1

# Git diff stats
git diff --stat main..HEAD
```

---

## Next Steps (Future Work - Optional)

After this cleanup is complete, see **AUDIT_CORRECTIONS.md Priority 3** for:

1. **Consolidate git operations** (~30 lines saved)
   - Replace inline `git branch --show-current` with `getMainBranch()` from `src/utils/git.ts`
   - Found in 3 locations

2. **Create tmux utility helper** (~70 lines saved)
   - Create `splitPane(options)` in `src/utils/tmux.ts`
   - Replace 6 duplicate `tmux split-window` calls

3. **Create status message hook** (~50 lines saved)
   - Create `useTemporaryStatus()` hook
   - Replace 20+ duplicate timeout patterns

**Total additional savings**: ~150 lines
**Estimated time**: 3-4 hours
**Risk**: Medium (requires testing merge/pane workflows)

---

## Success Criteria

✅ All phases completed
✅ Build succeeds: `pnpm build`
✅ Tests pass: `pnpm test`
✅ No broken imports
✅ 4,196 lines removed
✅ 13 files deleted
✅ All changes committed

**You're done!** 🎉

The codebase is now 27% smaller with zero functionality lost.

---

## Reference Documents

- **This file** - Implementation guide
- **AUDIT_FINAL_SUMMARY.md** - Executive summary of audit findings
- **AUDIT_CORRECTIONS.md** - Detailed verification of what's safe to delete
- **AUDIT_PHASE4_SERVICES.md** - Deep dive on Phase 4 orphaned services
- **CLEANUP_CHECKLIST.md** - Alternative checklist format (same content)

**Questions?** All findings were verified with:
- `grep` searches for imports and usage
- Build verification after each change
- Cross-reference with Phase 1-4 refactoring history
