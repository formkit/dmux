# CLAUDE.md - Complete Documentation for dmux

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Installation & Setup](#installation--setup)
4. [Core Features](#core-features)
5. [Technical Implementation](#technical-implementation)
6. [User Guide](#user-guide)
7. [Development Guide](#development-guide)
8. [Troubleshooting](#troubleshooting)

## Project Overview

dmux is a sophisticated TypeScript-based tmux pane manager that creates AI-powered development sessions with Claude Code or opencode. It provides seamless integration between tmux, git worktrees, and these agents to enable parallel development workflows with automatic branch management and AI assistance.

### Key Capabilities
- **Project-specific tmux sessions**: Each project gets its own isolated tmux session
- **Horizontal split pane management**: Creates and manages tmux panes (not windows)
- **Git worktree integration**: Each pane operates in its own git worktree with a dedicated branch
- **Agent automation**: Automatically launches Claude Code (with `--accept-edits`) or opencode and submits your initial prompt
- **AI-powered naming**: Generates contextual kebab-case slugs for branches and worktrees
- **Intelligent merge workflows**: Auto-commits, generates commit messages, and merges worktrees
- **React-based TUI**: Interactive terminal UI built with Ink framework
- **Session persistence**: Tracks active panes per project with automatic cleanup

## Architecture

### Technology Stack
```
┌─────────────────────────────────────────┐
│            User Interface               │
│         (Ink React TUI)                 │
├─────────────────────────────────────────┤
│           Core Application              │
│         (TypeScript/Node.js)            │
├─────────────────────────────────────────┤
│           External Services             │
│   (tmux, git, OpenRouter API)           │
└─────────────────────────────────────────┘
```

### Dependencies
- **Runtime**: Node.js 18+ with ES modules support
- **UI Framework**: Ink 5.0 (React for CLIs)
- **UI Components**: ink-text-input for text input
- **Styling**: chalk for terminal colors
- **Language**: TypeScript 5.x with strict mode
- **External APIs**: OpenRouter AI (gpt-4o-mini model)
- **System Requirements**: tmux, git, and at least one agent CLI: Claude Code (`claude`) or opencode (`opencode`)

### File Structure
```
/Users/justinschroeder/Projects/dmux/main/
├── src/
│   ├── index.ts          # Main entry point, session management
│   └── DmuxApp.tsx       # React TUI component, core logic
├── dist/                 # Compiled JavaScript (gitignored)
│   ├── index.js
│   └── DmuxApp.js
├── dmux                  # Executable wrapper script
├── package.json          # Node dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── .gitignore           # Git ignore rules
├── CLAUDE.md            # This documentation file
└── .dmux/               # Project-specific dmux data (gitignored)
    ├── dmux.config.json # Configuration and pane tracking
    └── worktrees/       # Git worktrees for each pane
        └── {slug}/      # Individual worktree directories
```

## Installation & Setup

### Prerequisites
1. **System Requirements**
   ```bash
   # Required software
   tmux --version      # tmux 3.0+
   node --version      # Node.js 18+
   git --version       # Git 2.20+ (worktree support)
    claude --version    # Claude Code CLI (if using Claude)
    opencode --version  # opencode CLI (if using opencode)
   ```

2. **Environment Variables**
   ```bash
   # Required for AI features (optional but recommended)
   export OPENROUTER_API_KEY="your-api-key-here"
   
   # Auto-detected
   TMUX    # Set automatically when inside tmux
   HOME    # Used for ~/.dmux directory
   ```

### Installation Steps
```bash
# Clone the repository
git clone <repository-url> dmux
cd dmux

# Install dependencies
npm install

# Build TypeScript
npm run build

# Make executable available globally
chmod +x dmux
ln -s $(pwd)/dmux /usr/local/bin/dmux

# Or add to PATH
export PATH="$PATH:$(pwd)"
```

### Build Commands
```bash
npm install    # Install all dependencies
npm run build  # Compile TypeScript to JavaScript
npm run dev    # Run TypeScript directly with tsx (development)
./dmux         # Run the application
```

## Core Features

### 1. Project-Specific Sessions
Each project gets its own tmux session named `dmux-{project-name}`:
- Automatic session creation on first run
- Session reattachment if already exists
- Isolated pane tracking per project
- Project name derived from current directory

### 2. Git Worktree Management
Every new pane creates a complete development environment:
```
main-project/              # Original repository
├── .git/                  # Git directory
├── src/                   # Your code
└── .dmux/                 # dmux data directory (gitignored)
    ├── dmux.config.json   # Configuration file
    └── worktrees/         # All worktrees for this project
        ├── fix-bug/       # Worktree for "fix bug" pane
        │   ├── .git       # Worktree git file
        │   └── src/       # Independent working copy
        └── add-feature/   # Worktree for "add feature" pane
            ├── .git       # Worktree git file
            └── src/       # Independent working copy
```

**Benefits:**
- Parallel development without branch switching
- Clean separation of work
- No uncommitted changes conflicts
- Easy experimentation and rollback

### 3. AI-Powered Features

#### Slug Generation
Converts natural language prompts into branch names:
- Input: "fix the authentication bug in login flow"
- Output: "fix-auth" or "auth-bug"
- Fallback: `dmux-{timestamp}` if API unavailable

#### Commit Message Generation
Analyzes git diffs to create semantic commit messages:
- Examines uncommitted changes
- Follows conventional commits format
- Examples: `feat: add user authentication`, `fix: resolve memory leak`

### 4. Interactive TUI Controls

#### Navigation
- **↑/↓ arrows**: Navigate through panes list
- **Enter**: Select highlighted option
- **ESC**: Cancel current dialog

#### Commands
- **`j` or Enter**: Jump to selected pane (switch tmux focus)
- **`x`**: Close pane (kills tmux pane and cleans up)
- **`m`**: Merge worktree into main branch
- **`n`**: Create new dmux pane
- **`q`**: Quit the interface

#### Visual Elements
```
┌─────────────────────────────────┐
│ dmux - project-name             │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ fix-auth (worktree)         │ │  <- Selected (cyan border)
│ │ Fix authentication bug      │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ add-feature                 │ │  <- Unselected (gray border)
│ │ Add new user dashboard     │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ + New dmux pane             │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

### 5. Pane Lifecycle Management

#### Creation Flow
1. User selects "New dmux pane"
2. Prompt for initial agent prompt (optional)
3. Generate slug via OpenRouter API
4. Clear current pane (multiple strategies for clean display)
5. Exit Ink app gracefully
6. Create horizontal tmux split
7. Create git worktree: `git worktree add .dmux/worktrees/{slug} -b {slug}`
8. Change to worktree directory
9. Launch agent:
   - Claude: `claude "{prompt}" --permission-mode=acceptEdits`
   - opencode: start `opencode`, paste the prompt, and submit
10. Focus remains on new pane
11. Re-launch dmux to show updated menu

#### Auto-Cleanup
- Polls every 2 seconds for pane status
- Removes dead panes from tracking
- Updates `~/.dmux/{project}-panes.json`
- Maintains clean pane list

### 6. Merge Workflow

#### Automatic Process
1. Check for uncommitted changes in worktree
2. Generate commit message using AI (analyzes diff)
3. Stage all changes: `git add -A`
4. Commit with generated message
5. Switch to main branch
6. Merge worktree branch
7. Remove worktree: `git worktree remove`
8. Delete branch: `git branch -d {slug}`
9. Show confirmation dialog to close pane

#### Merge Confirmation Dialog
```
┌──────────────────────────────────┐
│ Worktree merged successfully!    │
│ Close the pane "fix-auth"? (y/n) │
└──────────────────────────────────┘
```

## Technical Implementation

### 1. Session Management (`src/index.ts`)

```typescript
class Dmux {
  private projectName: string;    // Current directory name
  private sessionName: string;     // tmux-{projectName}
  private panesFile: string;       // ~/.dmux/{project}-panes.json
  
  async init() {
    if (!inTmux) {
      // Create or attach to project session
      // Auto-run dmux inside the session
    } else {
      // Launch Ink React app
    }
  }
}
```

### 2. React TUI Component (`src/DmuxApp.tsx`)

#### State Management
```typescript
interface DmuxPane {
  id: string;           // Unique identifier
  slug: string;         // Branch/worktree name
  prompt: string;       // Initial Claude prompt (truncated)
  paneId: string;       // tmux pane ID (%123)
  worktreePath?: string; // Absolute path to worktree
}
```

#### Key Hooks
- **useEffect**: Loads panes, sets up 2-second refresh interval
- **useInput**: Handles keyboard input and navigation
- **useApp**: Provides exit() for clean shutdown

### 3. Screen Clearing Strategy

Multiple approaches to prevent resize artifacts:
```typescript
// 1. ANSI escape sequences
process.stdout.write('\x1b[2J\x1b[H');

// 2. Flood with blank lines
process.stdout.write('\n'.repeat(100));

// 3. tmux-specific clearing
execSync('tmux clear-history');
execSync('tmux send-keys C-l');

// 4. Force client refresh
execSync('tmux refresh-client');
```

### 4. OpenRouter API Integration

#### Request Structure
```typescript
{
  model: 'openai/gpt-4o-mini',
  messages: [{
    role: 'user',
    content: 'Generate slug for: {prompt}'
  }],
  max_tokens: 10,
  temperature: 0.3
}
```

#### Error Handling
- Network failures: Falls back to timestamp
- Missing API key: Uses timestamp slug
- Invalid responses: Sanitizes and validates output

### 5. CleanTextInput Component (CRITICAL - DO NOT MODIFY WITHOUT CAREFUL CONSIDERATION)

The `CleanTextInput` component (`src/CleanTextInput.tsx`) is a highly sophisticated custom text input implementation for terminal environments. It has been carefully engineered to handle complex terminal behaviors and should NOT be modified without understanding all its features.

#### Core Features That Must Be Preserved

1. **Multiline Support with Word Wrapping**
   - Supports Shift+Enter for line breaks
   - Word wrapping at word boundaries (not character-by-character)
   - Handles edge cases where typing triggers wrap
   - Preserves proper spacing between wrapped lines
   - Visual line navigation with arrow keys

2. **Advanced Cursor Management**
   - Solid cursor (non-blinking) for better visibility
   - Cursor positioning tracks correctly across wrapped lines
   - Arrow key navigation (up/down/left/right) across visual lines
   - Ctrl+A: Jump to beginning of current visual line
   - Ctrl+E: Jump to end of current visual line
   - Home/End key support

3. **Terminal-Specific Key Handling**
   - **CRITICAL**: Handles both 'backspace' and 'delete' signals
   - Some terminals send 'delete' signal when backspace is pressed
   - Must check both `key.backspace` and `key.delete` for backspace behavior
   - Proper forward delete with actual delete key

4. **Paste Detection and Reference System**
   - Bracketed paste mode support (`\x1b[?2004h` and `\x1b[?2004l`)
   - Smart paste detection heuristics:
     - Multi-line content detection
     - Large single-chunk detection (>10 chars)
     - Paste buffering to handle entire pastes as single operations
   - Claude Code-style reference tags for large pastes:
     - Shows `[#1 Pasted content, 20 lines]` for pastes >10 lines
     - Preprocessing removes ANSI codes and box drawing characters
     - Expands references when submitting to Claude

5. **Performance Optimizations**
   - Memoized text wrapping calculations
   - Deferred bracketed paste mode initialization (10ms delay)
   - Efficient re-rendering only when necessary
   - Background operation pausing during input

6. **Edge Case Handling**
   - Empty input shows cursor without placeholder
   - Handles terminal resize gracefully
   - Manages rapid key input without triggering paste mode
   - Prevents UI freezing from background operations

#### Implementation Details

```typescript
// Key components:
- useFocus({ autoFocus: true }) - Auto-focuses on mount
- Bracketed paste mode - Detects paste vs typing
- Word wrapping algorithm - Preserves word boundaries
- Cursor tracking - Maps visual position to string position
```

#### Critical Code Sections Not to Change

1. **Backspace handling** (lines ~285-295):
   ```typescript
   if ((key.backspace || key.delete) && !key.shift && !key.meta)
   ```
   This MUST handle both signals due to terminal variations.

2. **Paste detection heuristics** (lines ~155-165):
   ```typescript
   const hasNewlines = input.includes('\n');
   const isVeryLong = input.length > 10;
   const isLikelyPaste = !isDeleteSequence && (
     (hasNewlines && input.length > 2) ||
     isVeryLong ||
     (isPasting && input.length > 0)
   );
   ```

3. **Word wrapping calculation** (lines ~457-520):
   - Complex algorithm for breaking at word boundaries
   - Handles maximum width calculations
   - Preserves spacing between wrapped segments

4. **Cursor position mapping** (lines ~520-545):
   - Maps between absolute string position and visual line/column
   - Critical for arrow key navigation

#### Testing Checklist When Modifying

- [ ] Backspace works in single-line text
- [ ] Backspace works after creating newlines with Shift+Enter
- [ ] Arrow keys navigate correctly across wrapped lines
- [ ] Ctrl+A/E jump to line boundaries
- [ ] Large pastes create reference tags
- [ ] Rapid typing doesn't trigger paste mode
- [ ] Rapid delete key doesn't get "stuck"
- [ ] Word wrapping happens at word boundaries
- [ ] Character that triggers wrap displays immediately
- [ ] No UI freezing when dialog opens

### 6. PaneAnalyzer (`src/PaneAnalyzer.ts`)

Uses LLM (x-ai/grok-4-fast:free) to detect the state of AI agents in tmux panes.

**Input**: tmux pane ID
**Output**: State (`option_dialog`, `open_prompt`, or `in_progress`) and extracted options if applicable
**Purpose**: Enables automation by determining if an agent needs input, is working, or presenting choices
**Key indicator**: "(esc to interrupt)" = agent is working

### 7. HTTP Server and Status Detection System

#### Architecture
The system uses a worker-based architecture for non-blocking pane status monitoring:

**Components:**
- **HTTP Server** (`src/server/`): Auto-selects port, serves dashboard at `http://127.0.0.1:{port}`
- **Worker Threads** (`src/workers/PaneWorker.ts`): One per pane, polls every 1 second
- **StatusDetector** (`src/services/StatusDetector.ts`): Coordinates workers and LLM analysis
- **Message Bus** (`src/services/WorkerMessageBus.ts`): Routes messages between workers and main thread
- **StateManager** (`src/shared/StateManager.ts`): Singleton for shared state between TUI and server

#### Status Detection Logic
```
1. Check for "(esc to interrupt)" in last 20 lines → Working
2. No working indicators:
   - Terminal changing + not user typing → Request LLM analysis
   - Terminal static → After 5s, request LLM analysis
   - User typing at prompt → Maintain current status
3. LLM determines: idle vs waiting (needs attention)
4. Once idle confirmed → Block further LLM requests until working detected
```

#### API Endpoints
- `GET /` - Dashboard HTML interface
- `GET /api/panes` - JSON list of panes with statuses
- `POST /api/panes` - Create a new pane with worktree and agent
- `GET /api/panes/:id` - Get specific pane information
- `GET /api/panes/:id/snapshot` - Get current terminal state of pane
- `GET /api/session` - Session information
- `GET /api/health` - Server health check
- `GET /api/stream/:paneId` - Stream terminal output (SSE)
- `POST /api/keys/:paneId` - Send keystrokes to pane

For detailed API documentation, see [API.md](API.md)

#### Key Features
- **Activity-based detection**: Motion = working, static = analyze
- **User typing detection**: Prevents false "working" status
- **LLM optimization**: Only calls when ambiguous, cancels in-flight requests
- **Real-time updates**: Dashboard refreshes every 2 seconds
- **Portable**: All assets embedded in binary, no external dependencies

### 8. Pane Creation Utility (`src/utils/paneCreation.ts`)

Universal pane creation utility shared by both TUI and API:

**Purpose**: Centralized logic for creating new panes with worktrees and agents

**Key Function**: `createPane(options, availableAgents)`
- Generates slug from prompt using OpenRouter AI
- Creates git worktree in `.dmux/worktrees/{slug}`
- Splits tmux pane horizontally
- Launches specified agent (Claude or opencode)
- Auto-approves trust prompts for Claude
- Returns new pane object or indicates agent choice needed

**Features**:
- Agent detection and auto-selection
- Proper error handling and recovery
- Screen clearing and layout management
- Async/await for clean control flow
- Reusable across different interfaces (TUI, API, CLI)

**Usage**:
```typescript
const result = await createPane(
  {
    prompt: 'Add TypeScript types',
    agent: 'claude',
    projectName: 'my-project',
    existingPanes: []
  },
  ['claude', 'opencode']
);

if (result.needsAgentChoice) {
  // Handle agent selection
} else {
  // Use result.pane
}
```

### 9. Tmux Command Execution

All tmux operations use `child_process.execSync`:
```typescript
// Create pane with ID capture
execSync(`tmux split-window -h -P -F '#{pane_id}'`)

// Send commands to specific pane
execSync(`tmux send-keys -t '${paneId}' '${command}' Enter`)

// Layout management
execSync('tmux select-layout even-horizontal')

// Focus control
execSync(`tmux select-pane -t '${paneId}'`)
```

## User Guide

### Basic Workflow

1. **Start dmux in your project**
   ```bash
   cd /path/to/your/project
   dmux
   ```

2. **Create a new development pane**
   - Press `n` or select "+ New dmux pane"
   - Enter initial prompt: "implement user authentication"
   - Your selected agent (Claude or opencode) launches in a new pane with your prompt

3. **Switch between panes**
   - Use arrow keys to select pane
   - Press `j` or Enter to jump to it

4. **Merge completed work**
   - Select the pane with completed work
   - Press `m` to merge
   - Confirm pane closure (y/n)

5. **Clean up**
   - Press `x` to close unwanted panes
   - Press `q` to exit dmux interface

### Advanced Usage

#### Working with Multiple Features
```bash
# Start dmux
dmux

# Create pane for feature A
> New dmux pane
> "implement shopping cart"

# Create pane for bug fix
> New dmux pane  
> "fix memory leak in user service"

# Work independently in each pane
# Merge when ready
```

#### Project Switching
```bash
# Project A
cd ~/projects/project-a
dmux  # Creates/attaches dmux-project-a

# Project B
cd ~/projects/project-b
dmux  # Creates/attaches dmux-project-b

# Sessions remain independent
```

#### Programmatic Pane Creation (API)

Create panes from external tools, scripts, or web interfaces:

```bash
# Create pane via API
curl -X POST http://127.0.0.1:3000/api/panes \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Add error handling to the API endpoints",
    "agent": "claude"
  }'
```

**Use Cases**:
- Automate pane creation from CI/CD pipelines
- Integrate with project management tools
- Create panes from web dashboards
- Batch pane creation for multiple tasks
- Integration with IDEs and editors

**Example: Create Multiple Panes**
```bash
#!/bin/bash
# Create panes for a set of tasks

TASKS=(
  "Add unit tests for user service"
  "Update API documentation"
  "Implement rate limiting"
  "Add logging to critical paths"
)

for task in "${TASKS[@]}"; do
  curl -s -X POST http://127.0.0.1:3000/api/panes \
    -H "Content-Type: application/json" \
    -d "{\"prompt\": \"$task\", \"agent\": \"claude\"}"
  echo "Created pane for: $task"
  sleep 2  # Brief pause between creations
done
```

See [API.md](API.md) for complete API documentation.
## Standardized Action System

### Overview

dmux implements a standardized action system that decouples business logic from UI implementation. This allows pane actions (view, close, merge, etc.) to work identically across all interfaces: Terminal UI, Web Dashboard, REST API, and future interfaces like native apps.

### Core Concepts

**Action Functions**: Pure functions that perform operations and return standardized results
**Action Results**: Structured responses that describe what UI interaction is needed
**Adapters**: Interface-specific handlers that convert ActionResults into UI components
**Handlers**: Implementation-specific logic for rendering dialogs, confirmations, etc.

### Architecture

```
┌─────────────────────────────────────────────┐
│           User Interfaces                   │
│  (TUI, Web UI, Mobile App, CLI, etc.)       │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│           Interface Adapters                │
│  (tuiActionHandler, apiActionHandler, ...)  │
│  Convert ActionResults → UI Components       │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│         Standardized Actions                │
│  (viewPane, closePane, mergePane, ...)      │
│  Pure business logic, returns ActionResult  │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│         System Operations                   │
│  (tmux, git, file system, etc.)             │
└─────────────────────────────────────────────┘
```

### Action Result Types

Every action function returns an `ActionResult` with one of these types:

| Type | Description | UI Behavior |
|------|-------------|-------------|
| `success` | Operation completed successfully | Show brief success message |
| `error` | Operation failed | Show error message |
| `confirm` | Need yes/no confirmation | Show confirmation dialog |
| `choice` | Need user to select from options | Show choice menu |
| `input` | Need text input from user | Show input dialog |
| `info` | Informational message | Show info message |
| `progress` | Long-running operation | Show progress indicator |
| `navigation` | Navigate to different pane/view | Switch focus/route |

### Available Actions

```typescript
enum PaneAction {
  VIEW = 'view',                    // Jump to pane
  CLOSE = 'close',                  // Close pane with options
  MERGE = 'merge',                  // Merge worktree to main
  RENAME = 'rename',                // Rename pane
  DUPLICATE = 'duplicate',          // Create copy of pane
  RUN_TEST = 'run_test',           // Run test command
  RUN_DEV = 'run_dev',             // Start dev server
  OPEN_OUTPUT = 'open_output',      // View command output
  COPY_PATH = 'copy_path',          // Copy worktree path
  OPEN_IN_EDITOR = 'open_in_editor' // Open in external editor
}
```

### Example: Close Pane Action

**Action Function** (`src/actions/paneActions.ts`):
```typescript
export async function closePane(
  pane: DmuxPane,
  context: ActionContext
): Promise<ActionResult> {
  return {
    type: 'choice',
    title: 'Close Pane',
    message: `How do you want to close "${pane.slug}"?`,
    options: [
      {
        id: 'kill_only',
        label: 'Just close pane',
        description: 'Keep worktree and branch',
      },
      {
        id: 'kill_and_clean',
        label: 'Close and remove worktree',
        danger: true,
      },
      {
        id: 'kill_clean_branch',
        label: 'Close and delete everything',
        danger: true,
      }
    ],
    onSelect: async (optionId: string) => {
      // Execute the selected close operation
      return executeCloseOption(pane, context, optionId);
    },
  };
}
```

**TUI Adapter** (`src/adapters/tuiActionHandler.ts`):
```typescript
// Converts ActionResult to TUI dialog state
handleActionResult(result, currentState, setState) {
  if (result.type === 'choice') {
    setState({
      showChoiceDialog: true,
      choiceTitle: result.title,
      choiceOptions: result.options,
      onChoiceSelect: result.onSelect,
    });
  }
}
```

**API Adapter** (`src/adapters/apiActionHandler.ts`):
```typescript
// Converts ActionResult to HTTP JSON response
actionResultToAPIResponse(result) {
  return {
    success: true,
    requiresInteraction: true,
    interactionType: 'choice',
    choiceData: {
      options: result.options,
      callbackId: generateCallbackId(),
    },
  };
}
```

### Using Actions in Different Interfaces

#### Terminal UI (TUI)

```typescript
import { executeAction } from '../actions/index.js';
import { handleActionResult } from '../adapters/tuiActionHandler.js';

// Execute action
const result = await executeAction('close', selectedPane, context);

// Convert to TUI dialogs
handleActionResult(result, tuiState, setTuiState);
```

#### Web API

```bash
# Execute action via HTTP
POST /api/panes/:paneId/actions/close

# Response with interaction needed
{
  "success": true,
  "requiresInteraction": true,
  "interactionType": "choice",
  "choiceData": {
    "options": [...],
    "callbackId": "callback_123"
  }
}

# User responds with choice
POST /api/callbacks/choice/callback_123
{
  "optionId": "kill_and_clean"
}
```

#### REST API Endpoints

```
# Action Discovery
GET  /api/actions                          # List all actions with metadata
GET  /api/panes/:paneId/actions           # Get available actions for pane

# Action Execution
POST /api/panes/:paneId/actions/:actionId # Execute action on pane

# Interaction Callbacks
POST /api/callbacks/confirm/:callbackId   # Respond to confirmation
POST /api/callbacks/choice/:callbackId    # Respond to choice
POST /api/callbacks/input/:callbackId     # Respond to input prompt
```

### Quick Start: Adding Actions to Your Feature

When adding a new feature that needs user interaction:

**1. Use the action system instead of direct tmux/git commands**
**2. Action functions return what should happen, not how to render it**
**3. TUI/Web/API automatically handle the UI**

```typescript
// ❌ OLD WAY: Direct implementation in TUI
const myFeature = () => {
  execSync('tmux do-thing');
  setShowDialog(true);
  setDialogMessage('Done!');
};

// ✅ NEW WAY: Use action system
import { executeAction, PaneAction } from './actions/index.js';

const myFeature = () => {
  actionSystem.executeAction(PaneAction.MY_ACTION, pane);
  // That's it! Dialogs appear automatically
};
```

**Current Migration Status:**
- ✅ VIEW action (jump to pane) - migrated
- ✅ CLOSE action - migrated
- ⏳ MERGE action - in progress
- ⏳ Other actions - pending

### Adding New Actions

1. **Define Action Function** (`src/actions/paneActions.ts`):
```typescript
export async function myNewAction(
  pane: DmuxPane,
  context: ActionContext,
  params?: any
): Promise<ActionResult> {
  // Perform operation
  try {
    // ... do work ...

    return {
      type: 'success',
      message: 'Operation completed!',
    };
  } catch (error) {
    return {
      type: 'error',
      message: `Failed: ${error}`,
    };
  }
}
```

2. **Register in Action Enum** (`src/actions/types.ts`):
```typescript
export enum PaneAction {
  // ... existing actions ...
  MY_NEW_ACTION = 'my_new_action',
}
```

3. **Add Metadata** (`src/actions/types.ts`):
```typescript
export const ACTION_REGISTRY = {
  // ... existing actions ...
  [PaneAction.MY_NEW_ACTION]: {
    id: PaneAction.MY_NEW_ACTION,
    label: 'My Action',
    description: 'Does something awesome',
    icon: '⭐',
    shortcut: 'a',
  },
};
```

4. **Wire Up Dispatcher** (`src/actions/index.ts`):
```typescript
export async function executeAction(actionId, pane, context, params) {
  switch (actionId) {
    // ... existing cases ...
    case 'my_new_action':
      return actions.myNewAction(pane, context, params);
  }
}
```

**That's it!** The action automatically works in:
- Terminal UI (via TUI adapter)
- Web Dashboard (via API adapter)
- REST API (via actions endpoints)
- Future interfaces (just implement adapter)

### Benefits

✅ **Single Source of Truth**: One implementation for all interfaces
✅ **Consistent UX**: Same behavior everywhere
✅ **Easy Testing**: Test pure functions, not UI components
✅ **Future Proof**: Add new interfaces without changing actions
✅ **Type Safe**: Full TypeScript support across the stack
✅ **Composable**: Actions can call other actions
✅ **Interactive**: Multi-step workflows with callbacks

### File Organization

```
src/
├── actions/
│   ├── types.ts           # ActionResult types, PaneAction enum
│   ├── paneActions.ts     # Core action implementations
│   └── index.ts           # Action dispatcher and exports
├── adapters/
│   ├── tuiActionHandler.ts    # Terminal UI adapter
│   └── apiActionHandler.ts    # HTTP API adapter
└── server/
    └── actionsApi.ts      # REST API endpoints for actions
```

## Development Guide

### Adding New Features

#### 1. Extend DmuxPane Interface
```typescript
interface DmuxPane {
  // ... existing fields
  customField?: string;  // Add new field
}
```

#### 2. Add New Commands
```typescript
useInput((input, key) => {
  if (input === 'r') {  // New 'r' command
    renamePane(panes[selectedIndex]);
  }
});
```

#### 3. Add New Menu Options
```typescript
// In render method
<Box>
  <Text>New menu option</Text>
</Box>
```

### TypeScript Compilation

#### Common tsc Issues and Solutions

When running TypeScript compilation, you may encounter this error:
```
This is not the tsc command you are looking for

To get access to the TypeScript compiler, tsc, from the command line either:
- Use npm install typescript to first add TypeScript to your project before using npx
- Use yarn to avoid accidentally running code from un-installed packages
```

**Solution**: Always install TypeScript first before compiling:
```bash
# Install TypeScript if not already installed
npm install typescript

# Then build normally
npm run build

# Or use npx after installing TypeScript
npx tsc
```

**Why this happens**: The project may not have TypeScript installed locally, and npx refuses to download and run arbitrary packages for security reasons.

#### Build Process
```bash
# Standard development workflow
npm install        # Install all dependencies including TypeScript
npm run build     # Compile TypeScript to JavaScript
./dmux            # Run the application
```

### Meta-Development: Working on dmux Inside dmux

**Important Context**: Most dmux development happens inside a dmux session itself, which can create confusing scenarios for Claude Code.

#### Understanding the Meta Context

1. **Nested Sessions**: When working on dmux, you're often running dmux inside a tmux session that was created by dmux itself.

2. **Multiple dmux Instances**: You might see multiple dmux processes running:
   - The "parent" dmux managing your development session
   - The "child" dmux you're testing/developing
   - Background dmux instances from other projects

3. **tmux Pane Confusion**: Commands like `tmux list-panes` will show all panes in the current session, including:
   - The pane running Claude Code (where you're reading this)
   - The pane where you're testing dmux
   - Other development panes for different features

#### Development Best Practices

1. **Testing in Isolation**:
   ```bash
   # Create a separate tmux session for testing
   tmux new-session -d -s dmux-test
   tmux send-keys -t dmux-test "cd /path/to/dmux && ./dmux" Enter
   ```

2. **Distinguishing Sessions**:
   ```bash
   # List all tmux sessions to see which is which
   tmux list-sessions
   
   # Typical output might show:
   # dmux-dmux: 3 windows (current session for dmux development)
   # dmux-test: 1 window (isolated testing session)
   ```

3. **Debugging Meta Issues**:
   - If dmux behaves strangely, check if you're in a nested scenario
   - Use `echo $TMUX` to verify tmux environment
   - Use `ps aux | grep dmux` to see all running dmux instances

#### Common Meta-Development Scenarios

**Scenario 1**: "dmux won't start new panes"
- **Cause**: You might be testing dmux in a session it doesn't manage
- **Solution**: Ensure you're in the correct project directory and tmux session

**Scenario 2**: "I see phantom panes in the interface"
- **Cause**: Multiple dmux instances sharing the same project name
- **Solution**: Check running dmux processes and kill duplicates

**Scenario 3**: "Changes don't appear when testing"
- **Cause**: Testing an old compiled version instead of rebuilt code
- **Solution**: Always run `npm run build` after making changes

### Testing

#### Manual Testing Checklist
- [ ] Test outside tmux (session creation)
- [ ] Test inside tmux (pane creation)
- [ ] Test without OPENROUTER_API_KEY
- [ ] Test pane cleanup (manually close panes)
- [ ] Test merge workflow
- [ ] Test very long prompts
- [ ] Test special characters in prompts
- [ ] Test rapid pane creation
- [ ] Test project switching

#### Debug Mode
```typescript
// Add debug logging
console.error('Debug:', variable);  // Outputs to stderr
```

### Code Style Guidelines

1. **TypeScript Best Practices**
   - Use strict mode
   - Define interfaces for all data structures
   - Handle all error cases

2. **React/Ink Patterns**
   - Keep components focused
   - Use hooks appropriately
   - Clean up effects

3. **Error Handling**
   - Wrap tmux commands in try/catch
   - Provide fallbacks for API failures
   - Show user-friendly error messages

## Troubleshooting

### Common Issues

#### 1. "Command not found: claude" or "opencode"
**Solution**: Install the corresponding agent CLI
```bash
# Check installation
which claude

# Install if missing
# Follow the installation instructions for the chosen agent
```

#### 2. API Key Not Working
**Solution**: Verify OpenRouter setup
```bash
# Check environment variable
echo $OPENROUTER_API_KEY

# Test API directly
curl https://openrouter.ai/api/v1/models \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

#### 3. Panes Not Appearing
**Causes & Solutions**:
- tmux version too old: Upgrade to tmux 3.0+
- Git worktree issues: Ensure git 2.20+
- Permissions: Check write access to project parent directory

#### 4. Screen Artifacts After Resize
**Current Mitigations**:
- Multiple clearing strategies implemented
- Delays added for settling
- Force refresh after operations

**Manual Fix**:
```bash
# In affected pane
Ctrl+L  # Clear screen
tmux refresh-client
```

#### 5. Worktree Merge Conflicts
**Solution**: Handle manually
```bash
# Navigate to worktree
cd ../project-{slug}

# Resolve conflicts
git status
git add .
git commit

# Return to dmux and retry merge
```

### Debug Information

#### Check Session Status
```bash
tmux list-sessions
tmux list-panes -t dmux-{project}
```

#### View Pane Tracking
```bash
cat ~/.dmux/{project}-panes.json
```

#### Monitor tmux Commands
```bash
# Run dmux with command tracing
set -x
./dmux
```

### Performance Optimization

#### Reduce API Calls
- Set OPENROUTER_API_KEY only when needed
- Slug generation cached per session
- Fallback to timestamps is instant

#### Improve Responsiveness
- 2-second refresh interval is configurable
- Keyboard input is instant
- Async operations for network calls

#### Background Operation Management
**Critical for UI Responsiveness**: The following operations are paused when dialogs are open to prevent UI freezing:

1. **Pane Loading (`loadPanes`)**
   - Runs every 3 seconds to check pane status
   - Uses `execSync` which blocks the event loop
   - Automatically skips when any dialog is open

2. **Claude Monitoring (`monitorClaudeStatus`)**
   - Runs every 2 seconds to check Claude status in panes
   - Multiple `execSync` calls per pane (list-panes, capture-pane)
   - Automatically skips when any dialog is open
   - Deferred 500ms on startup to avoid initial lag

3. **Why This Matters**
   - `execSync` blocks the entire Node.js event loop
   - When dialogs (especially text input) are open, blocking operations cause input lag
   - The checks prevent the "jamming" effect when typing begins

```typescript
// Both operations check dialog states:
if (showNewPaneDialog || showMergeConfirmation || showCloseOptions || 
    showCommandPrompt || showFileCopyPrompt || showUpdateDialog) {
  return; // Skip blocking operations
}
```

## Recent Updates & Known Issues

### Recent Changes
- Enhanced screen clearing with multiple strategies
- Added merge confirmation dialogs
- Improved focus management for new panes
- Implemented comprehensive worktree workflows
- Fixed boot reliability issues
- **opencode support**: Agent detection, selection UI, and working-status detection
- **Custom CleanTextInput component**: Complete rewrite of text input with advanced features
- **LLM-based Pane State Detection**: Intelligent detection of agent states using AI
- **HTTP Dashboard**: Real-time web interface showing pane statuses at auto-selected port
- **Worker-based Monitoring**: Non-blocking status detection via worker threads (1s polling)
- **Smart Activity Detection**: Distinguishes user typing from agent working states
- **REST API for Pane Creation**: POST /api/panes endpoint enables programmatic pane creation
- **Shared Pane Creation Utility**: Unified pane creation logic used by both TUI and API
- **Standardized Action System**: Universal action library with pure functions, interface adapters, and consistent behavior across TUI/Web/API
- **Kebab Menus**: Visual context menus on pane cards showing available actions

### Known Issues
1. **Error handling**: Claude command availability not verified
2. **Long prompts**: May overflow in menu display
3. **Deletion safety**: No undo for closed panes
4. **Network timeouts**: API calls can hang without timeout

### Planned Enhancements
- [ ] Migrate all actions to standardized action system
- [ ] Pane duplication
- [ ] Batch operations
- [ ] Custom keyboard shortcuts
- [ ] Pane status indicators
- [ ] Merge conflict resolution UI
- [ ] Session templates
- [ ] Export/import configurations

## Best Practices

### For Users
1. **Use descriptive prompts**: Better slugs and commit messages
2. **Merge frequently**: Avoid conflicts, keep main branch updated
3. **Close unused panes**: Keeps interface clean and responsive
4. **One feature per pane**: Clear separation of concerns

### For Developers
1. **Test tmux commands**: Use stdio: 'pipe' to suppress output
2. **Handle edge cases**: Empty prompts, missing API keys, etc.
3. **Preserve state**: Always update panes.json
4. **Clean exits**: Use exit() properly in Ink
5. **User feedback**: Show status messages for operations
6. **State management**: Always use React Context, never use Redux

## Support & Contribution

### Getting Help
1. Check this documentation thoroughly
2. Review troubleshooting section
3. Check tmux and git documentation
4. Verify all prerequisites are installed

### Contributing
1. Follow existing code patterns
2. Update CLAUDE.md with new features
3. Test all workflows before submitting
4. Include error handling
5. Maintain backward compatibility

---

*Last updated: Current implementation as of the latest codebase analysis*