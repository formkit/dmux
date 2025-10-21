# QUICK REFERENCE: Dead Code & DRY Violations

## Critical Dead Code (DELETE NOW)

### Frontend Extraction Artifacts (10 files - DELETE ALL)
```
frontend/dashboard-data.js
frontend/dashboard-methods.js  
frontend/dashboard-mounted.js
frontend/vue-data.js
frontend/vue-methods.js
frontend/vue-mounted.js
frontend/extracted-dashboard.js
frontend/extracted-terminal.js
frontend/data-section.js
frontend/methods-section.js
```

### Server Static File (DELETE)
```
src/server/static.ts  (ALL 5 functions are unused)
- getTerminalViewerHtml()
- getDashboardHtml()
- getDashboardCss()
- getDashboardJs()
- getTerminalJs()
```

## Dead Utility Files

| File | Status | Lines | Recommendation |
|------|--------|-------|-----------------|
| `src/utils/mergeExecution.ts` | DEAD | 233 | DELETE (duplicated in actions/) |
| `src/utils/mergeValidation.ts` | 95% DEAD | 266 | DELETE or keep only `validateMerge()` |
| `src/utils/welcomePaneManager.ts` | DEAD | ~100 | DELETE all functions |
| `src/utils/popup.ts` | 90% DEAD | ~400 | DELETE function implementations |
| `src/utils/aiMerge.ts` | 85% DEAD | 358 | Keep only `aiResolveAllConflicts()` |
| `src/utils/hooks.ts` | 80% DEAD | ~400 | Keep only `triggerHook()` |

## DRY Violations Summary

### Git Operations (7+ duplicates)
```
Operation                   | Locations | Solution
git branch --show-current   | 3         | Use getMainBranch() from src/utils/git.ts
git status --porcelain      | 7         | Use hasUncommittedChanges() from src/utils/git.ts
git merge                   | 5         | Consolidate into single merge function
git add -A                  | 4         | Create git util helper
```

### Tmux Operations (7+ duplicates)
```
Operation                   | Locations | Solution
tmux split-window -h        | 7         | Create tmux:splitPane() helper
tmux kill-pane              | 3         | Create tmux:killPane() helper
tmux list-panes             | 3         | Create tmux:listPanes() helper
```

### Merge Execution (2 parallel implementations!)
```
Location 1: src/utils/mergeExecution.ts (DEAD)
  - mergeMainIntoWorktree()
  - mergeWorktreeIntoMain()
  - cleanupAfterMerge()

Location 2: src/actions/merge/mergeExecution.ts (ACTIVE)
  - Same functions, different implementation
  
SOLUTION: Delete utils/ version, use only actions/ version
```

### Status Message Pattern (20+ duplicates)
```
Repeated Pattern:
  setStatusMessage('Message');
  setTimeout(() => setStatusMessage(''), 2000);

SOLUTION: Create useTemporaryStatus(msg, duration) hook
SAVES: ~100 lines
```

## Duplicate Functions by File

### src/hooks/useWorktreeActions.ts
- `mergeWorktree()` and `mergeAndPrune()` have 95% identical logic
- Both do: status check → git add → git commit → git merge → cleanup
- Duplicate: Lines 53-108 and 110-160

### src/server/actionsApi.ts
- 6 functions exported but only used internally in same file
- Should not be exported (break encapsulation)

## Priority Fix Order

### PHASE 1 (Hour 1) - Delete Dead Code
1. Delete all 10 frontend/*.js files
2. Delete src/server/static.ts entirely
3. Delete src/utils/welcomePaneManager.ts entirely
4. Remove function implementations from src/utils/popup.ts (keep interfaces)

**Impact**: Clean up ~1,200 lines, 0 risk

### PHASE 2 (Hour 2-3) - Consolidate Git Operations
1. Move `getCurrentBranch()` from mergeValidation.ts to git.ts
2. Move `hasUncommittedChanges()` to git.ts (already there)
3. Delete mergeValidation.ts functions
4. Update imports in useWorktreeActions.ts

**Impact**: ~200 lines, low risk

### PHASE 3 (Hour 3-4) - Consolidate Tmux Operations
1. Create `src/utils/tmux.ts:splitPane(options)` helper
2. Replace all 7 split-window calls with splitPane()
3. Create `killPane()` and `listPanes()` helpers

**Impact**: ~140 lines, medium risk (affects pane creation)

### PHASE 4 (Hour 4+) - Merge Execution
1. Delete src/utils/mergeExecution.ts entirely
2. Update imports to use src/actions/merge/mergeExecution.ts
3. Consolidate duplicate merge logic

**Impact**: ~233 lines, high risk (affects merge workflow)

### PHASE 5 (Optional) - Further Consolidation
1. Extract useTemporaryStatus() hook
2. Consolidate hook utilities (keep only triggerHook())
3. Simplify aiMerge.ts

## Files Most Affected by Duplication

| File | Duplications | Severity |
|------|--------------|----------|
| src/hooks/useWorktreeActions.ts | 2 merge functions 95% identical | HIGH |
| src/utils/git.ts | Duplicated elsewhere | MEDIUM |
| src/utils/mergeExecution.ts | Entire file duplicated | HIGH |
| src/utils/mergeValidation.ts | 8 functions unused | MEDIUM |
| src/DmuxApp.tsx | Has inline split-window code | MEDIUM |
| src/services/PaneCreationService.ts | Has inline split-window code | MEDIUM |

## Testing After Cleanup

1. Create new pane (tests tmux operations)
2. Run merge workflow (tests merge consolidation)
3. Check git status display (tests git utils)
4. View pane content (tests capture functions)
5. Trigger hooks (tests hook system)

## Estimated Lines Saved
- Dead code removal: ~1,200 lines
- DRY violations fixed: ~500 lines  
- Unused exports removed: ~600 lines
- **TOTAL: ~2,300 lines (~15% of codebase)**

## Risk Assessment
- **Low Risk**: Delete frontend files, static.ts, popup functions
- **Medium Risk**: Git consolidation, tmux helpers
- **High Risk**: Merge execution path consolidation
- **Recommend**: Implement low risk first, test thoroughly

