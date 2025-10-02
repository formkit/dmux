# Migration Guide: Converting to Standardized Action System

This guide explains how to migrate existing action implementations to use the new standardized action system.

## Current State

**Infrastructure Built:**
- ✅ Action types and interfaces (`src/actions/types.ts`)
- ✅ Action implementations (`src/actions/paneActions.ts`)
- ✅ TUI adapter (`src/adapters/tuiActionHandler.ts`)
- ✅ API adapter (`src/adapters/apiActionHandler.ts`)
- ✅ REST API endpoints (`src/server/actionsApi.ts`)
- ✅ `useActionSystem` hook for TUI integration
- ✅ Comprehensive documentation

**Not Yet Migrated:**
- ❌ DmuxApp.tsx still uses `useWorktreeActions` hook (old system)
- ❌ Kebab menu still calls old action functions directly
- ❌ API routes not wired up to HTTP server
- ❌ Web dashboard doesn't use action API

## Migration Steps

### Step 1: Migrate DmuxApp.tsx to Use Action System

**Current approach:**
```typescript
// DmuxApp.tsx (lines 89-96)
const { closePane, mergeWorktree, ... } = useWorktreeActions({
  panes,
  savePanes,
  setStatusMessage,
  setShowMergeConfirmation,
  setMergedPane,
});

// Later in code:
closePane(pane);  // Direct function call
```

**New approach:**
```typescript
// Import new hook
import useActionSystem from './hooks/useActionSystem.js';
import { PaneAction } from './actions/index.js';

// Replace useWorktreeActions with useActionSystem
const {
  actionState,
  executeAction,
  executeCallback,
  isDialogOpen,
} = useActionSystem({
  panes,
  savePanes,
  sessionName,
  projectName,
  onPaneRemove: (paneId) => {
    const updated = panes.filter(p => p.id !== paneId);
    setPanes(updated);
  },
});

// Execute action
await executeAction(PaneAction.CLOSE, pane);
```

### Step 2: Update Kebab Menu to Use Actions

**Current code (lines 759-775):**
```typescript
if (kebabMenuOption === 0) {
  // View - jump to pane
  jumpToPane(currentPane.paneId);
} else if (hasWorktree && kebabMenuOption === 1) {
  // Merge
  setMergingPane(currentPane);
  setShowMergePane(true);
} else if (...) {
  // Close
  setClosingPane(currentPane);
  setShowCloseOptions(true);
}
```

**Replace with:**
```typescript
if (kebabMenuOption === 0) {
  await executeAction(PaneAction.VIEW, currentPane);
} else if (hasWorktree && kebabMenuOption === 1) {
  await executeAction(PaneAction.MERGE, currentPane);
} else if (...) {
  await executeAction(PaneAction.CLOSE, currentPane);
}
```

### Step 3: Replace Old Dialogs with Action System Dialogs

**Remove these old dialogs:**
- `showMergeConfirmation` and `MergeConfirmationDialog`
- `showCloseOptions` and `CloseOptionsDialog`
- Custom merge logic in `MergePane`

**Replace with action system dialogs:**
```typescript
{/* Choice dialog from actions */}
{actionState.showChoiceDialog && (
  <ChoiceDialog
    title={actionState.choiceTitle}
    message={actionState.choiceMessage}
    options={actionState.choiceOptions}
    selectedIndex={actionState.choiceSelectedIndex}
    onSelect={async (optionId) => {
      if (actionState.onChoiceSelect) {
        await executeCallback(async () =>
          actionState.onChoiceSelect!(optionId)
        );
      }
    }}
    onCancel={() => {
      setActionState(prev => ({ ...prev, showChoiceDialog: false }));
    }}
  />
)}

{/* Confirm dialog from actions */}
{actionState.showConfirmDialog && (
  <ConfirmDialog
    title={actionState.confirmTitle}
    message={actionState.confirmMessage}
    yesLabel={actionState.confirmYesLabel}
    noLabel={actionState.confirmNoLabel}
    onYes={() => executeCallback(actionState.onConfirmYes)}
    onNo={() => executeCallback(actionState.onConfirmNo)}
  />
)}

{/* Input dialog from actions */}
{actionState.showInputDialog && (
  <InputDialog
    title={actionState.inputTitle}
    message={actionState.inputMessage}
    placeholder={actionState.inputPlaceholder}
    defaultValue={actionState.inputDefaultValue}
    onSubmit={(value) => executeCallback(async () =>
      actionState.onInputSubmit!(value)
    )}
    onCancel={() => {
      setActionState(prev => ({ ...prev, showInputDialog: false }));
    }}
  />
)}
```

### Step 4: Wire Up API Routes to HTTP Server

