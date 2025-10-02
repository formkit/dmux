# dmux Action System - Usage Examples

This document provides concrete examples of how to use the standardized action system across different interfaces.

## Core Concepts

The action system has three layers:

1. **Actions** (`src/actions/`): Pure business logic functions
2. **Adapters** (`src/adapters/`): Convert ActionResults to interface-specific UI
3. **Interfaces**: Render the UI (TUI, Web, CLI, etc.)

## Example 1: Terminal UI (TUI) Implementation

### Executing an Action

```typescript
// In DmuxApp.tsx or similar
import { executeAction, PaneAction } from '../actions/index.js';
import { handleActionResult, createInitialTUIState } from '../adapters/tuiActionHandler.js';

// Initialize TUI state
const [tuiState, setTuiState] = useState(createInitialTUIState());

// When user presses 'x' to close a pane
const handleClosePaneKey = async () => {
  const selectedPane = panes[selectedIndex];

  // Create action context
  const context = {
    panes,
    sessionName: 'dmux-myproject',
    projectName: 'myproject',
    savePanes: async (updated) => {
      await savePanesToDisk(updated);
      setPanes(updated);
    },
  };

  // Execute the action
  const result = await executeAction(PaneAction.CLOSE, selectedPane, context);

  // Convert result to TUI dialogs
  handleActionResult(result, tuiState, (updates) => {
    setTuiState({ ...tuiState, ...updates });
  });
};
```

### Rendering ActionResult Dialogs

```typescript
// In your render method
return (
  <Box flexDirection="column">
    {/* Your pane grid */}
    <PanesGrid panes={panes} />

    {/* Choice dialog from ActionResult */}
    {tuiState.showChoiceDialog && (
      <ChoiceDialog
        title={tuiState.choiceTitle}
        message={tuiState.choiceMessage}
        options={tuiState.choiceOptions}
        selectedIndex={tuiState.choiceSelectedIndex}
        onSelect={async (optionId) => {
          if (tuiState.onChoiceSelect) {
            const result = await tuiState.onChoiceSelect(optionId);
            handleActionResult(result, tuiState, setTuiState);
          }
        }}
        onCancel={() => {
          setTuiState({ ...tuiState, showChoiceDialog: false });
        }}
      />
    )}

    {/* Confirm dialog */}
    {tuiState.showConfirmDialog && (
      <ConfirmDialog
        title={tuiState.confirmTitle}
        message={tuiState.confirmMessage}
        yesLabel={tuiState.confirmYesLabel}
        noLabel={tuiState.confirmNoLabel}
        onYes={async () => {
          if (tuiState.onConfirmYes) {
            const result = await tuiState.onConfirmYes();
            handleActionResult(result, tuiState, setTuiState);
          }
        }}
        onNo={async () => {
          if (tuiState.onConfirmNo) {
            const result = await tuiState.onConfirmNo();
            handleActionResult(result, tuiState, setTuiState);
          }
        }}
      />
    )}

    {/* Input dialog */}
    {tuiState.showInputDialog && (
      <InputDialog
        title={tuiState.inputTitle}
        message={tuiState.inputMessage}
        placeholder={tuiState.inputPlaceholder}
        defaultValue={tuiState.inputDefaultValue}
        onSubmit={async (value) => {
          if (tuiState.onInputSubmit) {
            const result = await tuiState.onInputSubmit(value);
            handleActionResult(result, tuiState, setTuiState);
          }
        }}
        onCancel={() => {
          setTuiState({ ...tuiState, showInputDialog: false });
        }}
      />
    )}

    {/* Status message */}
    {tuiState.statusMessage && (
      <Text color={tuiState.statusType === 'error' ? 'red' : 'green'}>
        {tuiState.statusMessage}
      </Text>
    )}
  </Box>
);
```

## Example 2: Web Dashboard Implementation

### Frontend (React/Vue/etc.)

