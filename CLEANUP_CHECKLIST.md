# Cleanup Checklist - Verified Dead Code Removal

**Total Impact**: -4,196 lines (27% of codebase)
**Estimated Time**: 45 minutes
**Risk**: Zero (all verified unused)

---

## ⚡ Phase 0: Orphaned Services (15 min) - HIGHEST PRIORITY

### Step 1: Delete Service Files
```bash
rm src/services/PaneCreationService.ts
rm src/services/InputHandler.ts
```

### Step 2: Clean PopupManager.ts
Delete `launchMergePopup()` method (lines ~483-537):
```typescript
// DELETE THIS ENTIRE METHOD:
async launchMergePopup(pane: DmuxPane): Promise<{
  action: "merge" | "cancel"
  commitMessage?: string
}> {
  // ... ~55 lines ...
}
```

### Step 3: Clean useServices.ts

**Delete import (line 3)**:
```typescript
import { PaneCreationService } from "../services/PaneCreationService.js"
```

**Delete from UseServicesProps interface (lines ~21-24)**:
```typescript
  // PaneCreation config
  projectName: string
  controlPaneId?: string
  dmuxVersion: string
```

**Delete paneCreationService initialization (lines ~71-94)**:
```typescript
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

**Delete from return statement (line ~98)**:
```typescript
  return {
    popupManager,
    paneCreationService,  // ← DELETE THIS LINE
  }
```

### Step 4: Verify
```bash
pnpm build
# Should succeed with no errors
```

**Impact**: -974 lines ✅

---

## 📦 Phase 1: Frontend Extraction Artifacts (5 min)

### Delete All Frontend JS Files
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

### Verify
```bash
ls frontend/*.js
# Should return: No such file or directory
```

**Impact**: -~94KB ✅

---

## 🗑️ Phase 2: Server Static File (1 min)

### Delete Entire File
```bash
rm src/server/static.ts
```

### Verify
```bash
pnpm build
# Should succeed - file was completely unused
```

**Impact**: -3,042 lines ✅

---

## ✂️ Phase 3: Merge Validation Cleanup (20 min)

### Edit src/utils/mergeValidation.ts

**Delete these 7 functions** (keep only `validateMerge`):

1. `getGitStatus()` (lines ~32-61)
2. `getCurrentBranch()` (lines ~63-76)
3. `hasCommitsToMerge()` (lines ~78-92)
4. `detectMergeConflicts()` (lines ~94-141)
5. `stageAllChanges()` (lines ~212-229)
6. `commitChanges()` (lines ~231-251)
7. `stashChanges()` (lines ~253-266)

**Keep ONLY**:
```typescript
/**
 * Merge Validation Utilities
 */

import { execSync } from 'child_process';

// ... types ...

export function validateMerge(
  mainRepoPath: string,
  worktreePath: string,
  branchName: string
): ValidationResult {
  // ... keep this entire function ...
}
```

### Verify
```bash
pnpm build
grep -r "getGitStatus\|hasCommitsToMerge\|detectMergeConflicts" src
# Should only show imports in mergeValidation.ts itself (if any)
```

**Impact**: -~180 lines ✅

---

## ✅ Final Verification

### Build Check
```bash
pnpm build
```
**Expected**: Success, no errors

### Test Check
```bash
pnpm test
```
**Expected**: All tests pass

### Import Check
```bash
# Verify no imports of deleted code
grep -r "PaneCreationService\|InputHandler\|launchMergePopup" src --include="*.ts" --include="*.tsx"
```
**Expected**: Zero matches (except in deleted files)

### Git Status
```bash
git status
```
**Expected**: Shows deleted files and edited files

---

## 🎯 Total Impact Summary

| Phase | Files Deleted | Lines Removed | Time |
|-------|--------------|---------------|------|
| Phase 0: Orphaned Services | 2 files + edits | -974 | 15 min |
| Phase 1: Frontend Artifacts | 10 files | -~94KB | 5 min |
| Phase 2: Server Static | 1 file | -3,042 | 1 min |
| Phase 3: Merge Validation | Partial | -180 | 20 min |
| **TOTAL** | **13 files + edits** | **-4,196** | **45 min** |

---

## 📝 Commit Message Template

```
refactor: remove verified dead code from audit (4,196 lines)

Phase 0: Remove Phase 4 orphaned services (-974 lines)
- Delete PaneCreationService.ts (never integrated)
- Delete InputHandler.ts (never instantiated)
- Remove launchMergePopup() from PopupManager (replaced by actions)
- Clean up useServices.ts (remove dead config)

Phase 1: Delete frontend extraction artifacts (-94KB)
- Remove 10 orphaned .js files from Vue migration

Phase 2: Delete server static file (-3,042 lines)
- Remove src/server/static.ts (replaced by embedded assets)

Phase 3: Clean mergeValidation.ts (-180 lines)
- Keep only validateMerge() function
- Remove 7 unused helper functions

Build verification: ✅ pnpm build succeeds
Test verification: ✅ All tests pass
Impact: 27% reduction in codebase size

See AUDIT_FINAL_SUMMARY.md for complete audit findings
```

---

## 🚫 DO NOT DELETE

These were verified as **actively used** (despite original audit claims):

- ❌ `src/utils/mergeExecution.ts` - Used by action system
- ❌ `src/utils/welcomePaneManager.ts` - Used by pane lifecycle
- ❌ `src/actions/merge/*` - Recent refactoring, intentional architecture

---

## 📚 Documentation References

- **Quick guide**: `AUDIT_FINAL_SUMMARY.md`
- **Detailed analysis**: `AUDIT_PHASE4_SERVICES.md`
- **Verification**: `AUDIT_CORRECTIONS.md`
- **Original audit**: `AUDIT_REPORT.md`

---

## ✨ After Cleanup

Once completed:

1. ✅ Build succeeds
2. ✅ Tests pass
3. ✅ Codebase is 27% smaller
4. ✅ No functionality lost
5. ✅ Removed incomplete refactoring artifacts
6. ✅ Clearer code organization

**Next Steps** (optional, future work):
- DRY consolidation (git/tmux operations) - 150 more lines
- See `AUDIT_CORRECTIONS.md` Priority 3 for details
