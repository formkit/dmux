# Codebase Refactoring Analysis & Recommendations

## Progress Tracker

### Phase 1: Quick Wins ✅ COMPLETED
- [x] **Step 1.1:** Delete 6 unused text input components (1,832 lines)
- [x] **Step 1.2:** Reorganize root-level files into proper directories
- [x] **Step 1.3:** Update all imports across codebase
- [x] **Step 1.4:** Verify build passes with no errors
- [x] **Commit:** `67657e7` - "refactor: phase 1 cleanup - remove dead code and reorganize files"

**Impact:** Codebase reduced by 6% (1,832 lines), improved file organization

---

### Phase 2: Split Monolithic Action System ✅ COMPLETED
- [x] **Step 2.1:** Create action file structure (8 new files in `src/actions/implementations/`)
- [x] **Step 2.2:** Extract VIEW action → `viewAction.ts`
- [x] **Step 2.3:** Extract CLOSE action → `closeAction.ts`
- [x] **Step 2.4:** Extract MERGE action → `mergeAction.ts`
- [x] **Step 2.5:** Extract remaining 5 actions (RENAME, DUPLICATE, COPY_PATH, OPEN_IN_EDITOR, TOGGLE_AUTOPILOT)
- [x] **Step 2.6:** Create exports barrel in `implementations/index.ts`
- [x] **Step 2.7:** Update `paneActions.ts` to re-export from implementations
- [x] **Step 2.8:** Verify build passes with no errors
- [x] **Commit:** Phase 2 completion

**Impact Achieved:**
- `paneActions.ts` reduced from 1,222 lines → 18 lines (98.5% reduction!)
- 8 focused action files created in `src/actions/implementations/`
- Maintained backward compatibility via re-exports
- Improved testability and maintainability

---

### Phase 2.5: Refactor Merge Action (TDD Approach) ✅ COMPLETED

**Problem:** `mergeAction.ts` was monolithic (804 lines, 7 functions). Needed modularization and comprehensive testing.

**Current Structure Analysis:**
```
mergeAction.ts (804 lines)
├── generateCommitMessageSafe() - 28 lines
├── mergePane() - 48 lines (main entry point)
├── handleMergeIssues() - 462 lines! (massive nested logic)
│   ├── Main dirty handling (192 lines)
│   ├── Worktree uncommitted handling (186 lines)
│   └── Merge conflict handling (42 lines)
├── createConflictResolutionPaneForMerge() - 58 lines
├── createAndLaunchConflictPane() - 48 lines
├── executeMergeWithConflictHandling() - 70 lines
└── executeMerge() - 66 lines
```

**Refactoring Plan (TDD):**

#### Step 2.5.1: Extract Commit Message Handling
Create `src/actions/merge/commitMessageHandler.ts`:
- `generateCommitMessageSafe()` - moved from mergeAction
- `promptForCommitMessage()` - extract common pattern
- `handleCommitWithOptions()` - DRY up the 3 commit option flows

**Tests First:** Write tests for commit message generation, timeouts, fallbacks

#### Step 2.5.2: Extract Merge Issue Handlers
Create separate handlers in `src/actions/merge/issueHandlers/`:
- `mainDirtyHandler.ts` - Handle uncommitted changes in main (192 lines → 80)
- `worktreeUncommittedHandler.ts` - Handle uncommitted in worktree (186 lines → 80)
- `mergeConflictHandler.ts` - Handle merge conflicts (42 lines)
- `nothingToMergeHandler.ts` - Handle no-op case

**Tests First:** Write tests for each issue type independently

#### Step 2.5.3: Extract Conflict Resolution
Create `src/actions/merge/conflictResolution.ts`:
- `createConflictResolutionPaneForMerge()` - moved
- `createAndLaunchConflictPane()` - moved
- Better separation of agent selection logic

**Tests First:** Test conflict pane creation, agent selection

#### Step 2.5.4: Extract Merge Execution
Create `src/actions/merge/mergeExecution.ts`:
- `executeMergeWithConflictHandling()` - moved
- `executeMerge()` - moved
- Simplified error handling

**Tests First:** Test merge execution paths, cleanup

