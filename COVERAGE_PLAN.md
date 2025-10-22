# Coverage Plan: 11.68% → 60%
**Goal**: Achieve 60% line coverage before Phase 1 refactoring
**Current**: 11.68% lines | 26.6% functions | 53.78% branches
**Gap**: 48.32 percentage points
**Estimated Time**: 8-10 days

---

## Strategy Overview

### Coverage Math
- **Total source files**: 157 TypeScript files
- **Current coverage**: 11.68% of ~15,000 lines = ~1,750 lines covered
- **Target coverage**: 60% of ~15,000 lines = ~9,000 lines covered
- **Lines to cover**: ~7,250 additional lines

### Prioritization Strategy
1. **Critical paths first** - High impact on safety (per MAINTENANCE.md)
2. **High-value modules** - Large files with 0% coverage
3. **Quick wins** - Small utilities that boost percentage fast
4. **Integration over unit** - Test real workflows, not isolated functions

---

## Day-by-Day Implementation Plan

### Day 1-2: Pane Lifecycle Integration Tests
**Target**: Cover `src/utils/paneCreation.ts` (568 lines, currently 0%)
**Expected coverage gain**: +3-4%

#### Test File: `__tests__/integration/paneLifecycle.test.ts`

**Test Scenarios:**
1. **Create Pane Flow**
   ```typescript
   describe('Pane Creation Flow', () => {
     it('should generate slug from prompt');
     it('should create git worktree with branch');
     it('should split tmux pane');
     it('should launch agent with correct arguments');
     it('should save pane to config');
     it('should handle slug generation failure (fallback to timestamp)');
   });
   ```

2. **Close Pane Flow**
   ```typescript
   describe('Pane Closure Flow', () => {
     it('should kill tmux pane');
     it('should remove worktree');
     it('should cleanup branch');
     it('should recalculate layout after close');
     it('should trigger post-close hooks');
     it('should handle worktree removal failure gracefully');
   });
   ```

3. **Pane Rebinding Flow**
   ```typescript
   describe('Pane Rebinding', () => {
     it('should detect dead pane');
     it('should create new tmux pane');
     it('should relaunch agent with original prompt');
     it('should preserve worktree and slug');
   });
   ```

**Files Covered**:
- `src/utils/paneCreation.ts` (568 lines)
- `src/utils/paneRebinding.ts` (38 lines)
- `src/actions/implementations/closeAction.ts` (partial - already ~60%)

**Mocking Strategy**:
- Mock `execSync` for all tmux/git commands
- Mock `StateManager` for pane tracking
- Mock `triggerHook` for lifecycle events
- Mock OpenRouter API for slug generation

**Estimated Lines Covered**: ~500 lines
**Coverage Gain**: +3.3%

---

### Day 3-4: Git Operations Integration Tests
**Target**: Cover `src/utils/git.ts` (105 lines) + merge utils
**Expected coverage gain**: +2-3%

#### Test File: `__tests__/integration/gitOperations.test.ts`

**Test Scenarios:**
1. **Worktree Creation**
   ```typescript
   describe('Git Worktree Management', () => {
     it('should create worktree from main branch');
     it('should create new branch for worktree');
     it('should handle existing worktree path');
     it('should validate worktree path permissions');
   });
   ```

2. **Branch Operations**
   ```typescript
   describe('Branch Management', () => {
     it('should detect current branch');
     it('should detect main branch (origin/HEAD)');
     it('should switch branches');
     it('should handle detached HEAD state');
   });
   ```

3. **Merge Workflows** (expand existing tests)
   ```typescript
   describe('Merge Integration', () => {
     it('should merge main into worktree (step 1)');
     it('should merge worktree into main (step 2)');
     it('should detect conflicts during merge');
     it('should auto-generate commit message from diff');
     it('should cleanup worktree after successful merge');
     it('should handle merge conflicts with resolution pane');
   });
   ```

**Files Covered**:
- `src/utils/git.ts` (105 lines)
- `src/utils/mergeExecution.ts` (233 lines - already partially tested)
- `src/utils/mergeValidation.ts` (259 lines)

**Mocking Strategy**:
- Mock `execSync` for git commands
- Create test git repo in temp directory
- Mock OpenRouter API for commit message generation

