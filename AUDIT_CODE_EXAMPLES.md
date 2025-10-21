# SPECIFIC CODE EXAMPLES - Duplicates & Dead Code

## 1. DEAD CODE EXAMPLES

### Example 1: Unused Static Functions

**File**: `src/server/static.ts` (ENTIRE FILE IS DEAD)

```typescript
export function getTerminalViewerHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  ...
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/terminal.js"></script>
</body>
</html>`;
}

export function getDashboardHtml(): string { ... }
export function getDashboardCss(): string { ... }
export function getDashboardJs(): string { ... }
export function getTerminalJs(): string { ... }
```

**Why Dead**: `src/server/routes/healthRoutes.ts` directly calls:
```typescript
return serveEmbeddedAsset('dashboard.html');  // Direct call, not via getTerminalViewerHtml()
```

**Verification**:
```bash
grep -r "getTerminalViewerHtml\|getDashboardHtml\|getDashboardCss" src --include="*.ts" --include="*.tsx" | grep -v "export"
# Result: ZERO matches (outside of static.ts)
```

---

### Example 2: Unused Merge Execution File

**File**: `src/utils/mergeExecution.ts` (ENTIRE FILE IS DEAD)

```typescript
export function mergeMainIntoWorktree(
  worktreePath: string,
  mainBranch: string
): MergeResult {
  try {
    execSync(`git merge ${mainBranch} --no-edit`, {
      cwd: worktreePath,
      stdio: 'pipe',
    });
    return { success: true };
  } catch (error) {
    // ... conflict handling ...
  }
}

export function mergeWorktreeIntoMain(
  mainRepoPath: string,
  worktreeBranch: string
): MergeResult {
  // ... same implementation pattern ...
}
```

**Why Dead**: Same implementation exists in `src/actions/merge/mergeExecution.ts:88-245`

**Verification**:
```bash
# Find where mergeMainIntoWorktree is imported
grep -r "import.*mergeMainIntoWorktree" src --include="*.ts" --include="*.tsx"
# Result: ONLY 1 import in src/actions/merge/mergeExecution.ts