#### Step 2.5.5: Simplify Main Action
Update `mergeAction.ts` to orchestrate (target: <100 lines):
```typescript
export async function mergePane(pane, context, params) {
  // 1. Validation
  if (!pane.worktreePath) return noWorktreeError();

  // 2. Pre-merge checks
  const validation = await validateMerge(...);
  if (!validation.canMerge) {
    return handleMergeIssues(pane, context, validation);
  }

  // 3. Confirmation
  return confirmMerge(pane, context, validation);
}
```

**Tests First:** Integration tests for full merge flows

#### Step 2.5.6: Add Comprehensive Tests ✅ COMPLETED
- [x] Unit tests for each extracted module (43 tests total)
- [x] Integration tests for merge workflows (9 integration tests)
- [x] Edge case tests (conflicts, dirty state, errors)
- [x] All tests passing

#### Step 2.5.7: Verify Implementation ✅ COMPLETED
- [x] Build passes successfully
- [x] All modules import correctly
- [x] 43 tests passing (100% pass rate)
- [x] Ready for manual testing

**Target Structure:**
```
src/
├── utils/                              # ✅ KEEP: Shared domain logic
│   ├── mergeValidation.ts              # Used by action + popup
│   ├── mergeExecution.ts               # Used by action + popup
│   └── aiMerge.ts                      # Used by action + popup
│
└── actions/
    ├── implementations/
    │   └── mergeAction.ts              # < 100 lines - orchestration only
    │
    └── merge/                          # NEW: Action-specific UI logic
        ├── commitMessageHandler.ts     # ActionResult flows for commits
        ├── issueHandlers/              # ActionResult flows for issues
        │   ├── mainDirtyHandler.ts     # Returns choice dialogs
        │   ├── worktreeUncommittedHandler.ts
        │   ├── mergeConflictHandler.ts
        │   └── nothingToMergeHandler.ts
        └── types.ts                    # Action-specific types
```

**Key Principle:**
- `src/utils/` = Domain logic (pure functions, no UI, reusable)
- `src/actions/merge/` = UI logic (ActionResult objects, action-specific)
- Utilities are already shared by `mergePopup.tsx` - keep them reusable!

**Achieved Impact:**
- ✅ `mergeAction.ts`: 804 lines → 104 lines (87% reduction!)
- ✅ 8 focused, testable modules created:
  - `commitMessageHandler.ts` (166 lines) - 15 tests
  - `mainDirtyHandler.ts` (80 lines) - tested via issueHandlers
  - `worktreeUncommittedHandler.ts` (68 lines) - tested via issueHandlers
  - `mergeConflictHandler.ts` (62 lines) - tested via issueHandlers
  - `nothingToMergeHandler.ts` (14 lines) - tested via issueHandlers
  - `conflictResolution.ts` (117 lines) - 6 tests
  - `mergeExecution.ts` (150 lines) - tested via integration
  - `mergeAction.ts` (104 lines) - 9 integration tests
- ✅ 43 unit + integration tests (100% passing)
- ✅ Full TDD approach followed
- ✅ Build successful, ready for testing!

**Files Created:**
- `src/actions/merge/commitMessageHandler.ts`
- `src/actions/merge/issueHandlers/mainDirtyHandler.ts`
- `src/actions/merge/issueHandlers/worktreeUncommittedHandler.ts`
- `src/actions/merge/issueHandlers/mergeConflictHandler.ts`
- `src/actions/merge/issueHandlers/nothingToMergeHandler.ts`
- `src/actions/merge/issueHandlers/index.ts`
- `src/actions/merge/conflictResolution.ts`
- `src/actions/merge/mergeExecution.ts`
- `tests/actions/merge/commitMessageHandler.test.ts`
- `tests/actions/merge/issueHandlers.test.ts`
- `tests/actions/merge/conflictResolution.test.ts`
- `tests/actions/merge/mergeAction.integration.test.ts`

---