**Estimated Lines Covered**: ~400 lines
**Coverage Gain**: +2.7%

---

### Day 5-6: Tmux Operations Integration Tests
**Target**: Cover `src/utils/tmux.ts` (currently 60.11%, need error paths)
**Expected coverage gain**: +2-3%

#### Test File: `__tests__/integration/tmuxOperations.test.ts`

**Test Scenarios:**
1. **Pane Splitting**
   ```typescript
   describe('Tmux Pane Operations', () => {
     it('should split pane horizontally');
     it('should split pane vertically');
     it('should set pane title');
     it('should resize pane to specific dimensions');
     it('should handle tmux split failure');
   });
   ```

2. **Layout Calculation & Application** (expand existing tests)
   ```typescript
   describe('Layout System Integration', () => {
     it('should calculate optimal layout for N panes');
     it('should generate valid layout string with checksum');
     it('should apply layout via tmux select-layout');
     it('should create spacer panes when needed');
     it('should enforce sidebar width');
     it('should handle window resize');
     it('should handle layout application failure');
   });
   ```

3. **Session Management**
   ```typescript
   describe('Session Management', () => {
     it('should detect existing session');
     it('should create new session');
     it('should attach to session');
     it('should list all panes in session');
     it('should get pane positions');
   });
   ```

**Files Covered**:
- `src/utils/tmux.ts` (remaining 40% of 529 lines = ~210 lines)
- `src/utils/layoutManager.ts` (remaining 77% of ~300 lines = ~230 lines)
- `src/layout/SpacerManager.ts` (180 lines, currently 40%)
- `src/layout/TmuxLayoutApplier.ts` (166 lines, currently 39%)

**Mocking Strategy**:
- Mock ALL `execSync` tmux commands
- Create mock tmux session state
- Test layout string generation separately from application

**Estimated Lines Covered**: ~450 lines
**Coverage Gain**: +3%

---

### Day 7-8: TUI Interactions Integration Tests
**Target**: Cover hooks and input handling
**Expected coverage gain**: +3-4%

#### Test File: `__tests__/integration/tuiInteractions.test.ts`

**Test Scenarios:**
1. **Keyboard Navigation**
   ```typescript
   describe('Keyboard Navigation', () => {
     it('should navigate list with up/down arrows');
     it('should select item with Enter');
     it('should cancel dialog with Escape');
     it('should trigger actions with keyboard shortcuts (j, x, m, n)');
   });
   ```

2. **Dialog Flows**
   ```typescript
   describe('Dialog Workflows', () => {
     it('should show new pane dialog on "n" key');
     it('should validate input and create pane');
     it('should show merge dialog on "m" key');
     it('should confirm merge and execute');
     it('should show close dialog on "x" key');
     it('should provide cleanup options');
   });
   ```

3. **Input Handling** (expand CleanTextInput tests)
   ```typescript
   describe('Text Input', () => {
     it('should handle single-line input');
     it('should handle word wrapping');
     it('should handle backspace/delete');
     it('should handle paste (bracketed paste mode)');
     it('should handle arrow key navigation');
   });
   ```

**Files Covered**:
- `src/hooks/useInputHandling.ts` (408 lines)
- `src/hooks/useNavigation.ts` (61 lines)
- `src/hooks/useActionSystem.ts` (259 lines)
- `src/components/inputs/CleanTextInput.tsx` (remaining 50% = ~440 lines)

**Mocking Strategy**:
- Use `ink-testing-library` for component rendering
- Mock stdin/stdout for key events
- Mock StateManager for state updates

**Estimated Lines Covered**: ~600 lines
**Coverage Gain**: +4%

---

### Day 9-10: Error Scenarios & Critical Services
**Target**: Cover error paths + high-value services
**Expected coverage gain**: +4-5%

#### Test File: `__tests__/integration/errorHandling.test.ts`

**Test Scenarios:**
1. **Tmux Command Failures**
   ```typescript
   describe('Tmux Error Handling', () => {
     it('should handle "pane not found" error');
     it('should handle "not enough space" error');
     it('should handle "session not found" error');
     it('should retry transient failures');
     it('should fail fast on permanent errors');
   });
   ```

2. **Git Command Failures**
   ```typescript
   describe('Git Error Handling', () => {
     it('should handle merge conflicts');
     it('should handle invalid branch names');
     it('should handle permission denied');
     it('should handle network failures (fetch/push)');
   });
   ```

