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

dmux is a sophisticated TypeScript-based tmux pane manager that creates AI-powered development sessions with Claude Code. It provides seamless integration between tmux, git worktrees, and Claude Code to enable parallel development workflows with automatic branch management and AI assistance.

### Key Capabilities
- **Project-specific tmux sessions**: Each project gets its own isolated tmux session
- **Horizontal split pane management**: Creates and manages tmux panes (not windows)
- **Git worktree integration**: Each pane operates in its own git worktree with a dedicated branch
- **Claude Code automation**: Automatically launches Claude with prompts and `--accept-edits` flag
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
- **System Requirements**: tmux, git, Claude Code CLI

### File Structure
```
/Users/justinschroeder/Projects/dmux/main/
├── src/
│   ├── index.ts          # Main entry point, session management
│   └── CmuxApp.tsx       # React TUI component, core logic
├── dist/                 # Compiled JavaScript (gitignored)
│   ├── index.js
│   └── CmuxApp.js
├── dmux                  # Executable wrapper script
├── package.json          # Node dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── .gitignore           # Git ignore rules
├── CLAUDE.md            # This documentation file
└── ~/.dmux/             # Runtime data directory
    └── {project}-panes.json  # Per-project pane tracking
```

## Installation & Setup

### Prerequisites
1. **System Requirements**
   ```bash
   # Required software
   tmux --version      # tmux 3.0+
   node --version      # Node.js 18+
   git --version       # Git 2.20+ (worktree support)
   claude --version    # Claude Code CLI
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
└── src/                   # Your code

main-project-fix-bug/      # Worktree for "fix bug" pane
├── .git                   # Worktree git file
└── src/                   # Independent working copy
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
2. Prompt for initial Claude command (optional)
3. Generate slug via OpenRouter API
4. Clear current pane (multiple strategies for clean display)
5. Exit Ink app gracefully
6. Create horizontal tmux split
7. Create git worktree: `git worktree add ../{project}-{slug} -b {slug}`
8. Change to worktree directory
9. Launch Claude: `claude "{prompt}" --permission-mode=acceptEdits`
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
class Cmux {
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

### 2. React TUI Component (`src/CmuxApp.tsx`)

#### State Management
```typescript
interface CmuxPane {
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

### 5. Tmux Command Execution

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
   - Claude launches in new pane with your prompt

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

## Development Guide

### Adding New Features

#### 1. Extend CmuxPane Interface
```typescript
interface CmuxPane {
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

#### 1. "Command not found: claude"
**Solution**: Install Claude Code CLI
```bash
# Check installation
which claude

# Install if missing
# Follow Claude Code installation instructions
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

## Recent Updates & Known Issues

### Recent Changes
- Enhanced screen clearing with multiple strategies
- Added merge confirmation dialogs  
- Improved focus management for new panes
- Implemented comprehensive worktree workflows
- Fixed boot reliability issues

### Known Issues
1. **Error handling**: Claude command availability not verified
2. **Long prompts**: May overflow in menu display
3. **Pane naming**: No rename functionality yet
4. **Deletion safety**: No undo for closed panes
5. **Network timeouts**: API calls can hang without timeout

### Planned Enhancements
- [ ] Pane renaming capability
- [ ] Undo close pane
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