```typescript
// In your React component
const [pane, setPane] = useState<DmuxPane>(/* ... */);
const [dialog, setDialog] = useState<any>(null);

// Execute action via API
const executeAction = async (actionId: string) => {
  const response = await fetch(`/api/panes/${pane.id}/actions/${actionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  const result = await response.json();

  // Handle different result types
  if (result.requiresInteraction) {
    switch (result.interactionType) {
      case 'confirm':
        setDialog({
          type: 'confirm',
          title: result.title,
          message: result.message,
          yesLabel: result.confirmData.yesLabel,
          noLabel: result.confirmData.noLabel,
          callbackId: result.confirmData.callbackId,
        });
        break;

      case 'choice':
        setDialog({
          type: 'choice',
          title: result.title,
          message: result.message,
          options: result.choiceData.options,
          callbackId: result.choiceData.callbackId,
        });
        break;

      case 'input':
        setDialog({
          type: 'input',
          title: result.title,
          message: result.message,
          placeholder: result.inputData.placeholder,
          defaultValue: result.inputData.defaultValue,
          callbackId: result.inputData.callbackId,
        });
        break;
    }
  } else {
    // Show success/error message
    showToast(result.message, result.success ? 'success' : 'error');
  }
};

// Handle user response to dialog
const handleDialogResponse = async (response: any) => {
  let endpoint = '';
  let body = {};

  switch (dialog.type) {
    case 'confirm':
      endpoint = `/api/callbacks/confirm/${dialog.callbackId}`;
      body = { confirmed: response };
      break;

    case 'choice':
      endpoint = `/api/callbacks/choice/${dialog.callbackId}`;
      body = { optionId: response };
      break;

    case 'input':
      endpoint = `/api/callbacks/input/${dialog.callbackId}`;
      body = { value: response };
      break;
  }

  const result = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await result.json();
  setDialog(null);

  // Might trigger another dialog or show final message
  if (data.requiresInteraction) {
    // Handle nested interaction
  } else {
    showToast(data.message, data.success ? 'success' : 'error');
  }
};
```

### Rendering Web Dialogs

```jsx
// Render different dialog types
{dialog && dialog.type === 'choice' && (
  <Modal>
    <h2>{dialog.title}</h2>
    <p>{dialog.message}</p>
    <div className="options">
      {dialog.options.map(option => (
        <button
          key={option.id}
          onClick={() => handleDialogResponse(option.id)}
          className={option.danger ? 'danger' : ''}
        >
          {option.label}
          {option.description && <span className="desc">{option.description}</span>}
        </button>
      ))}
    </div>
  </Modal>
)}

{dialog && dialog.type === 'confirm' && (
  <Modal>
    <h2>{dialog.title}</h2>
    <p>{dialog.message}</p>
    <div className="buttons">
      <button onClick={() => handleDialogResponse(true)}>
        {dialog.yesLabel}
      </button>
      <button onClick={() => handleDialogResponse(false)}>
        {dialog.noLabel}
      </button>
    </div>
  </Modal>
)}

{dialog && dialog.type === 'input' && (
  <Modal>
    <h2>{dialog.title}</h2>
    <p>{dialog.message}</p>
    <input
      type="text"
      placeholder={dialog.placeholder}
      defaultValue={dialog.defaultValue}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          handleDialogResponse(e.target.value);
        }
      }}
    />
  </Modal>
)}
```

## Example 3: CLI Script

```typescript
#!/usr/bin/env node
// scripts/close-pane.ts

import { executeAction, PaneAction } from '../src/actions/index.js';
import { StateManager } from '../src/shared/StateManager.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main() {
  const paneSlug = process.argv[2];

  if (!paneSlug) {
    console.error('Usage: close-pane <pane-slug>');
    process.exit(1);
  }

  const stateManager = StateManager.getInstance();
  const panes = stateManager.getPanes();
  const pane = panes.find(p => p.slug === paneSlug);

  if (!pane) {
    console.error(`Pane not found: ${paneSlug}`);
    process.exit(1);
  }

  const state = stateManager.getState();
  const context = {
    panes,
    sessionName: state.sessionName,
    projectName: state.projectName,
    savePanes: async (updated) => {
      stateManager.updatePanes(updated);
    },
  };

  // Execute action
  const result = await executeAction(PaneAction.CLOSE, pane, context);

  // Handle result
  await handleResult(result);

  rl.close();
}