3. **API Failures**
   ```typescript
   describe('External API Error Handling', () => {
     it('should handle OpenRouter API timeout');
     it('should handle OpenRouter API 429 rate limit');
     it('should fallback to timestamp slug on API failure');
     it('should fallback to basic commit message on API failure');
   });
   ```

4. **File System Errors**
   ```typescript
   describe('File System Error Handling', () => {
     it('should handle config file missing');
     it('should handle config file corrupt');
     it('should handle worktree path permission denied');
     it('should handle disk space full');
   });
   ```

**Files Covered**:
- Error paths in `paneCreation.ts`, `git.ts`, `tmux.ts`
- `src/services/LogService.ts` (remaining 46% = ~140 lines)
- `src/utils/slug.ts` (error path = ~20 lines)

**Estimated Lines Covered**: ~300 lines
**Coverage Gain**: +2%

#### Test File: `__tests__/integration/criticalServices.test.ts`

**Test Scenarios:**
1. **TerminalStreamer** (602 lines, 0% coverage)
   ```typescript
   describe('Terminal Streaming', () => {
     it('should capture pane output');
     it('should parse ANSI escape codes');
     it('should detect terminal motion');
     it('should stream output via SSE');
     it('should handle pane disappearance');
   });
   ```

2. **StateManager** (282 lines, 0% coverage)
   ```typescript
   describe('State Management', () => {
     it('should persist panes to config');
     it('should load panes from config');
     it('should update pane state');
     it('should emit state change events');
     it('should handle concurrent updates');
   });
   ```

3. **PopupManager** (577 lines, 0% coverage - partial)
   ```typescript
   describe('Popup Management', () => {
     it('should launch tmux popup');
     it('should handle popup close');
     it('should queue multiple popups');
     it('should detect popup completion');
   });
   ```

**Estimated Lines Covered**: ~600 lines
**Coverage Gain**: +4%

---

## Coverage Projection

| Day | Focus Area | Lines Covered | Cumulative % | Status |
|-----|-----------|---------------|--------------|--------|
| **Baseline** | - | 1,750 | 11.68% | ✅ Complete |
| **Day 1-2** | Pane Lifecycle | +500 | 15.0% | Planned |
| **Day 3-4** | Git Operations | +400 | 17.7% | Planned |
| **Day 5-6** | Tmux Operations | +450 | 20.7% | Planned |
| **Day 7-8** | TUI Interactions | +600 | 24.7% | Planned |
| **Day 9-10** | Errors + Services | +900 | 30.7% | Planned |
| **TOTAL** | - | 3,850 | **30.7%** | ⚠️ SHORT |

### ⚠️ Gap Analysis

**Projected coverage after 10 days**: 30.7%
**Target coverage**: 60%
**Remaining gap**: 29.3 percentage points = ~4,400 lines

### Additional Work Required

**Days 11-15: Additional Coverage (5 days)**

1. **DmuxApp.tsx** (787 lines, 0%)
   - Main component integration tests
   - State management flows
   - Dialog orchestration
   - **Coverage gain**: +5.2%

2. **Server & API Routes** (~1,500 lines, 0%)
   - API endpoint tests
   - SSE streaming tests
   - WebSocket tests
   - **Coverage gain**: +10%

3. **Hooks** (~2,000 lines, mostly 0%)
   - usePanes, usePaneSync, usePaneLoading
   - useAgentStatus, useAutoUpdater
   - useCommandRunner
   - **Coverage gain**: +13%

4. **Services** (remaining ~1,000 lines)
   - PaneAnalyzer, StatusDetector
   - AutoUpdater, ConfigWatcher
   - **Coverage gain**: +6.7%

**Total additional coverage**: +35%
**Final projected coverage**: 30.7% + 35% = **65.7%** ✅

---

## Revised Timeline

### Conservative Estimate: 15 days
- Days 1-2: Pane Lifecycle (+3.3%)
- Days 3-4: Git Operations (+2.7%)
- Days 5-6: Tmux Operations (+3%)
- Days 7-8: TUI Interactions (+4%)
- Days 9-10: Error Handling (+6%)
- Days 11-12: DmuxApp + Hooks (+10%)
- Days 13-14: Server/API + Services (+15%)
- Day 15: Buffer, cleanup, documentation

