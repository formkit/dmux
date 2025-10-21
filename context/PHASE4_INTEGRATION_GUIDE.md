# Phase 4 Integration Guide - DmuxApp.tsx Refactoring

## Current Status

### ✅ Completed (This Session)
- **PopupManager Service** (629 lines) - All 13 popup launchers extracted and DRY-refactored
- **InputHandler Service** (409 lines) - All keyboard input routing extracted
- **PaneCreationService** (477 lines) - Massive `createNewPane` function extracted
- **useServices Hook** (100 lines) - Clean service initialization
- **Build Verification** - All services compile successfully ✅

### 🔄 Next Steps (Integration Phase)

The integration requires careful, systematic changes to DmuxApp.tsx to wire up the services while removing duplicate code.

---

## Integration Checklist

### Step 1: Import Services ✅ (Already Done)
```typescript
import { PopupManager, type PopupManagerConfig } from "./services/PopupManager.js"
import { InputHandler, ... } from "./services/InputHandler.js"
import { PaneCreationService, ... } from "./services/PaneCreationService.js"
```

### Step 2: Initialize Services Using Hook

Add after existing hooks (around line 200):

```typescript
// Initialize services
const { popupManager, paneCreationService } = useServices({
  // PopupManager config
  sidebarWidth: SIDEBAR_WIDTH,
  projectRoot,
  popupsSupported,
  terminalWidth,
  terminalHeight,
  availableAgents,
  agentChoice,
  serverPort,
  server,
  settingsManager,
  projectSettings,

  // PaneCreation config
  projectName,
  controlPaneId,
  dmuxVersion: packageJson.version,

  // Callbacks
  setStatusMessage,
  setIgnoreInput,
  savePanes,
  loadPanes,
})
```

### Step 3: Remove Popup Launcher Methods (~1,100 lines)

**Delete these functions entirely from DmuxApp.tsx:**
1. `launchNewPanePopup` (lines 426-517) - 92 lines
2. `launchKebabMenuPopup` (lines 519-605) - 87 lines
3. `launchConfirmPopup` (lines 607-674) - 68 lines
4. `launchAgentChoicePopup` (lines 676-733) - 58 lines
5. `launchHooksPopup` (lines 735-834) - 100 lines
6. `launchLogsPopup` (lines 836-906) - 71 lines
7. `launchShortcutsPopup` (lines 908-967) - 60 lines
8. `launchRemotePopup` (lines 969-1050) - 82 lines
9. `launchSettingsPopup` (lines 1052-1133) - 82 lines
10. `launchMergePopup` (lines 1135-1266) - 132 lines
11. `launchChoicePopup` (lines 1268-1340) - 73 lines
12. `launchInputPopup` (lines 1342-1414) - 73 lines
13. `launchProgressPopup` (lines 1416-1484) - 69 lines

**Total removal: ~1,047 lines**

### Step 4: Replace Popup Calls

Find and replace all calls to these functions with `popupManager.*` calls:

**Example replacements:**
```typescript
// Before:
await launchNewPanePopup()

// After:
const prompt = await popupManager.launchNewPanePopup()
if (prompt) {
  // handle prompt...
}

// Before:
await launchKebabMenuPopup(selectedIndex)

// After:
const actionId = await popupManager.launchKebabMenuPopup(panes[selectedIndex])
if (actionId) {
  await actionSystem.executeAction(actionId, panes[selectedIndex], ...)
}
```

**Search for these patterns and replace:**
- `launchNewPanePopup()` → `popupManager.launchNewPanePopup()`
- `launchKebabMenuPopup(` → `popupManager.launchKebabMenuPopup(`
- `launchConfirmPopup(` → `popupManager.launchConfirmPopup(`
- `launchAgentChoicePopup()` → `popupManager.launchAgentChoicePopup()`
- `launchHooksPopup()` → `popupManager.launchHooksPopup(`
- `launchLogsPopup()` → `popupManager.launchLogsPopup()`
- `launchShortcutsPopup()` → `popupManager.launchShortcutsPopup(`
- `launchRemotePopup()` → `popupManager.launchRemotePopup(`
- `launchSettingsPopup()` → `popupManager.launchSettingsPopup(`
- `launchMergePopup(` → `popupManager.launchMergePopup(`
- `launchChoicePopup(` → `popupManager.launchChoicePopup(`
- `launchInputPopup(` → `popupManager.launchInputPopup(`
- `launchProgressPopup(` → `popupManager.launchProgressPopup(`

