# cmux - AI-Powered tmux Development Sessions

cmux is a powerful tmux pane manager that creates parallel development environments with Claude Code AI assistance. Each pane gets its own git worktree and branch, enabling seamless parallel development workflows.

## Features

- **🚀 Parallel Development**: Work on multiple features simultaneously in separate panes
- **🌳 Git Worktree Integration**: Each pane operates in its own isolated git worktree
- **🤖 AI-Powered**: Automatic branch naming and commit message generation
- **🎯 Claude Code Integration**: Launch Claude with prompts and auto-accept edits
- **📦 Project Isolation**: Each project gets its own tmux session
- **🔄 Smart Merging**: One-command merge workflow with automatic cleanup

## Prerequisites

- **tmux** 3.0 or higher
- **Node.js** 18 or higher  
- **Git** 2.20 or higher (with worktree support)
- **Claude Code CLI** (`claude` command must be available)
- **OpenRouter API Key** (optional but recommended for AI features)

## Installation

### 1. Clone and Build

```bash
# Clone the repository
git clone <repository-url> ~/cmux
cd ~/cmux

# Install dependencies
npm install

# Build the project
npm run build
```

### 2. Global Installation

Choose one of these methods:

#### Option A: Symlink (Recommended)
```bash
# Make the script executable
chmod +x ~/cmux/cmux

# Create symlink in a directory that's in your PATH
sudo ln -s ~/cmux/cmux /usr/local/bin/cmux
```

#### Option B: Add to PATH
```bash
# Add this line to your ~/.bashrc or ~/.zshrc
export PATH="$PATH:$HOME/cmux"

# Reload your shell configuration
source ~/.bashrc  # or ~/.zshrc
```

#### Option C: NPM Global Link
```bash
# From the cmux directory
npm link
```

### 3. Configure AI Features (Optional)

For AI-powered branch naming and commit messages:

```bash
# Add to your ~/.bashrc or ~/.zshrc
export OPENROUTER_API_KEY="your-api-key-here"
```

Get your API key from [OpenRouter](https://openrouter.ai/).

## Quick Start

### Basic Usage

1. **Start cmux in your project**
   ```bash
   cd /path/to/your/project
   cmux
   ```

2. **Create a new development pane**
   - Press `n` or select "+ New cmux pane"
   - Enter an optional prompt like "fix authentication bug"
   - Claude launches in a new pane with your prompt

3. **Navigate between panes**
   - Use `↑/↓` arrows to select panes
   - Press `j` or `Enter` to jump to a pane

4. **Merge your work**
   - Select the pane you want to merge
   - Press `m` to merge into main branch
   - Confirm to close the pane

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑/↓` | Navigate pane list |
| `Enter` or `j` | Jump to selected pane |
| `n` | Create new cmux pane |
| `m` | Merge worktree to main |
| `x` | Close selected pane |
| `q` | Quit cmux interface |
| `ESC` | Cancel current dialog |

## Example Workflow

```bash
# Start cmux in your project
cd ~/projects/my-app
cmux

# Create a pane for a new feature
# Press 'n', enter: "add user dashboard"
# Claude opens with your prompt

# Create another pane for a bug fix
# Press 'n', enter: "fix memory leak"
# Work on both simultaneously

# When feature is complete
# Select the pane, press 'm' to merge

# Jump between panes as needed
# Press 'j' on any pane to switch focus
```

## How It Works

1. **Session Management**: Each project gets its own tmux session (`cmux-projectname`)
2. **Worktree Creation**: New panes create git worktrees in sibling directories
3. **Branch Management**: Automatic branch creation with AI-generated names
4. **Claude Integration**: Launches Claude with `--accept-edits` for immediate coding
5. **Smart Merging**: Auto-commits, generates messages, and cleans up worktrees

## Project Structure

When you create panes, cmux organizes your work like this:

```
my-project/              # Your main repository
├── .git/
└── src/

my-project-fix-auth/     # Worktree for "fix authentication"
├── .git                 # Worktree reference
└── src/                 # Independent working copy

my-project-add-feature/  # Worktree for "add new feature"
├── .git
└── src/
```

## Troubleshooting

### Claude command not found
Install Claude Code CLI from [Claude Code documentation](https://claude.ai/code).

### API features not working
```bash
# Check your API key
echo $OPENROUTER_API_KEY

# If missing, add to your shell config
export OPENROUTER_API_KEY="your-key"
```

### Panes not appearing
- Ensure tmux version 3.0+: `tmux -V`
- Check git version 2.20+: `git --version`
- Verify write permissions in parent directory

### Screen artifacts
Press `Ctrl+L` in the affected pane to clear the screen.

## Tips

- **Use descriptive prompts** for better AI-generated branch names
- **Merge frequently** to keep your main branch updated
- **One feature per pane** for clean separation of work
- **Close unused panes** with `x` to keep the interface clean

## Requirements Summary

- tmux ≥ 3.0
- Node.js ≥ 18
- Git ≥ 2.20
- Claude Code CLI
- OpenRouter API key (optional)

## Support

For issues or questions, please check the [full documentation](CLAUDE.md) or open an issue on GitHub.

## License

[Your License Here]