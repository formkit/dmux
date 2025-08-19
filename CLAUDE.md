# CLAUDE.md - Project Context for cmux

## Project Overview
cmux is a TypeScript-based tmux pane manager that integrates with Claude Code to create AI-powered development sessions.

## Current Implementation

### Core Features
- **Tmux pane management**: Creates horizontal split panes (not windows)
- **Claude Code integration**: Automatically launches claude with `--accept-edits` flag
- **Interactive CLI**: Uses inquirer for arrow-key navigation dropdown menu
- **Smart naming**: Generates kebab-case slugs via OpenRouter API (gpt-4o-mini model)
- **Session persistence**: Tracks active panes in `~/.cmux/panes.json`
- **Auto-cleanup**: Filters out dead panes when loading the menu

### Architecture
- **Language**: TypeScript with ES modules
- **Main entry**: `src/index.ts` - Contains the Cmux class
- **Dependencies**: inquirer (for CLI), chalk (for colors)
- **Build output**: `dist/index.js` (compiled JavaScript)
- **Executable**: `cmux` shell script wrapper

### Key Behaviors
1. **First run**: If not in tmux, creates new session `cmux-main` and attaches
2. **Menu flow**: Shows list of active panes + "New cmux session" option
3. **New pane creation**:
   - Prompts for initial Claude Code prompt
   - Calls OpenRouter API to generate 1-2 word slug (requires `$OPENROUTER_API_KEY`)
   - Creates horizontal split pane
   - Runs `claude --accept-edits "<prompt>"` in new pane
   - Auto-resizes panes evenly
   - Returns focus to original pane
   - Shows menu again
4. **Pane switching**: Selecting existing pane switches tmux focus to it

### File Structure
```
/Users/justinschroeder/Projects/cmux/readme/
├── src/
│   └── index.ts       # Main TypeScript source
├── dist/              # Compiled JavaScript (gitignored)
├── cmux               # Executable wrapper
├── package.json       # Node.js project config
├── tsconfig.json      # TypeScript config
├── .gitignore
└── CLAUDE.md          # This file
```

### Environment Variables
- `OPENROUTER_API_KEY`: Required for slug generation (falls back to timestamp if not set)
- `TMUX`: Auto-detected to determine if running inside tmux

### Commands
- `npm install` - Install dependencies
- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Run TypeScript directly with tsx
- `./cmux` - Run the tool

## Recent Changes
- Replaced bash script with TypeScript implementation
- Changed from tmux windows to panes
- Added OpenRouter integration for slug generation
- Implemented inquirer-based interactive menu
- Added automatic pane resizing

## Known Issues/TODOs
- Error handling for when Claude command is not available
- Consider adding pane naming/renaming feature
- Could add pane deletion option in menu
- May want to handle very long prompts better in menu display

## Testing Notes
- Test both inside and outside tmux
- Verify pane cleanup works when panes are manually closed
- Check behavior without OPENROUTER_API_KEY set