### Phase 3: Modularize Server Routes ✅ COMPLETED
- [x] **Step 3.1:** Create `src/server/routes/` directory structure
- [x] **Step 3.2:** Extract panes routes → `panesRoutes.ts`
- [x] **Step 3.3:** Extract stream routes → `streamRoutes.ts`
- [x] **Step 3.4:** Extract keys routes → `keysRoutes.ts`
- [x] **Step 3.5:** Extract actions routes → `actionsRoutes.ts`
- [x] **Step 3.6:** Extract settings/session routes → `settingsRoutes.ts`
- [x] **Step 3.7:** Extract tunnel routes → `tunnelRoutes.ts`
- [x] **Step 3.8:** Extract health/static routes → `healthRoutes.ts`
- [x] **Step 3.9:** Create main router assembly in `routes/index.ts`
- [x] **Step 3.10:** Update `routes.ts` to re-export from new structure
- [x] **Step 3.11:** Verify build passes with no errors
- [x] **Step 3.12:** Verify all tests pass (158/158 relevant tests)
- [x] **Commit:** `2e9d97b` - "refactor: phase 3 - modularize server routes"

**Impact Achieved:**
- `routes.ts` reduced from 1,057 lines → 17 lines (98.4% reduction!)
- 7 focused route modules created in `src/server/routes/`:
  - `panesRoutes.ts` (467 lines) - Pane CRUD, snapshot, test/dev status
  - `streamRoutes.ts` (100 lines) - SSE streaming, stats, test stream
  - `keysRoutes.ts` (127 lines) - Keystroke input with special key mapping
  - `actionsRoutes.ts` (139 lines) - Action system + callback endpoints
  - `settingsRoutes.ts` (188 lines) - Settings, session, hooks, logs
  - `tunnelRoutes.ts` (33 lines) - Tunnel creation
  - `healthRoutes.ts` (79 lines) - Health check + static file serving
  - `index.ts` (74 lines) - Main router assembly with CORS
- Clear domain separation
- Maintained backward compatibility
- All tests pass (158/158)

**Files Created:**
- `src/server/routes/panesRoutes.ts`
- `src/server/routes/streamRoutes.ts`
- `src/server/routes/keysRoutes.ts`
- `src/server/routes/actionsRoutes.ts`
- `src/server/routes/settingsRoutes.ts`
- `src/server/routes/tunnelRoutes.ts`
- `src/server/routes/healthRoutes.ts`
- `src/server/routes/index.ts`

**Updated:**
- `src/server/routes.ts` → Re-exports setupRoutes from routes/index.ts

---

### Phase 4: Refactor DmuxApp.tsx 🔄 IN PROGRESS (Services Extracted)
- [x] **Step 4.1:** Extract PopupManager service (629 lines)
- [x] **Step 4.2:** Extract InputHandler service (409 lines)
- [x] **Step 4.3:** Extract PaneCreationService (477 lines)
- [x] **Step 4.3.1:** Create useServices hook for initialization (100 lines)
- [x] **Step 4.3.2:** Verify all services compile successfully ✅
- [ ] **Step 4.4:** Integrate services into DmuxApp.tsx (NEXT SESSION)
- [ ] **Step 4.5:** Remove duplicate code from DmuxApp.tsx
- [ ] **Step 4.6:** Add unit tests for each service
- [ ] **Step 4.7:** Add integration tests for service interactions
- [ ] **Step 4.8:** Add E2E tests for full workflows
- [ ] **Step 4.9:** Verify all TUI functionality works
- [ ] **Commit:** Phase 4 completion

**Expected Impact:** DmuxApp.tsx reduced from 2,594 → ~1,200 lines (54% reduction)

**Services Created (1,615 lines total):**
1. `src/services/PopupManager.ts` - 629 lines
   - Extracted all 13 popup launchers
   - Applied DRY principles with `launchPopup()` and `handleResult()` helpers
   - 27% code reduction from original extraction (869 → 629 lines)

2. `src/services/InputHandler.ts` - 409 lines
   - Extracted all keyboard input routing from `useInput` hook
   - Handles quit confirmation, dialog states, navigation, action shortcuts
   - Clean separation of input handling from UI rendering

3. `src/services/PaneCreationService.ts` - 477 lines
   - Extracted the massive 362-line `createNewPane` function
   - Handles worktree creation, agent launching (Claude/opencode)
   - Auto-approval of Claude trust prompts
   - Proper error handling and cleanup

