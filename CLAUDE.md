# CLAUDE.md - Complete Documentation for dmux

## Table of Contents

1. [Documentation Files](#documentation-files)
2. [Project Overview](#project-overview)
3. [Architecture](#architecture)
4. [Installation & Setup](#installation--setup)
5. [Core Features](#core-features)
6. [Technical Implementation](#technical-implementation)
7. [User Guide](#user-guide)
8. [Development Guide](#development-guide)
9. [Troubleshooting](#troubleshooting)

## Documentation Files

This project maintains several documentation files for different aspects of the system:

- **[CLAUDE.md](CLAUDE.md)** (this file) - Complete technical documentation covering architecture, implementation, and development workflows
- **[API.md](API.md)** - REST API reference for the HTTP server, including all endpoints, request/response formats, and examples
- **[BUNDLED_ASSETS.md](BUNDLED_ASSETS.md)** - Frontend build system documentation explaining the Vue 3 migration, asset embedding, and single dist/ directory architecture
- **[README.md](README.md)** - User-facing documentation with quick start guide and feature overview

**When to use each:**

- Working on backend/TUI → Read CLAUDE.md
- Working on API endpoints → Read API.md
- Working on frontend/build system → Read BUNDLED_ASSETS.md
- Writing user documentation → Update README.md

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
- **Test merge functionality**: This line added to test the merge workflow

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
├── src/                  # TypeScript source code
│   ├── index.ts          # Main entry point, session management
│   ├── DmuxApp.tsx       # React TUI component, core logic
│   └── server/           # HTTP server and API
│       ├── routes.ts     # API endpoints
│       └── embedded-assets.ts  # Generated frontend assets
├── frontend/             # Vue 3 frontend application
│   ├── src/
│   │   ├── components/   # Vue components
│   │   │   ├── Dashboard.vue   # Main dashboard UI
│   │   │   └── Terminal.vue    # Terminal viewer with ANSI parsing
│   │   ├── styles.css    # Shared styles for all pages
│   │   ├── dashboard.html
│   │   ├── dashboard.ts
│   │   ├── terminal.html
│   │   └── terminal.ts
│   ├── package.json      # Frontend dependencies
│   └── vite.config.ts    # Vite build configuration
├── scripts/
│   └── embed-assets.js   # Embeds frontend assets into TypeScript
├── dist/                 # All build output (gitignored)
│   ├── *.js              # Compiled TypeScript
│   ├── *.d.ts            # Type definitions
│   ├── dashboard.*       # Frontend dashboard bundle
│   └── terminal.*        # Frontend terminal bundle
├── dmux                  # Executable wrapper script
├── package.json          # Node dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── .gitignore            # Git ignore rules
├── CLAUDE.md             # Technical documentation (this file)
├── API.md                # REST API reference
├── BUNDLED_ASSETS.md     # Frontend build system documentation
├── README.md             # User-facing documentation
└── .dmux/                # Project-specific dmux data (gitignored)
    ├── dmux.config.json  # Configuration and pane tracking
    └── worktrees/        # Git worktrees for each pane
        └── {slug}/       # Individual worktree directories
```

## Installation & Setup

### Prerequisites

- tmux 3.0+, Node.js 18+, Git 2.20+
- At least one agent: `claude` or `opencode`
- Optional: `OPENROUTER_API_KEY` for AI slug/commit generation

### Build Commands

```bash
pnpm install   # Install all dependencies (uses workspace)
pnpm build     # Compile TypeScript + build frontend
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

**Commands**: `j` (jump), `x` (close), `m` (merge), `n` (new pane), `s` (settings), `q` (quit)
**Navigation**: ↑/↓ arrows, Enter to select, ESC to cancel

### 5. Global Settings

dmux supports both global and project-specific settings stored in:

- **Global**: `~/.dmux.global.json` (applies to all projects)
- **Project**: `.dmux/settings.json` (project-specific overrides)

**Available Settings:**

- `enableAutopilotByDefault` (boolean): Automatically enable autopilot mode for new panes
- `defaultAgent` ('claude' | 'opencode' | ''): Default agent for new panes (empty string means "ask each time")

**Accessing Settings:**

- **TUI**: Press `s` to open settings dialog
- **Web**: Click "Settings" button in dashboard
- **API**: `GET /api/settings`, `PATCH /api/settings`

**Setting Precedence**: Project settings override global settings

### 6. Pane Lifecycle

**Creation**: Generate slug → create worktree → split tmux pane → launch agent with `--permission-mode=acceptEdits`
**Auto-Cleanup**: Polls every 2s, removes dead panes from tracking
**Merge**: AI-generated commit → merge to main → remove worktree → optional pane close

## Technical Implementation

### 1. Core Architecture

- **Session Management** (`src/index.ts`): Creates/attaches project-specific tmux sessions, manages config in `.dmux/dmux.config.json`
- **TUI** (`src/DmuxApp.tsx`): Ink React app with keyboard navigation, auto-refresh every 2s
- **HTTP Server** (`src/server/`): Auto-port selection, serves Vue 3 dashboard
- **State Management** (`src/shared/StateManager.ts`): Singleton shared between TUI and server

### 2. DmuxPane Interface

```typescript
interface DmuxPane {
  id: string // dmux-# identifier
  slug: string // Branch/worktree name
  prompt: string // Initial agent prompt
  paneId: string // tmux pane ID (%38)
  worktreePath?: string
}
```

### 3. OpenRouter Integration

- **Slug generation**: `gpt-4o-mini`, 10 tokens, fallback to timestamp
- **Commit messages**: Analyzes git diff, conventional commits format

### 4. CleanTextInput Component (CRITICAL)

**DO NOT MODIFY** without understanding all features. Complex terminal input handling:

- Multiline with word wrapping (Shift+Enter)
- **Critical**: Checks both `key.backspace` AND `key.delete` (terminal variations)
- Bracketed paste mode with reference tags for large pastes
- Background operation pausing during input to prevent UI freeze
- Cursor tracking across wrapped lines

### 5. Status Detection

**PaneAnalyzer** (`src/PaneAnalyzer.ts`): LLM-based detection of agent state

- Uses `x-ai/grok-4-fast:free` to analyze pane content
- States: `option_dialog`, `open_prompt`, `in_progress`
- Key indicator: "(esc to interrupt)" = agent working

**Worker Architecture**: Non-blocking monitoring

- One worker thread per pane, polls every 1s
- Activity-based: terminal motion = working, static = analyze
- User typing detection prevents false "working" status

### 6. HTTP Server & API

**Endpoints**: See [API.md](API.md) for details

- `GET /` - Vue 3 dashboard (embedded assets)
- `GET/POST /api/panes` - List/create panes
- `GET /api/stream/:id` - SSE terminal output
- `POST /api/keys/:id` - Send keystrokes (uses dmux IDs, not tmux pane IDs)
- Actions API: `/api/panes/:id/actions/:action`, callbacks for interactions

**Features**:

- Auto-port selection, all assets embedded in binary
- Real-time dashboard with pane status indicators
- LLM optimization: only calls when ambiguous

### 7. Pane Creation (`src/utils/paneCreation.ts`)

Shared utility for TUI and API:

```typescript
createPane({ prompt, agent, projectName, existingPanes }, availableAgents)
// Returns: {pane} or {needsAgentChoice}
```

Handles: slug generation → worktree creation → tmux split → agent launch

### 8. Layout System (`src/utils/layoutManager.ts`, `src/utils/tmux.ts`)

**Architecture**: Grid layout engine that generates custom tmux layout strings

#### Key Components

1. **Layout Calculation** (`calculateOptimalLayout`):

   - Determines optimal columns/rows for given terminal dimensions
   - Prefers 3-column grids for horizontal space (better for code)
   - Scores layouts based on height comfort (>= 15 lines per pane)
   - Constrains window width to avoid panes exceeding MAX_COMFORTABLE_WIDTH (80 chars)

2. **Layout String Generation** (`generateSidebarGridLayout`):

   - Generates tmux layout strings: `checksum,WxH,X,Y{pane1,pane2,...}`
   - Uses **absolute coordinates** throughout (tmux requirement)
   - Sidebar always 40 cells wide, content area uses remaining space
   - Distributes remainder width to first pane (matches tmux behavior)

3. **Checksum Calculation** (CRITICAL):

   - Tmux requires exact 16-bit checksum matching layout string
   - **16-bit masking**: `checksum &= 0xFFFF` after each operation
   - **4-digit padding**: `checksum.toString(16).padStart(4, '0')`
   - Mismatch causes "invalid layout" errors

4. **Spacer Panes** (optional):

   - Created when panes in last row would exceed MAX_COMFORTABLE_WIDTH
   - **Minimum width**: 20 cells (prevents tmux rejecting tiny panes)
   - Always positioned last in layout for proper rendering
   - Destroyed and recreated on layout changes (ensures correct position)

5. **Sidebar Enforcement**:
   - Checks sidebar width before AND after window resizes
   - Window resizes cause tmux to redistribute width proportionally
   - Re-enforces sidebar at 40 cells to prevent drift (40→44)
   - Order: sidebar first, then window, then re-check sidebar

#### Layout Algorithm

```
1. Calculate optimal columns/rows for terminal dimensions
2. Determine if spacer needed (last row width check)
3. Create spacer pane if needed (split from last content pane)
4. Resize sidebar to 40 cells (locks width)
5. Resize window to calculated dimensions
6. Re-check sidebar width (window resize may have changed it)
7. Generate layout string with correct checksum
8. Apply layout via `tmux select-layout`
```

#### Critical Fixes (Oct 2024)

**Problem**: Layout generation failing with "invalid layout" at certain widths (201, 203, etc.)

**Root Cause**: Checksum calculation bugs

- Missing 16-bit masking caused incorrect checksums for long layout strings
- Variable-width checksums (3 digits vs 4) didn't match tmux's expected format
- Example: Generated `bf5`, tmux expected `0bf5`

**Solution**:

```typescript
// Before (BROKEN)
return checksum.toString(16) // "bf5" (3 digits)

// After (FIXED)
checksum &= 0xffff // Mask to 16 bits
return checksum.toString(16).padStart(4, "0") // "0bf5" (4 digits)
```

**Additional Fixes**:

- Sidebar width re-enforcement after window resize
- Minimum spacer width (20 cells) to avoid tmux rejection
- Debug logs always enabled (no DEBUG_DMUX flag needed)

#### Testing

See `tests/layout.test.ts` for comprehensive tests:

- Checksum format validation (4-digit hex)
- Regression tests for problematic widths (201, 203)
- Spacer logic and minimum width checks
- Layout calculation at various terminal sizes
- Coordinate calculation (absolute positioning)

Run tests: `pnpm test tests/layout.test.ts`

#### Configuration

```typescript
export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  SIDEBAR_WIDTH: 40, // Fixed sidebar width
  MIN_COMFORTABLE_WIDTH: 50, // Min pane width before creating rows
  MAX_COMFORTABLE_WIDTH: 80, // Max pane width for readability
  MIN_COMFORTABLE_HEIGHT: 15, // Min pane height
}
```

#### Debugging

When layout issues occur, check logs for:

```
[Layout] Sidebar width already correct: 40  (or "Resizing sidebar: X → 40")
[Layout] Window dimensions already correct   (or "Resizing window: X → Y")
[Layout] Sidebar changed after window resize  (indicates drift)
[Layout] Generated layout string: XXXX,WxH,...  (checksum should be 4 hex digits)
[Layout] Layout string applied successfully  (or "invalid layout" with error)
```

## User Guide

### Basic Workflow

1. `cd /path/to/project && dmux` - Starts or attaches to project session
2. `n` - Create new pane with agent prompt
3. `j` - Jump to selected pane
4. `m` - Merge completed work (auto-commit, merge to main)
5. `x` - Close pane (with cleanup options)
6. `s` - Open settings (global or project-specific)
7. `q` - Exit dmux interface

### Programmatic Pane Creation

```bash
curl -X POST http://127.0.0.1:PORT/api/panes \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Add tests", "agent": "claude"}'
```

Use cases: CI/CD pipelines, project management tools, batch task creation. See [API.md](API.md) for details.

## Standardized Action System

Decouples business logic from UI. Actions work identically across TUI, Web Dashboard, and REST API.

**Architecture**: User Interfaces → Adapters → Action Functions → System Operations

**Action Result Types**: `success`, `error`, `confirm`, `choice`, `input`, `info`, `progress`, `navigation`

**Actions**: `VIEW`, `CLOSE`, `MERGE`, `RENAME`, `DUPLICATE`, `RUN_TEST`, `RUN_DEV`, etc.

**API Endpoints**:

- `GET /api/actions` - List all actions
- `POST /api/panes/:id/actions/:action` - Execute action
- `POST /api/callbacks/{confirm,choice,input}/:callbackId` - Respond to interactions

**File Organization**:

- `src/actions/paneActions.ts` - Pure action functions
- `src/adapters/tuiActionHandler.ts` - TUI adapter
- `src/adapters/apiActionHandler.ts` - API adapter
- `src/server/actionsApi.ts` - REST endpoints

**Migration Status**: VIEW/CLOSE ✅, MERGE in progress

### Adding New Actions

1. Define function in `src/actions/paneActions.ts` returning `ActionResult`
2. Add enum to `PaneAction` in `src/actions/types.ts`
3. Add metadata to `ACTION_REGISTRY` (label, icon, shortcut)
4. Wire up in `executeAction()` dispatcher

Action automatically works in TUI, Web, and REST API via adapters.

## Development Guide

### Build Process

```bash
pnpm install   # Install dependencies (pnpm workspace)
pnpm build     # TypeScript + frontend (vite)
./dmux         # Run application
```

### Adding Features

1. **Extend DmuxPane**: Add fields to interface in `src/types.ts`
2. **Add Commands**: Use `useInput()` in `DmuxApp.tsx`
3. **Use Action System**: Define action function → register → wire dispatcher

### Meta-Development Notes

**Important**: dmux development happens inside dmux sessions (nested)

- Test in isolated session: `tmux new-session -d -s dmux-test`
- Check running processes: `ps aux | grep dmux`
- Always rebuild after changes: `pnpm build`

### Testing Checklist

- Outside/inside tmux, with/without OPENROUTER_API_KEY
- Pane cleanup, merge workflow, long prompts, rapid creation
- Debug logging: `console.error('Debug:', variable)`

## Troubleshooting

### Common Issues

1. **Agent not found**: Install `claude` or `opencode` CLI
2. **API key issues**: Check `echo $OPENROUTER_API_KEY` and test with curl
3. **Panes not appearing**: Verify tmux 3.0+, git 2.20+, write permissions
4. **Screen artifacts**: `Ctrl+L` or `tmux refresh-client`
5. **Merge conflicts**: Manually resolve in worktree, retry merge

### Debug Commands

```bash
tmux list-sessions                    # Check sessions
cat .dmux/dmux.config.json            # View config
ps aux | grep dmux                    # Running processes
```

### Performance Notes

- **Background operations** pause during dialogs to prevent input lag
- `execSync` blocks event loop - TUI checks dialog state before polling
- Slug generation falls back to timestamps if API unavailable

## Recent Updates

### Key Features

- **Grid Layout System** (Oct 2024): Fixed critical checksum bugs causing "invalid layout" errors
  - 16-bit masking and 4-digit padding for tmux compatibility
  - Sidebar width re-enforcement prevents drift during window resizes
  - Minimum spacer width (20 cells) prevents tmux rejection
  - Comprehensive test suite with regression tests for problematic widths
  - Debug logs always enabled for easier troubleshooting
- **Vue 3 Dashboard**: Full SFC migration with TypeScript, kebab menus, dialogs (see [BUNDLED_ASSETS.md](BUNDLED_ASSETS.md))
- **Standardized Action System**: Pure functions + adapters for TUI/Web/API consistency
- **LLM Status Detection**: Worker-based monitoring with smart activity detection
- **Pane Creation API**: `POST /api/panes` for programmatic creation
- **pnpm Workspace**: Single node_modules, consolidated dependencies
- **Enhanced Dialogs**: Auto-focus, Esc to close, loading spinners, chained interactions

### Known Issues

1. Agent availability not verified on startup
2. Long prompts may overflow in TUI
3. No undo for pane deletion
4. API timeouts not configured

### Planned

- Complete action system migration (VIEW/CLOSE done, MERGE in progress)
- Merge conflict resolution UI
- Custom keyboard shortcuts

## Best Practices

**Users**: Descriptive prompts, merge frequently, one feature per pane
**Developers**: Use action system, test all interfaces, update relevant docs (CLAUDE.md/API.md/BUNDLED_ASSETS.md/README.md)