**Add to `src/server/index.ts` (or wherever routes are defined):**
```typescript
import {
  handleListActions,
  handleGetPaneActions,
  handleExecuteAction,
  handleConfirmCallback,
  handleChoiceCallback,
  handleInputCallback,
} from './actionsApi.js';

// In your route handler:
if (req.url === '/api/actions' && req.method === 'GET') {
  return handleListActions(req, res);
}

if (req.url?.match(/^\/api\/panes\/([^\/]+)\/actions$/) && req.method === 'GET') {
  const match = req.url.match(/^\/api\/panes\/([^\/]+)\/actions$/);
  return handleGetPaneActions(req, res, match[1]);
}

if (req.url?.match(/^\/api\/panes\/([^\/]+)\/actions\/([^\/]+)$/) && req.method === 'POST') {
  const match = req.url.match(/^\/api\/panes\/([^\/]+)\/actions\/([^\/]+)$/);
  return handleExecuteAction(req, res, match[1], match[2]);
}

if (req.url?.match(/^\/api\/callbacks\/confirm\/([^\/]+)$/) && req.method === 'POST') {
  const match = req.url.match(/^\/api\/callbacks\/confirm\/([^\/]+)$/);
  return handleConfirmCallback(req, res, match[1]);
}

if (req.url?.match(/^\/api\/callbacks\/choice\/([^\/]+)$/) && req.method === 'POST') {
  const match = req.url.match(/^\/api\/callbacks\/choice\/([^\/]+)$/);
  return handleChoiceCallback(req, res, match[1]);
}

if (req.url?.match(/^\/api\/callbacks\/input\/([^\/]+)$/) && req.method === 'POST') {
  const match = req.url.match(/^\/api\/callbacks\/input\/([^\/]+)$/);
  return handleInputCallback(req, res, match[1]);
}
```

### Step 5: Update Web Dashboard

**Current web dashboard needs:**
```typescript
// Replace direct tmux commands with API calls
const closePane = async (paneId: string) => {
  const response = await fetch(`/api/panes/${paneId}/actions/close`, {
    method: 'POST',
  });

  const result = await response.json();

  if (result.requiresInteraction) {
    showDialog(result);
  } else {
    showToast(result.message);
  }
};
```

## Testing Checklist

After migration, test these scenarios:

### TUI Tests
- [ ] Press 'k' on a pane, select "View" - should jump to pane
- [ ] Press 'k' on a pane with worktree, select "Merge" - should show confirm dialog
- [ ] Confirm merge - should show success and offer to close pane
- [ ] Press 'k', select "Close" - should show 3 options
- [ ] Select "Just close pane" - should close without cleanup
- [ ] Select "Close and remove worktree" - should remove worktree
- [ ] Select "Close and delete everything" - should delete everything

### API Tests
```bash
# List all actions
curl http://localhost:3000/api/actions

# Get actions for a pane
curl http://localhost:3000/api/panes/<pane-id>/actions

# Execute close action
curl -X POST http://localhost:3000/api/panes/<pane-id>/actions/close

# Respond to choice callback
curl -X POST http://localhost:3000/api/callbacks/choice/<callback-id> \
  -H "Content-Type: application/json" \
  -d '{"optionId": "kill_and_clean"}'
```

### Web Dashboard Tests
- [ ] Click "Close" button on pane card - shows choice dialog
- [ ] Select an option - executes action
- [ ] Multi-step actions work (e.g., merge then close)
- [ ] Errors are displayed properly

## Benefits After Migration

Once migrated, you'll have:

1. **Single source of truth**: All interfaces use same logic
2. **Consistent behavior**: TUI, Web, and API work identically
3. **Easy testing**: Test pure functions, not UI
4. **Future-proof**: New interfaces just implement adapter
5. **Type safety**: Full TypeScript coverage
6. **Better UX**: Consistent dialogs and workflows everywhere

## Rollback Plan

If issues arise during migration:

1. Keep old hooks/functions temporarily
2. Migrate one action at a time (start with VIEW)
3. Test thoroughly before moving to next action
4. Can mix old and new systems during transition
5. Once all actions migrated, remove old code

## Files That Need Changes

### High Priority
- [ ] `src/DmuxApp.tsx` - Main component (biggest change)
- [ ] `src/components/KebabMenu.tsx` - Use executeAction
- [ ] `src/server/index.ts` - Wire up action routes

### Medium Priority
- [ ] Remove `src/hooks/useWorktreeActions.ts` (after migration)
- [ ] Update web dashboard to use action API
- [ ] Remove old dialog components (MergeConfirmation, CloseOptions, etc.)

### Low Priority
- [ ] Update tests to use action system
- [ ] Add integration tests for action API
- [ ] Document action system patterns for contributors

## Next Steps

**Recommended order:**

1. Start with kebab menu (smallest scope)
2. Migrate VIEW action first (simplest)
3. Then CLOSE action (moderate complexity)
4. Then MERGE action (most complex)
5. Wire up API routes
6. Update web dashboard
7. Remove old code

This approach minimizes risk while demonstrating value quickly.