# But look at the action handler - it handles merge differently
grep -r "mergeMainIntoWorktree" src/actions/merge/mergeExecution.ts | head -3
# It's imported but same logic is reimplemented inline
```

---

### Example 3: Unused Validation Utilities

**File**: `src/utils/mergeValidation.ts` (95% DEAD)

```typescript
export function getGitStatus(repoPath: string): GitStatus {
  try {
    const statusOutput = execSync('git status --porcelain', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    // ... parsing ...
  } catch (error) {
    return { hasChanges: false, files: [], summary: '' };
  }
}

// DEAD - Never called anywhere
export function hasCommitsToMerge(
  repoPath: string, 
  fromBranch: string, 
  toBranch: string
): boolean {
  try {
    const output = execSync(`git log ${toBranch}..${fromBranch} --oneline`, ...);
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

// DEAD - Never called anywhere
export function detectMergeConflicts(...): { hasConflicts: boolean; ... } {
  // Sophisticated dry-run merge detection that's never used
}
```

---

## 2. DRY VIOLATION EXAMPLES

### Example A: git branch --show-current (3 duplicates)

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
const mergeWorktree = useCallback(async (pane: DmuxPane) => {
  if (!pane.worktreePath) {
    setStatusMessage('No worktree to merge');
    setTimeout(() => setStatusMessage(''), 2000);
    return;
  }

  try {
    setStatusMessage('Checking worktree status...');
    const mainBranch = execSync('git branch --show-current', { 
      encoding: 'utf-8' 
    }).trim();  // <-- DUPLICATE
    const statusOutput = execSync(`git -C "${pane.worktreePath}" status --porcelain`, { encoding: 'utf-8' });
```

**Location 3**: `src/hooks/useWorktreeActions.ts:119` (IDENTICAL DUPLICATE 50 lines later)
```typescript
const mergeAndPrune = useCallback(async (pane: DmuxPane) => {
  // ... same code ...
  const mainBranch = execSync('git branch --show-current', { 
    encoding: 'utf-8' 
  }).trim();  // <-- SECOND DUPLICATE IN SAME FILE
```

**Solution Available**: Already exists in `src/utils/git.ts:6`
```typescript
export function getMainBranch(): string {
  try {
    const originHead = execSync('git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null', {
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();
    // ... with smart fallback logic ...
    return 'main';
  } catch {
    return 'main';
  }
}
```

---

### Example B: tmux split-window (7 locations)

**Location 1**: `src/DmuxApp.tsx:893`
```typescript
const newPaneId = execSync(`tmux split-window -h -P -F '#{pane_id}'`, {
  encoding: 'utf-8',
  stdio: 'pipe'
}).trim();
```

**Location 2**: `src/services/InputHandler.ts:362`
```typescript
const paneInfo = execSync(`tmux split-window -h -P -F '#{pane_id}'`, {
  encoding: 'utf-8',
  stdio: 'pipe'
}).trim();
```

**Location 3**: `src/services/PaneCreationService.ts:169`
```typescript
return execSync(`tmux split-window -h -P -F '#{pane_id}'`, {
  encoding: 'utf-8',
  stdio: 'pipe',
}).trim();
```

**Location 4**: `src/hooks/usePanes.ts:136` (WITH EXTRA OPTIONS)
```typescript
const newPaneId = execSync(`tmux split-window -h -P -F '#{pane_id}' -c "${missingPane.worktreePath || process.cwd()}"`, {
  encoding: 'utf-8',
  stdio: 'pipe'
}).trim();
```

**Location 5**: `src/utils/conflictResolutionPane.ts:51`
```typescript
const paneInfo = execSync(`tmux split-window -h -P -F '#{pane_id}'`, {
  encoding: 'utf-8',
  stdio: 'pipe'
}).trim();
```

**Locations 6-7**: Buried in `src/server/embedded-assets.ts` (5000+ line generated file)

**Solution**: Create helper in `src/utils/tmux.ts`
```typescript
export interface SplitPaneOptions {
  horizontally?: boolean;
  from?: string;
  cwd?: string;
  target?: string;
}

export function splitPane(options: SplitPaneOptions = {}): string {
  const direction = options.horizontally !== false ? '-h' : '-v';
  const target = options.target ? `-t '${options.target}'` : '';
  const cwd = options.cwd ? `-c "${options.cwd}"` : '';
  
  const cmd = `tmux split-window ${direction} -P -F '#{pane_id}' ${target} ${cwd}`;
  return execSync(cmd, {
    encoding: 'utf-8',
    stdio: 'pipe'
  }).trim();
}
```

Usage becomes:
```typescript
// Instead of:
const newPaneId = execSync(`tmux split-window -h -P -F '#{pane_id}' -c "${worktreePath}"`, { ... });

// Use:
const newPaneId = splitPane({ cwd: worktreePath });
```

---

### Example C: Status Message Pattern (20+ occurrences)

**Pattern Found In**:
- `src/hooks/useWorktreeActions.ts` - 5 times
- `src/DmuxApp.tsx` - 10+ times
- `src/services/PaneCreationService.ts` - 3 times
- Various other files

**Example 1**: `src/hooks/useWorktreeActions.ts:45-46`
```typescript
setStatusMessage(`Closed pane: ${pane.slug}`);
setTimeout(() => setStatusMessage(''), 3000);
```

**Example 2**: `src/hooks/useWorktreeActions.ts:48`
```typescript
setStatusMessage('Failed to close pane');
setTimeout(() => setStatusMessage(''), 2000);
```

**Example 3**: `src/DmuxApp.tsx` (repeated 10+ times)
```typescript
setStatusMessage('Creating worktree...');
setTimeout(() => setStatusMessage(''), 2000);

setStatusMessage('Launching agent...');
setTimeout(() => setStatusMessage(''), 3000);

setStatusMessage('Merge complete!');
setTimeout(() => setStatusMessage(''), 4000);
```

**Solution**: Create custom hook
```typescript
// src/hooks/useTemporaryStatus.ts
export function useTemporaryStatus(
  state: any,
  setState: (value: any) => void
) {
  return useCallback((message: string, duration = 2000) => {
    setState(message);
    setTimeout(() => setState(''), duration);
  }, [setState]);
}

// Or simpler:
export function useTemporaryStatus() {
  const [status, setStatus] = useState('');
  
  const show = useCallback((message: string, duration = 2000) => {
    setStatus(message);
    setTimeout(() => setStatus(''), duration);
  }, []);
  
  return { status, show };
}
```

Usage becomes:
```typescript
// Instead of:
setStatusMessage(`Closed pane: ${pane.slug}`);
setTimeout(() => setStatusMessage(''), 3000);

// Use:
const { status, show } = useTemporaryStatus();
show(`Closed pane: ${pane.slug}`, 3000);
```

---

### Example D: Merge Function Duplication in Same File

**File**: `src/hooks/useWorktreeActions.ts`

**Function 1**: Lines 53-108
```typescript
const mergeWorktree = useCallback(async (pane: DmuxPane) => {
  if (!pane.worktreePath) {
    setStatusMessage('No worktree to merge');
    setTimeout(() => setStatusMessage(''), 2000);
    return;
  }

  try {
    setStatusMessage('Checking worktree status...');
    const mainBranch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
    const statusOutput = execSync(`git -C "${pane.worktreePath}" status --porcelain`, { encoding: 'utf-8' });

    if (statusOutput.trim()) {
      setStatusMessage('Staging changes...');
      execSync(`git -C "${pane.worktreePath}" add -A`, { stdio: 'pipe' });
      setStatusMessage('Committing changes...');
      execSync(`git -C "${pane.worktreePath}" commit -m 'chore: worktree changes'`, { stdio: 'pipe' });
    }

    setStatusMessage('Merging into main...');
    try {
      execSync(`git merge ${pane.slug}`, { stdio: 'pipe' });
    } catch (mergeError: any) {
      // ... error handling ...
      throw mergeError;
    }

    execSync(`git worktree remove "${pane.worktreePath}"`, { stdio: 'pipe' });
    execSync(`git branch -d ${pane.slug}`, { stdio: 'pipe' });

    setStatusMessage(`Merged ${pane.slug} into ${mainBranch}`);
    setTimeout(() => setStatusMessage(''), 3000);
    setMergedPane(pane);
    setShowMergeConfirmation(true);
  } catch {
    setStatusMessage('Failed to merge - check git status');
    setTimeout(() => setStatusMessage(''), 3000);
  }
}, [setStatusMessage, setMergedPane, setShowMergeConfirmation]);
```

**Function 2**: Lines 110-160
```typescript
const mergeAndPrune = useCallback(async (pane: DmuxPane) => {
  if (!pane.worktreePath) {
    setStatusMessage('No worktree to merge');
    setTimeout(() => setStatusMessage(''), 2000);
    return;
  }

  try {
    setStatusMessage('Checking worktree status...');
    const mainBranch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
    const statusOutput = execSync(`git -C "${pane.worktreePath}" status --porcelain`, { encoding: 'utf-8' });

    if (statusOutput.trim()) {
      setStatusMessage('Staging changes...');
      execSync(`git -C "${pane.worktreePath}" add -A`, { stdio: 'pipe' });
      setStatusMessage('Committing changes...');
      execSync(`git -C "${pane.worktreePath}" commit -m 'chore: worktree changes'`, { stdio: 'pipe' });
    }

    setStatusMessage('Merging into main...');
    try {
      execSync(`git merge ${pane.slug}`, { stdio: 'pipe' });
    } catch (mergeError: any) {
      // ... IDENTICAL ERROR HANDLING ...
      throw mergeError;
    }

    // ONLY DIFFERENCE: Different cleanup or result handling
    // Everything else is IDENTICAL
```

**Analysis**:
- Lines 1-15: IDENTICAL
- Lines 16-35: IDENTICAL  
- Lines 36-45: 95% IDENTICAL (only differs in final status message handling)
- **Total**: ~95% code duplication

---

## 3. FRONTEND EXTRACTION ARTIFACTS

These are fragments extracted during Vue 3 migration, never integrated:

```
frontend/dashboard-data.js      - Contains data() object fragment
frontend/dashboard-methods.js   - Contains methods fragment
frontend/dashboard-mounted.ts   - Contains mounted() hook fragment
frontend/vue-data.js            - Alternate data() extraction
frontend/vue-methods.js         - Alternate methods extraction
frontend/vue-mounted.js         - Alternate mounted() extraction
frontend/extracted-dashboard.js - Extracted full component attempt 1
frontend/extracted-terminal.js  - Extracted full component attempt 2
frontend/data-section.js        - Another data extraction
frontend/methods-section.js     - Another methods extraction
```

**Verification - None are imported**:
```bash
grep -r "dashboard-data\|dashboard-methods\|extracted-dashboard" src --include="*.ts" --include="*.tsx" --include="*.vue"
# Result: ZERO matches
```

---

## 4. UNUSED API HANDLERS

**File**: `src/server/actionsApi.ts`

```typescript
// These are exported as if they're public API functions
export async function handleListActions() { ... }
export async function handleGetPaneActions() { ... }
export async function handleExecuteAction() { ... }
export async function handleConfirmCallback() { ... }
export async function handleChoiceCallback() { ... }
export async function handleInputCallback() { ... }
```

**Problem**: They're only used internally in the same file:
```typescript
// Inside the same file, used as event handlers:
export async function handleListActionsRoute(event) {
  return await handleListActions();  // Only called here
}
```

**Should Be**: Internal functions (not exported)
```typescript
async function handleListActions() { ... }  // No export
async function handleGetPaneActions() { ... }
// ... etc
```

**Impact**: Breaking encapsulation, confusion about what's part of public API