4. `src/hooks/useServices.ts` - 100 lines
   - Clean hook for service initialization
   - Manages service dependencies and lifecycle
   - Memoized to prevent unnecessary recreations

**Files Created:**
- `src/services/PopupManager.ts`
- `src/services/InputHandler.ts`
- `src/services/PaneCreationService.ts`
- `src/hooks/useServices.ts`

**Build Status:** ✅ All services compile successfully with no errors

**Next Steps (Integration Phase):**
1. Import services into DmuxApp.tsx via useServices hook
2. Replace all popup launcher method calls with `popupManager.*` calls
3. Replace `useInput` logic with `inputHandler.handleInput()`
4. Replace `createNewPane` with `paneCreationService.createPane()`
5. Remove all duplicate popup launcher methods (~1,100 lines)
6. Remove duplicate `createNewPane` function (~360 lines)
7. Verify build passes and all functionality works
8. Target: DmuxApp.tsx reduced to ~1,200 lines

---

Based on the comprehensive exploration, I've identified critical areas for refactoring. Here's a detailed analysis with a phased approach:

## Executive Summary

**Total Lines Analyzed:** 29,770 lines across 85 TypeScript files

**Major Issues Identified:**
1. **1,832 lines** of unused/deprecated text input components (dead code)
2. **DmuxApp.tsx** - 2,595 lines monolithic component handling TUI, state, popups, and business logic
3. **paneActions.ts** - 1,222 lines with all action implementations in one file
4. **server/routes.ts** - 1,057 lines with all API endpoints
5. Poor file organization with 17 files in src/ root that should be in subdirectories

---

## Critical Findings

### 1. Deprecated Code (HIGHEST IMPACT - DELETE IMMEDIATELY)

**6 unused text input components** (1,832 lines total):
- `src/BetterTextInput.tsx` (228 lines)
- `src/EnhancedTextInput.tsx` (520 lines)
- `src/SimpleEnhancedInput.tsx` (749 lines)
- `src/GeminiTextInput.tsx` (271 lines)
- `src/MultilineTextInput.tsx` (245 lines)
- `src/SimpleGeminiInput.tsx` (274 lines)

**Only `CleanTextInput.tsx` is actively used** - all others can be safely deleted.

**Impact:** Reduces codebase by 6% instantly, improves maintainability

---

### 2. Monolithic DmuxApp.tsx (2,595 lines)

**Current Responsibilities (TOO MANY):**
- TUI rendering
- State management
- 15+ popup launchers (100-300 lines each)
- Input handling
- Pane creation (360-line `createNewPane` function)
- Layout management
- Agent selection
- Update checking
- Tunnel management

**Key Problem Areas:**
- Lines 425-516: `launchNewPanePopup()`
- Lines 518-628: `launchKebabMenuPopup()`
- Lines 1158-1289: `launchMergePopup()`
- Lines 1647-2009: `createNewPane()` - massive function with 8 different responsibilities

**Symptoms of Poor Modularity:**
- Difficult to test individual features
- High cognitive load when making changes
- Mixed concerns (UI + business logic + system operations)
- Hard to trace bugs

---

### 3. Monolithic Action System (1,222 lines)

**Current Structure:** Single file `actions/paneActions.ts` contains:
- VIEW, CLOSE, MERGE, RENAME, DUPLICATE
- RUN_TEST, RUN_DEV, OPEN_OUTPUT
- COPY_PATH, OPEN_IN_EDITOR, TOGGLE_AUTOPILOT

**Problems:**
- 280 lines just for `mergePane` action
- Testing requires loading entire file
- Adding new actions increases file size
- Risk of unintended side effects

---

### 4. Large Server Routes File (1,057 lines)

All API endpoints mixed together without clear separation:
- Pane CRUD operations
- Keystroke handling
- Terminal streaming
- Action execution
- Tunnel management
- Health checks
- Settings API

---

## Phased Refactoring Plan

### **PHASE 1: Quick Wins (1-2 days, LOW RISK)**

**Goal:** Remove dead code and reorganize files