### Step 5: Remove createNewPane Function (~360 lines)

**Delete the entire function from lines 1646-2008** (362 lines)

This includes:
- Slug generation
- Worktree creation
- Pane splitting
- Agent launching
- Claude trust prompt approval
- All the complex tmux commands

### Step 6: Replace createNewPane Calls

The `createNewPane` function is used in several places. Replace with `paneCreationService.createPane()`:

**Find these calls:**
- In `launchNewPanePopup` (but we're removing that, so check its callers)
- In action handlers
- In hooks popup
- Anywhere `createNewPane(` is called

**Example replacement:**
```typescript
// Before:
await createNewPane(prompt, agent)

// After:
await paneCreationService.createPane(prompt, agent, panes)
```

### Step 7: Replace useInput Handler (~250 lines)

The current `useInput` hook handler (lines 2192-2440) is ~248 lines. We need to replace it with InputHandler.

**Current structure:**
```typescript
useInput(async (input: string, key: any) => {
  // Ctrl+C quit confirmation
  // Dialog handling
  // Navigation
  // Action shortcuts
  // ... 248 lines of logic
})
```

**New structure:**
```typescript
// Initialize InputHandler (create once, outside useInput)
const inputHandler = useMemo(() => {
  return new InputHandler(
    {
      controlPaneId,
      sidebarWidth: SIDEBAR_WIDTH,
      serverPort,
      server,
      isLoading,
    },
    {
      setQuitConfirmMode,
      setShowFileCopyPrompt,
      setShowCommandPrompt,
      setCommandInput,
      setCurrentCommandType,
      setSelectedIndex,
      setIsCreatingPane,
      setStatusMessage,
      cleanExit,
      launchTunnel: async () => {
        setTunnelCreating(true)
        try {
          const url = await server.startTunnel()
          setTunnelUrl(url)
        } catch (error: any) {
          setStatusMessage(`Failed to create tunnel: ${error.message}`)
          setTimeout(() => setStatusMessage(""), 3000)
        } finally {
          setTunnelCreating(false)
        }
      },
    },
    {
      panes,
      projectSettings,
      saveSettings,
      actionSystem,
      popupManager,
      copyNonGitFiles,
      runCommandInternal,
      findCardInDirection,
      loadPanes,
      createNewPaneHook, // This is from usePaneCreation, may need to adapt
    }
  )
}, [/* dependencies */])

// Use the handler
useInput(async (input: string, key: any) => {
  if (ignoreInput) return

  await inputHandler.handleInput(input, key, {
    quitConfirmMode,
    showFileCopyPrompt,
    showCommandPrompt,
    commandInput,
    currentCommandType,
    selectedIndex,
    isCreatingPane,
    runningCommand,
    isUpdating,
    tunnelUrl,
    tunnelCreating,
  })
})
```

### Step 8: Clean Up Imports

After removing all the duplicate code, clean up imports:

**Remove these (no longer needed):**
- `launchNodePopupNonBlocking` (only used in removed functions)
- `POPUP_POSITIONING` (only used in removed functions)
- `generateSlug` (only used in removed createNewPane)
- `capturePaneContent` (only used in removed createNewPane)
- Any other imports only used in removed code

**Verify these are still needed:**
- `enforceControlPaneSize` (still used in layout enforcement)
- `suggestCommand` (might be used in InputHandler only now)
- `getMainBranch` (might be used elsewhere)

### Step 9: Verify Action System Integration

The action system uses popup launchers via callbacks. Make sure it's updated to use popupManager:

**In useActionSystem initialization (around line 1486):**
```typescript
const actionSystem = useActionSystem({
  panes,
  savePanes,
  sessionName,
  projectName,
  onPaneRemove: (paneId) => { /* ... */ },
  onActionResult: async (result: ActionResult) => { /* ... */ },
  forceRepaint,
  popupLaunchers: popupsSupported
    ? {
        launchConfirmPopup: popupManager.launchConfirmPopup.bind(popupManager),
        launchChoicePopup: popupManager.launchChoicePopup.bind(popupManager),
        launchInputPopup: popupManager.launchInputPopup.bind(popupManager),
        launchProgressPopup: popupManager.launchProgressPopup.bind(popupManager),
      }
    : undefined,
})
```

---

## Testing Checklist

After integration, verify:

1. **Build passes** - `pnpm build` completes with no errors
2. **Line count reduction** - DmuxApp.tsx is ~1,200 lines (from 2,594)
3. **Popup functionality**:
   - Press `n` - new pane popup works
   - Press `m` - kebab menu popup works
   - Press `s` - settings popup works
   - Press `l` - logs popup works
   - Press `?` - shortcuts popup works
4. **Pane creation**:
   - Create new pane with Claude agent
   - Create new pane with opencode agent
   - Verify worktree is created
   - Verify agent launches correctly
5. **Input handling**:
   - Arrow keys navigate correctly
   - Shortcuts work (j, x, m, s, l, etc.)
   - Quit confirmation (Ctrl+C twice)
   - Dialog inputs work (command prompts, file copy)

---

## Expected Outcome

**Before:**
- DmuxApp.tsx: 2,594 lines
- No service separation
- Monolithic component

**After:**
- DmuxApp.tsx: ~1,200 lines (54% reduction)
- PopupManager: 629 lines
- InputHandler: 409 lines
- PaneCreationService: 477 lines
- useServices hook: 100 lines
- Total: ~2,815 lines (organized, testable, maintainable)

**Benefits:**
- ✅ Separation of concerns
- ✅ Testable business logic
- ✅ Reusable services
- ✅ Cleaner component
- ✅ Easier maintenance
- ✅ DRY principles applied

---

## Potential Issues & Solutions

### Issue 1: Service Dependencies
Some services may need references to each other. Use careful initialization order or lazy loading.

**Solution:** The useServices hook handles this with proper dependency management.

### Issue 2: State Updates
Services can't directly call `setState`. They use callbacks instead.

**Solution:** All state-changing operations are passed as callbacks in service constructors.

### Issue 3: Hook Dependencies
InputHandler needs many dependencies. Be careful with the useMemo dependency array.

**Solution:** List all dependencies explicitly to prevent stale closures.

### Issue 4: Type Mismatches
Some function signatures might not match exactly.

**Solution:** Add type adapters or adjust service interfaces as needed.

---

## Performance Considerations

1. **Memoization** - Services are memoized in useServices to prevent recreation on every render
2. **Callback Stability** - Use useCallback for callbacks passed to services
3. **Lazy Initialization** - Services are only created once via useMemo

---

## Git Commit Strategy

**Commit 1 (Current Session):**
```
refactor: Phase 4 - extract services from DmuxApp.tsx

Service Extraction Complete (1,615 lines):
- PopupManager (629 lines): All 13 popup launchers with DRY refactoring
- InputHandler (409 lines): Keyboard input routing
- PaneCreationService (477 lines): Pane creation with agent launching
- useServices hook (100 lines): Clean service initialization

Build Status: ✅ All services compile successfully

Next: Integration phase to wire services into DmuxApp.tsx
```

**Commit 2 (Next Session):**
```
refactor: Phase 4 - integrate services into DmuxApp.tsx

DmuxApp.tsx Integration:
- Removed ~1,400 lines of duplicate code
- Replaced popup launchers with PopupManager calls
- Replaced createNewPane with PaneCreationService
- Replaced useInput logic with InputHandler
- DmuxApp.tsx: 2,594 → 1,200 lines (54% reduction)

All functionality verified and tests passing ✅
```

---

## Quick Reference: File Locations

```
Services (NEW):
├── src/services/PopupManager.ts (629 lines)
├── src/services/InputHandler.ts (409 lines)
├── src/services/PaneCreationService.ts (477 lines)
└── src/hooks/useServices.ts (100 lines)

To Modify:
└── src/DmuxApp.tsx (2,594 → 1,200 lines)
    ├── Remove: lines 426-1484 (popup launchers)
    ├── Remove: lines 1646-2008 (createNewPane)
    ├── Replace: lines 2192-2440 (useInput handler)
    └── Add: useServices hook integration
```

---

## Next Session Quick Start

1. Open DmuxApp.tsx
2. Follow integration checklist step-by-step
3. Run `pnpm build` frequently to catch errors early
4. Test each major change before proceeding
5. Commit when DmuxApp is reduced to ~1,200 lines and tests pass

Good luck with the integration! 🚀