async function handleResult(result: ActionResult): Promise<void> {
  switch (result.type) {
    case 'choice':
      console.log(`\n${result.title || 'Choose an option'}:`);
      console.log(result.message);
      result.options?.forEach((opt, i) => {
        console.log(`  ${i + 1}. ${opt.label} ${opt.description ? `- ${opt.description}` : ''}`);
      });

      const choice = await prompt('\nEnter number: ');
      const choiceIndex = parseInt(choice) - 1;

      if (result.onSelect && result.options?.[choiceIndex]) {
        const nextResult = await result.onSelect(result.options[choiceIndex].id);
        await handleResult(nextResult);
      }
      break;

    case 'confirm':
      console.log(`\n${result.title || 'Confirm'}:`);
      console.log(result.message);

      const answer = await prompt(`\n${result.confirmLabel || 'Yes'} / ${result.cancelLabel || 'No'} ? `);

      if (answer.toLowerCase().startsWith('y') && result.onConfirm) {
        const nextResult = await result.onConfirm();
        await handleResult(nextResult);
      } else if (result.onCancel) {
        const nextResult = await result.onCancel();
        await handleResult(nextResult);
      }
      break;

    case 'success':
    case 'info':
      console.log(`✓ ${result.message}`);
      break;

    case 'error':
      console.error(`✗ ${result.message}`);
      break;
  }
}

function prompt(question: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(question, resolve);
  });
}

main().catch(console.error);
```

## Example 4: Adding a New Action

Let's add a "Duplicate Pane" action that creates a new pane with the same prompt.

### Step 1: Implement Action Function

```typescript
// src/actions/paneActions.ts

export async function duplicatePane(
  pane: DmuxPane,
  context: ActionContext
): Promise<ActionResult> {
  return {
    type: 'confirm',
    title: 'Duplicate Pane',
    message: `Create a new pane with the same configuration as "${pane.slug}"?`,
    confirmLabel: 'Yes, duplicate it',
    cancelLabel: 'Cancel',
    onConfirm: async () => {
      // Trigger pane creation flow
      // This would normally call your pane creation logic
      return {
        type: 'info',
        message: 'Creating duplicate pane...',
        data: {
          action: 'create_pane',
          prompt: pane.prompt,
          agent: pane.agent,
        },
      };
    },
    onCancel: async () => {
      return {
        type: 'info',
        message: 'Duplication cancelled',
      };
    },
  };
}
```

### Step 2: Register Action

```typescript
// src/actions/types.ts

export enum PaneAction {
  // ... existing actions
  DUPLICATE = 'duplicate',
}

export const ACTION_REGISTRY = {
  // ... existing actions
  [PaneAction.DUPLICATE]: {
    id: PaneAction.DUPLICATE,
    label: 'Duplicate',
    description: 'Create a copy of this pane',
    icon: '⎘',
    shortcut: 'u',
  },
};
```

### Step 3: Wire Up Dispatcher

```typescript
// src/actions/index.ts

export async function executeAction(
  actionId: PaneAction,
  pane: DmuxPane,
  context: ActionContext,
  params?: any
): Promise<ActionResult> {
  switch (actionId) {
    // ... existing cases
    case 'duplicate':
      return actions.duplicatePane(pane, context);
  }
}
```

### Step 4: Use in Interfaces

**TUI**: Automatically available in kebab menu
**Web**: Automatically available in pane actions menu
**API**: Automatically available at `POST /api/panes/:id/actions/duplicate`
**CLI**: Can be used in scripts with `executeAction('duplicate', pane, context)`

That's it! The action works everywhere with consistent behavior.

## Benefits Recap

1. **Write once, use everywhere**: One implementation for all interfaces
2. **Type-safe**: Full TypeScript support with defined types
3. **Testable**: Test pure functions, not UI components
4. **Interactive**: Multi-step workflows with callbacks
5. **Extensible**: Easy to add new actions and interfaces
6. **Consistent**: Same UX across all interfaces