#### Step 1.1: Delete Unused Text Input Components
```bash
# Delete 6 unused files (1,832 lines)
rm src/BetterTextInput.tsx
rm src/EnhancedTextInput.tsx
rm src/SimpleEnhancedInput.tsx
rm src/GeminiTextInput.tsx
rm src/MultilineTextInput.tsx
rm src/SimpleGeminiInput.tsx
```

**Testing:** Run `pnpm build` - if no errors, deletion is safe

#### Step 1.2: Reorganize Root-Level Files
```bash
# Create organized directories
mkdir -p src/inputs
mkdir -p src/panes

# Move files to proper locations
mv src/CleanTextInput.tsx src/inputs/
mv src/StyledTextInput.tsx src/inputs/
mv src/MergePane.tsx src/components/
mv src/PaneAnalyzer.ts src/services/
mv src/AutoUpdater.ts src/services/
mv src/decorative-pane.ts src/panes/
mv src/spacer-pane.ts src/panes/
```

**Testing:** Update imports, run `pnpm build`

**Expected Impact:**
- Remove 6% of codebase
- Clearer file organization
- Easier navigation

---

### **PHASE 2: Split Monolithic Action System (3-4 days, MEDIUM RISK)**

**Goal:** One action per file for maintainability

#### Step 2.1: Create Action File Structure
```
src/actions/
├── types.ts (235 lines) - KEEP
├── index.ts (74 lines) - UPDATE
├── viewAction.ts (~80 lines) - NEW
├── closeAction.ts (~120 lines) - NEW
├── mergeAction.ts (~280 lines) - NEW (largest)
├── renameAction.ts (~50 lines) - NEW
├── duplicateAction.ts (~60 lines) - NEW
├── runTestAction.ts (~80 lines) - NEW
├── runDevAction.ts (~80 lines) - NEW
├── openOutputAction.ts (~40 lines) - NEW
├── copyPathAction.ts (~30 lines) - NEW
├── openInEditorAction.ts (~50 lines) - NEW
└── toggleAutopilotAction.ts (~30 lines) - NEW
```

#### Step 2.2: Extract Each Action
For each action:
1. Create new file in `src/actions/`
2. Move action function + helper functions
3. Export from `index.ts`
4. Update imports in adapters

#### Step 2.3: Testing Strategy
```typescript
// Create tests/actions/closeAction.test.ts
import { closePane } from '../src/actions/closeAction.js';

describe('closePane', () => {
  it('should present cleanup options for worktree panes', async () => {
    const mockPane = {
      id: 'test-1',
      slug: 'test-pane',
      worktreePath: '/path/to/worktree',
      // ...
    };

    const result = await closePane(mockPane, mockContext);
    expect(result.type).toBe('choice');
    expect(result.options).toHaveLength(3);
  });

  it('should close shell panes immediately', async () => {
    const mockPane = { type: 'shell', /* ... */ };
    const result = await closePane(mockPane, mockContext);
    expect(result.type).toBe('success');
  });
});
```

**Expected Impact:**
- 12 focused, testable files instead of 1 monolith
- Easier to add new actions
- Isolated testing per action
- Reduced cognitive load

---

### **PHASE 3: Modularize Server Routes (2-3 days, MEDIUM RISK)**

**Goal:** Split routes by domain concern

#### Step 3.1: Create Route Modules
```
src/server/routes/
├── index.ts (main router) - NEW
├── panesRoutes.ts (CRUD endpoints) - NEW
├── streamRoutes.ts (SSE streaming) - NEW
├── keysRoutes.ts (keystroke input) - NEW
├── actionsRoutes.ts (action execution) - NEW
├── tunnelRoutes.ts (remote tunnel) - NEW
└── healthRoutes.ts (health/status) - NEW
```

#### Step 3.2: Extract Route Groups
```typescript
// src/server/routes/panesRoutes.ts
import express from 'express';

export function createPanesRoutes(stateManager: StateManager) {
  const router = express.Router();

  router.get('/api/panes', async (req, res) => {
    // List panes logic
  });

  router.post('/api/panes', async (req, res) => {
    // Create pane logic
  });

  return router;
}
```