**Final Target**: 65% coverage (exceeds 60% minimum) ✅

### Aggressive Estimate: 10 days
- Focus only on critical paths
- Skip nice-to-have scenarios
- Accept 60% exact (not 65%)
- Higher risk of missing edge cases

**Recommendation**: Use **15-day plan** for safety and thoroughness.

---

## Success Criteria

### Coverage Thresholds
- [ ] Line coverage ≥ 60%
- [ ] Function coverage ≥ 60%
- [ ] Branch coverage ≥ 60% (already at 53.78%)
- [ ] Statement coverage ≥ 60%

### Critical Paths Covered
- [ ] Pane creation → worktree → tmux split → agent launch
- [ ] Pane close → cleanup → worktree removal
- [ ] Merge → auto-commit → merge → cleanup
- [ ] Error scenarios for tmux/git/API failures

### Test Quality
- [ ] All integration tests use proper mocks
- [ ] No actual tmux/git commands executed in CI
- [ ] Tests are deterministic (no flaky tests)
- [ ] Each test has clear name describing scenario

---

## Test Infrastructure Needs

### Fixtures to Create
```typescript
// __tests__/fixtures/tmuxSession.ts
export function createMockTmuxSession(panes: number)

// __tests__/fixtures/gitRepo.ts
export function createMockGitRepo(branches: string[])

// __tests__/fixtures/dmuxConfig.ts
export function createMockConfig(panes: DmuxPane[])
```

### Test Helpers
```typescript
// __tests__/helpers/integrationHelpers.ts
export function setupTestEnvironment()
export function teardownTestEnvironment()
export function mockTmuxCommands()
export function mockGitCommands()
export function mockOpenRouterAPI()
```

### Mock Strategies
- **execSync**: Mock with command pattern matching
- **StateManager**: Singleton with in-memory state
- **LogService**: Mock or spy to verify logging
- **File system**: Use temp directories with cleanup

---

## Risk Mitigation

### Potential Blockers
1. **Complex mocking needed** for tmux/git
   - Mitigation: Create helper utilities early (Day 1)

2. **Test flakiness** from timing/async
   - Mitigation: Use `waitFor` helpers, avoid sleep()

3. **Coverage plateau** - hard to reach 60%
   - Mitigation: HTML coverage report shows exact gaps

4. **Time overrun**
   - Mitigation: 15-day plan has 5-day buffer built in

### Quality Safeguards
- Run coverage after each day
- Review HTML report for gaps
- Don't just add tests, verify coverage increases
- Focus on actual coverage gain, not test count

---

## Daily Checklist Template

```markdown
### Day X: [Focus Area]

**Morning** (9am-12pm):
- [ ] Create test file structure
- [ ] Write test scenarios (describe blocks)
- [ ] Set up mocks and fixtures

**Afternoon** (1pm-5pm):
- [ ] Implement tests
- [ ] Run coverage: `pnpm test -- --coverage --exclude="**/*.e2e.*"`
- [ ] Verify coverage gain matches target

**End of Day**:
- [ ] Commit tests with message: "test: add [focus area] integration tests (+X%)"
- [ ] Update COVERAGE_PLAN.md with actual vs projected
- [ ] Document any blockers or surprises
```

---

## Tracking Progress

### Coverage Report Command
```bash
pnpm test -- --coverage --exclude="**/*.e2e.*"
```

### View HTML Report
```bash
open coverage/index.html
```

### Quick Coverage Check
```bash
pnpm test -- --coverage --exclude="**/*.e2e.*" 2>&1 | grep "All files"
```

---

## Conclusion

**Realistic Timeline**: 15 days
**Conservative Target**: 65% coverage
**Minimum Acceptable**: 60% coverage

The plan is aggressive but achievable. The key is:
1. Start with high-value integration tests (pane lifecycle, git, tmux)
2. Mock aggressively to avoid flaky tests
3. Monitor coverage gain daily
4. Adjust focus areas if not hitting targets

Once 60%+ coverage is achieved, we can safely proceed to Phase 1 (Critical Fixes) per MAINTENANCE.md.

---

**Next Step**: Begin Day 1-2 (Pane Lifecycle Integration Tests)