#### Step 3.3: Main Router Assembly
```typescript
// src/server/routes/index.ts
import { createPanesRoutes } from './panesRoutes.js';
import { createStreamRoutes } from './streamRoutes.js';
// ... other imports

export function createRoutes(stateManager: StateManager) {
  const router = express.Router();

  router.use(createPanesRoutes(stateManager));
  router.use(createStreamRoutes(stateManager));
  // ... other routes

  return router;
}
```

**Testing:** Integration tests for each route module

**Expected Impact:**
- 7 focused route files (~150 lines each) instead of 1 large file
- Domain separation (panes vs streaming vs actions)
- Easier to understand API structure

---

### **PHASE 4: Refactor DmuxApp.tsx (4-6 days, HIGH RISK)**

**Goal:** Extract services and reduce to pure rendering logic

#### Step 4.1: Extract Popup Manager Service
```typescript
// src/services/PopupManager.ts
export class PopupManager {
  constructor(private config: PopupConfig) {}

  async launchNewPanePopup(): Promise<string | null> { /* ... */ }
  async launchKebabMenuPopup(pane: DmuxPane): Promise<PaneAction | null> { /* ... */ }
  async launchMergePopup(pane: DmuxPane): Promise<MergeResult> { /* ... */ }
  async launchConfirmPopup(title: string, message: string): Promise<boolean> { /* ... */ }
  async launchChoicePopup(options: ChoiceOptions): Promise<string | null> { /* ... */ }
  async launchInputPopup(config: InputConfig): Promise<string | null> { /* ... */ }
  async launchProgressPopup(message: string, type: string): Promise<void> { /* ... */ }
  async launchSettingsPopup(): Promise<void> { /* ... */ }
  async launchLogsPopup(): Promise<void> { /* ... */ }
  async launchHooksPopup(): Promise<void> { /* ... */ }
  async launchShortcutsPopup(): Promise<void> { /* ... */ }
  async launchRemotePopup(): Promise<void> { /* ... */ }
}
```

#### Step 4.2: Extract Input Handler Service
```typescript
// src/services/InputHandler.ts
export class InputHandler {
  constructor(
    private actionSystem: ActionSystem,
    private popupManager: PopupManager,
    private panes: DmuxPane[]
  ) {}

  async handleInput(input: string, key: any): Promise<void> {
    if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
      return this.handleNavigation(key);
    }

    if (input === 'n') {
      return this.popupManager.launchNewPanePopup();
    }

    if (input === 'j') {
      return this.actionSystem.executeAction(PaneAction.VIEW, this.selectedPane);
    }

    // ... other handlers
  }
}
```

#### Step 4.3: Extract Pane Creation Service
```typescript
// src/services/PaneCreationService.ts
export class PaneCreationService {
  async createPane(prompt: string, agent?: 'claude' | 'opencode'): Promise<DmuxPane> {
    const slug = await this.generateSlug(prompt);
    const worktreePath = await this.createWorktree(slug);
    const paneId = await this.splitTmuxPane();
    await this.launchAgent(paneId, agent, prompt);
    return this.buildPaneObject(slug, prompt, paneId, worktreePath, agent);
  }

  private async generateSlug(prompt: string): Promise<string> { /* ... */ }
  private async createWorktree(slug: string): Promise<string> { /* ... */ }
  private async splitTmuxPane(): Promise<string> { /* ... */ }
  private async launchAgent(paneId: string, agent: string, prompt: string): Promise<void> { /* ... */ }
}
```

#### Step 4.4: Refactored DmuxApp Structure
```typescript
// src/DmuxApp.tsx (target: ~1,200 lines)
const DmuxApp: React.FC<DmuxAppProps> = (props) => {
  // Services
  const popupManager = usePopupManager();
  const inputHandler = useInputHandler();
  const paneCreationService = usePaneCreationService();

  // State (minimal)
  const { panes, selectedIndex, setSelectedIndex } = usePanes();

  // Input handling (delegated)
  useInput((input, key) => {
    inputHandler.handleInput(input, key);
  });

  // Pure rendering
  return (
    <Box>
      <PanesGrid panes={panes} selectedIndex={selectedIndex} />
      <FooterHelp />
    </Box>
  );
};
```

**Testing Strategy:**
1. Test services in isolation
2. Integration tests for service interactions
3. E2E tests for full workflows

**Expected Impact:**
- DmuxApp.tsx: 2,595 → ~1,200 lines (54% reduction)
- 3 new focused services
- Testable business logic
- Clearer separation of concerns

---

## Testing Strategy for Each Phase

### Phase 1 (Quick Wins)
```bash
# After deletion
pnpm build
pnpm test # if tests exist

# Manual verification
./dmux # Should launch normally
# Press 'n' to create pane (tests input system)
```

### Phase 2 (Action System)
```bash
# Create unit tests for each action
pnpm test tests/actions/*.test.ts

# Integration test
# Use TUI and web dashboard to execute all actions
```

### Phase 3 (Server Routes)
```bash
# API integration tests
curl http://localhost:PORT/api/panes
curl -X POST http://localhost:PORT/api/panes -d '{"prompt":"test"}'

# Automated tests
pnpm test tests/api/*.test.ts
```

### Phase 4 (DmuxApp)
```bash
# Unit tests for services
pnpm test tests/services/*.test.ts

# E2E tests
# - Create pane
# - Jump to pane
# - Merge pane
# - Close pane
# - Open settings
# - View logs
```

---

## Risk Mitigation

### Low Risk (Phase 1)
- **Grep search** confirms unused files have no imports
- Version control allows instant rollback
- Build errors surface immediately

### Medium Risk (Phases 2-3)
- **One action/route at a time** - incremental extraction
- Keep old code until all tests pass
- Feature flagging for gradual rollout

### High Risk (Phase 4)
- **Staged extraction** - one service at a time
- Extensive testing after each extraction
- Beta testing period before merging
- Rollback plan in place

---

## Success Metrics

**After Phase 1:**
- ✅ Codebase reduced by 1,832 lines (6%)
- ✅ All files in proper directories
- ✅ Build passes without errors

**After Phase 2:**
- ✅ 12 action files with avg 80 lines each
- ✅ 100% test coverage for actions
- ✅ New actions can be added in <50 lines

**After Phase 3:**
- ✅ 7 route modules with clear domains
- ✅ API tests for all endpoints
- ✅ Easier to add new endpoints

**After Phase 4:**
- ✅ DmuxApp.tsx reduced to ~1,200 lines (54% reduction)
- ✅ 3 reusable services
- ✅ Services have 80%+ test coverage
- ✅ Improved maintainability score

---

## Recommended Execution Order

1. **Week 1:** Phase 1 (Quick Wins) - Delete dead code, reorganize files
2. **Week 2:** Phase 2 (Action System) - Split paneActions.ts into modules
3. **Week 3:** Phase 3 (Server Routes) - Modularize API endpoints
4. **Weeks 4-5:** Phase 4 (DmuxApp) - Extract services, refactor component

**Total Timeline:** 5 weeks for complete refactoring

**Alternative:** Execute Phase 1 immediately (1 day), then prioritize based on pain points

---

## Additional Recommendations

### Future Improvements (Post-Refactoring)
1. **Consolidate merge utilities** - `mergeValidation.js`, `mergeExecution.js`, `aiMerge.js` could be unified
2. **Extract popup components** - Reduce duplication in popup implementations
3. **TypeScript strict mode** - Enable stricter type checking
4. **Documentation generation** - Auto-generate API docs from route modules
5. **Performance monitoring** - Add metrics to services

### Architecture Principles Going Forward
- **Single Responsibility:** Each file/module has ONE clear purpose
- **Testability:** Services are dependency-injected and mockable
- **Modularity:** New features should be isolated modules
- **Documentation:** README.md per module explaining purpose and usage

---

## Conclusion

The codebase has significant technical debt in the form of:
- **1,832 lines of dead code** (delete immediately)
- **Monolithic files** handling too many concerns
- **Poor file organization** making navigation difficult

The phased approach allows **incremental, testable refactoring** with clear rollback points. **Phase 1 can be completed in 1 day** with immediate benefits, while **Phases 2-4 provide long-term maintainability improvements**.

**Recommendation:** Start with Phase 1 this week, then assess pain points to prioritize Phases 2-4.
