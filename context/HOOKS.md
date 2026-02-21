# dmux Hooks System

Hooks allow you to run custom scripts at key lifecycle events in dmux. They enable you to integrate dmux with your existing development workflows, CI/CD pipelines, tunneling services, and more.

## Table of Contents

1. [Overview](#overview)
2. [How Hooks Work](#how-hooks-work)
3. [Available Hooks](#available-hooks)
4. [Environment Variables](#environment-variables)
5. [HTTP Callbacks](#http-callbacks)
6. [Examples](#examples)
7. [Best Practices](#best-practices)
8. [Debugging](#debugging)

## Overview

Hooks are executable scripts stored in `.dmux/hooks/` within your project. When certain events occur (like creating a worktree or merging branches), dmux automatically executes the corresponding hook script if it exists.

**Key Features:**
- **Convention-based**: Just create an executable file with the hook name
- **Non-blocking**: Hooks run in the background and don't freeze the UI
- **Environment-based**: Receive context via environment variables
- **HTTP integration**: Test/dev hooks can update dmux state via REST API
- **Error-tolerant**: Hook failures are logged but don't crash dmux

## How Hooks Work

### Basic Setup

1. Create the hooks directory (if it doesn't exist):
   ```bash
   mkdir -p .dmux/hooks
   ```

2. Create a hook script:
   ```bash
   touch .dmux/hooks/worktree_created
   chmod +x .dmux/hooks/worktree_created
   ```

3. Add your script content:
   ```bash
   #!/bin/bash
   echo "Worktree created at: $DMUX_WORKTREE_PATH"
   # Your custom logic here
   ```

### Execution Model

- **Asynchronous**: Most hooks run in the background using `spawn()` with `detached: true`
- **Independent**: Hook processes are detached from dmux, so they can outlive the parent
- **Logged**: Hook execution and errors are logged to stderr with `[Hooks]` prefix
- **Permissive**: If a hook script doesn't exist or isn't executable, dmux continues normally

### Making Scripts Executable

Before dmux can run a hook, it must be executable:

```bash
chmod +x .dmux/hooks/worktree_created
chmod +x .dmux/hooks/pre_merge
chmod +x .dmux/hooks/run_dev
```

## Available Hooks

### Pane Lifecycle Hooks

#### `before_pane_create`
**When**: Before any pane creation steps begin
**Use case**: Validate conditions, prepare resources, send notifications

**Available variables:**
- `DMUX_ROOT` - Project root directory
- `DMUX_SERVER_PORT` - dmux HTTP server port
- `DMUX_PROMPT` - User's prompt for the agent
- `DMUX_AGENT` - Agent type (claude or opencode)

**Example:**
```bash
#!/bin/bash
# .dmux/hooks/before_pane_create

# Log pane creation to a file
echo "[$(date)] Creating pane: $DMUX_PROMPT" >> "$DMUX_ROOT/.dmux/pane_history.log"

# Send notification to Slack
curl -X POST https://hooks.slack.com/... \
  -d "{\"text\": \"New dmux pane: $DMUX_PROMPT\"}"
```

---

#### `pane_created`
**When**: After tmux pane is created, before worktree creation
**Use case**: Setup pane environment, configure tmux settings

**Available variables:**
- All from `before_pane_create`, plus:
- `DMUX_PANE_ID` - dmux pane identifier (e.g., dmux-1234567890)
- `DMUX_SLUG` - Generated slug for branch/worktree name
- `DMUX_TMUX_PANE_ID` - tmux pane ID (e.g., %38)

**Example:**
```bash
#!/bin/bash
# .dmux/hooks/pane_created

# Set custom tmux pane options
tmux set-option -p -t "$DMUX_TMUX_PANE_ID" remain-on-exit on
tmux set-option -p -t "$DMUX_TMUX_PANE_ID" pane-border-style "fg=blue"
```

---

#### `worktree_created`
**When**: After worktree is created and agent is launched
**Use case**: Setup worktree environment, install dependencies, configure git

**Available variables:**
- All from `pane_created`, plus:
- `DMUX_WORKTREE_PATH` - Full path to the worktree directory
- `DMUX_BRANCH` - Branch name (same as slug)

**Example:**
```bash
#!/bin/bash
# .dmux/hooks/worktree_created

cd "$DMUX_WORKTREE_PATH"

# Install dependencies in worktree
if [ -f "package.json" ]; then
  pnpm install --prefer-offline &
fi

# Copy environment file
if [ -f "$DMUX_ROOT/.env.local" ]; then
  cp "$DMUX_ROOT/.env.local" "$DMUX_WORKTREE_PATH/.env.local"
fi

# Keep existing git author identity.
# Do not override user.name/user.email in this hook.
```

---

#### `before_pane_close`
**When**: Before closing a pane (user initiated)
**Use case**: Cleanup operations, save state, create backups

**Available variables:**
- `DMUX_ROOT`
- `DMUX_SERVER_PORT`
- `DMUX_PANE_ID`
- `DMUX_SLUG`
- `DMUX_TMUX_PANE_ID`
- `DMUX_WORKTREE_PATH` (if worktree exists)
- `DMUX_BRANCH` (if worktree exists)

**Example:**
```bash
#!/bin/bash
# .dmux/hooks/before_pane_close

# Backup uncommitted changes
if [ -d "$DMUX_WORKTREE_PATH" ]; then
  cd "$DMUX_WORKTREE_PATH"
  if ! git diff-index --quiet HEAD --; then
    git stash push -m "Auto-backup before pane close $(date)"
  fi
fi
```

---

#### `pane_closed`
**When**: After pane is closed (pane no longer exists)
**Use case**: Cleanup external resources, notifications, analytics

**Available variables:**
- Same as `before_pane_close`
- Note: The pane is already closed, but variables contain its last state

**Example:**
```bash
#!/bin/bash
# .dmux/hooks/pane_closed

# Log closure
echo "[$(date)] Closed pane: $DMUX_SLUG" >> "$DMUX_ROOT/.dmux/pane_history.log"

# Notify team
curl -X POST https://api.yourservice.com/panes/close \
  -d "{\"slug\": \"$DMUX_SLUG\", \"pane_id\": \"$DMUX_PANE_ID\"}"
```

---

### Worktree Hooks

#### `before_worktree_remove`
**When**: Before removing a worktree directory
**Use case**: Backup work, save analysis results, cleanup resources

**Available variables:**
- `DMUX_ROOT`
- `DMUX_SERVER_PORT`
- `DMUX_PANE_ID`
- `DMUX_SLUG`
- `DMUX_WORKTREE_PATH`
- `DMUX_BRANCH`

**Example:**
```bash
#!/bin/bash
# .dmux/hooks/before_worktree_remove

# Archive worktree for later analysis
cd "$DMUX_WORKTREE_PATH"
tar -czf "$DMUX_ROOT/.dmux/archives/$DMUX_SLUG-$(date +%s).tar.gz" .

# Save any build artifacts
if [ -d "dist" ]; then
  cp -r dist "$DMUX_ROOT/.dmux/artifacts/$DMUX_SLUG-dist"
fi
```

---

#### `worktree_removed`
**When**: After worktree is removed (directory no longer exists)
**Use case**: Cleanup external references, update indexes

**Available variables:**
- Same as `before_worktree_remove`
- Note: Worktree is gone, but variables contain its last path

**Example:**
```bash
#!/bin/bash
# .dmux/hooks/worktree_removed

# Clean up any temp files that referenced this worktree
find /tmp -name "*$DMUX_SLUG*" -delete 2>/dev/null

# Update a database
sqlite3 "$DMUX_ROOT/.dmux/worktrees.db" \
  "UPDATE worktrees SET removed_at = datetime('now') WHERE path = '$DMUX_WORKTREE_PATH'"
```

---

### Merge Hooks

#### `pre_merge`
**When**: After user confirms merge, before merge operation starts
**Use case**: Pre-merge validation, create backups, notify team

**Available variables:**
- All standard pane variables, plus:
- `DMUX_TARGET_BRANCH` - Branch being merged into (e.g., main)

**Example:**
```bash
#!/bin/bash
# .dmux/hooks/pre_merge

# Run final tests before merge
cd "$DMUX_WORKTREE_PATH"
pnpm test || {
  echo "Tests failed! Merge will still proceed, but you should review."
}

# Notify team
curl -X POST https://hooks.slack.com/... \
  -d "{\"text\": \"Merging $DMUX_SLUG into $DMUX_TARGET_BRANCH\"}"
```

---

#### `post_merge`
**When**: After successful merge, before cleanup prompt
**Use case**: Deploy changes, trigger CI, update issue trackers

**Available variables:**
- All standard pane variables, plus:
- `DMUX_TARGET_BRANCH` - Branch that was merged into

**Example:**
```bash
#!/bin/bash
# .dmux/hooks/post_merge

cd "$DMUX_ROOT"

# Trigger deployment
if [ "$DMUX_TARGET_BRANCH" = "main" ]; then
  git push origin main
  curl -X POST https://api.vercel.com/v1/deployments \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -d '{"name": "my-project", "target": "production"}'
fi

# Close related GitHub issue
ISSUE_NUM=$(echo "$DMUX_PROMPT" | grep -oP '#\K\d+' | head -1)
if [ -n "$ISSUE_NUM" ]; then
  gh issue close "$ISSUE_NUM" -c "Fixed in $DMUX_SLUG"
fi
```

---

### Test & Dev Hooks (HTTP Integration)

These hooks can update dmux state via HTTP callbacks, enabling real-time status updates in the UI.

#### `run_test`
**When**: User triggers test command for a pane
**Use case**: Run tests, report status back to dmux

**Available variables:**
- All standard pane variables

**HTTP Callback**: `PUT http://localhost:$DMUX_SERVER_PORT/api/panes/$DMUX_PANE_ID/test`

**Request body:**
```json
{
  "status": "running" | "passed" | "failed",
  "output": "Test output text (optional)"
}
```

**Example:**
```bash
#!/bin/bash
# .dmux/hooks/run_test

cd "$DMUX_WORKTREE_PATH"

# Update status to running
curl -X PUT "http://localhost:$DMUX_SERVER_PORT/api/panes/$DMUX_PANE_ID/test" \
  -H "Content-Type: application/json" \
  -d '{"status": "running"}'

# Run tests
if pnpm test > /tmp/test-output-$DMUX_PANE_ID.txt 2>&1; then
  STATUS="passed"
else
  STATUS="failed"
fi

# Update with results
OUTPUT=$(cat /tmp/test-output-$DMUX_PANE_ID.txt)
curl -X PUT "http://localhost:$DMUX_SERVER_PORT/api/panes/$DMUX_PANE_ID/test" \
  -H "Content-Type: application/json" \
  -d "{\"status\": \"$STATUS\", \"output\": \"$OUTPUT\"}"

# Cleanup
rm /tmp/test-output-$DMUX_PANE_ID.txt
```

---

#### `run_dev`
**When**: User triggers dev server command for a pane
**Use case**: Start dev server, optionally tunnel it, report URL back to dmux

**Available variables:**
- All standard pane variables

**HTTP Callback**: `PUT http://localhost:$DMUX_SERVER_PORT/api/panes/$DMUX_PANE_ID/dev`

**Request body:**
```json
{
  "status": "running" | "stopped",
  "url": "http://localhost:3000 or https://tunnel-url.com (optional)"
}
```

**Example (Basic):**
```bash
#!/bin/bash
# .dmux/hooks/run_dev

cd "$DMUX_WORKTREE_PATH"

# Start dev server in background
pnpm dev > /tmp/dev-$DMUX_PANE_ID.log 2>&1 &
DEV_PID=$!

# Wait for server to be ready
sleep 3

# Detect port from output
PORT=$(grep -oP 'localhost:\K\d+' /tmp/dev-$DMUX_PANE_ID.log | head -1)
if [ -z "$PORT" ]; then
  PORT=3000  # fallback
fi

# Report status
curl -X PUT "http://localhost:$DMUX_SERVER_PORT/api/panes/$DMUX_PANE_ID/dev" \
  -H "Content-Type: application/json" \
  -d "{\"status\": \"running\", \"url\": \"http://localhost:$PORT\"}"
```

**Example (With Tunneling):**
```bash
#!/bin/bash
# .dmux/hooks/run_dev

cd "$DMUX_WORKTREE_PATH"

# Start dev server
pnpm dev > /tmp/dev-$DMUX_PANE_ID.log 2>&1 &
DEV_PID=$!
sleep 3

# Detect port
PORT=$(grep -oP 'localhost:\K\d+' /tmp/dev-$DMUX_PANE_ID.log | head -1)
[ -z "$PORT" ] && PORT=3000

# Create tunnel with ngrok or cloudflare
TUNNEL_URL=$(cloudflared tunnel --url http://localhost:$PORT 2>&1 | \
  grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1)

# Report with tunnel URL
if [ -n "$TUNNEL_URL" ]; then
  curl -X PUT "http://localhost:$DMUX_SERVER_PORT/api/panes/$DMUX_PANE_ID/dev" \
    -H "Content-Type: application/json" \
    -d "{\"status\": \"running\", \"url\": \"$TUNNEL_URL\"}"
else
  # Fallback to localhost
  curl -X PUT "http://localhost:$DMUX_SERVER_PORT/api/panes/$DMUX_PANE_ID/dev" \
    -H "Content-Type: application/json" \
    -d "{\"status\": \"running\", \"url\": \"http://localhost:$PORT\"}"
fi
```

---

## Environment Variables

### Always Available

| Variable | Description | Example |
|----------|-------------|---------|
| `DMUX_ROOT` | Project root directory | `/Users/you/projects/myapp` |
| `DMUX_SERVER_PORT` | HTTP server port | `3142` |

### Pane-Specific (most hooks)

| Variable | Description | Example |
|----------|-------------|---------|
| `DMUX_PANE_ID` | dmux pane identifier | `dmux-1234567890` |
| `DMUX_SLUG` | Branch/worktree name | `fix-auth-bug` |
| `DMUX_PROMPT` | User's initial prompt | `Fix authentication bug` |
| `DMUX_AGENT` | Agent type | `claude` or `opencode` |
| `DMUX_TMUX_PANE_ID` | tmux pane ID | `%38` |

### Worktree-Specific

| Variable | Description | Example |
|----------|-------------|---------|
| `DMUX_WORKTREE_PATH` | Full worktree path | `/Users/you/projects/myapp/.dmux/worktrees/fix-auth-bug` |
| `DMUX_BRANCH` | Branch name | `fix-auth-bug` |

### Merge-Specific

| Variable | Description | Example |
|----------|-------------|---------|
| `DMUX_TARGET_BRANCH` | Target branch for merge | `main` |

### Parent Environment

All hooks also inherit the parent shell's environment, so you have access to:
- `PATH`, `HOME`, `USER`, etc.
- Any custom environment variables (e.g., `VERCEL_TOKEN`, `SLACK_WEBHOOK`)

---

## HTTP Callbacks

### Overview

The `run_test` and `run_dev` hooks can communicate back to dmux via HTTP to update pane state in real-time. This enables:
- Live test status indicators in the UI
- Displaying dev server URLs (including tunneled URLs)
- Better visibility into background operations

### Base URL

All API endpoints use: `http://localhost:$DMUX_SERVER_PORT`

You can get the port from the `DMUX_SERVER_PORT` environment variable.

### Endpoints

#### `PUT /api/panes/:paneId/test`

Update test status for a pane.

**Parameters:**
- `:paneId` - The `DMUX_PANE_ID` value

**Request Body:**
```json
{
  "status": "running" | "passed" | "failed",
  "output": "Optional test output text"
}
```

**Response:**
```json
{
  "success": true,
  "paneId": "dmux-1234567890",
  "testStatus": "passed",
  "message": "Test status updated to passed"
}
```

---

#### `PUT /api/panes/:paneId/dev`

Update dev server status and URL for a pane.

**Parameters:**
- `:paneId` - The `DMUX_PANE_ID` value

**Request Body:**
```json
{
  "status": "running" | "stopped",
  "url": "http://localhost:3000 or https://tunnel.example.com"
}
```

**Response:**
```json
{
  "success": true,
  "paneId": "dmux-1234567890",
  "devStatus": "running",
  "devUrl": "https://tunnel.example.com",
  "message": "Dev server started at https://tunnel.example.com"
}
```

---

## Examples

### Example 1: Auto-install Dependencies

```bash
#!/bin/bash
# .dmux/hooks/worktree_created

cd "$DMUX_WORKTREE_PATH"

# Detect package manager and install
if [ -f "pnpm-lock.yaml" ]; then
  pnpm install --prefer-offline &
elif [ -f "package-lock.json" ]; then
  npm install &
elif [ -f "yarn.lock" ]; then
  yarn install &
fi
```

### Example 2: Track Pane Metrics

```bash
#!/bin/bash
# .dmux/hooks/pane_closed

# Log pane lifetime
CREATED=$(date -r "$DMUX_ROOT/.dmux/worktrees/$DMUX_SLUG" +%s 2>/dev/null || echo "0")
CLOSED=$(date +%s)
LIFETIME=$((CLOSED - CREATED))

echo "$DMUX_SLUG,$LIFETIME,$DMUX_PROMPT" >> "$DMUX_ROOT/.dmux/metrics.csv"
```

### Example 3: Multi-Stage Testing

```bash
#!/bin/bash
# .dmux/hooks/run_test

cd "$DMUX_WORKTREE_PATH"
API="http://localhost:$DMUX_SERVER_PORT/api/panes/$DMUX_PANE_ID/test"

# Update: running
curl -X PUT "$API" -H "Content-Type: application/json" -d '{"status": "running"}'

# Stage 1: Lint
if ! pnpm lint; then
  curl -X PUT "$API" -H "Content-Type: application/json" \
    -d '{"status": "failed", "output": "Linting failed"}'
  exit 1
fi

# Stage 2: Type check
if ! pnpm tsc --noEmit; then
  curl -X PUT "$API" -H "Content-Type: application/json" \
    -d '{"status": "failed", "output": "Type checking failed"}'
  exit 1
fi

# Stage 3: Unit tests
if ! pnpm test; then
  curl -X PUT "$API" -H "Content-Type: application/json" \
    -d '{"status": "failed", "output": "Unit tests failed"}'
  exit 1
fi

# Success!
curl -X PUT "$API" -H "Content-Type: application/json" \
  -d '{"status": "passed", "output": "All tests passed ✓"}'
```

### Example 4: Share Dev Server with Team

```bash
#!/bin/bash
# .dmux/hooks/run_dev

cd "$DMUX_WORKTREE_PATH"
API="http://localhost:$DMUX_SERVER_PORT/api/panes/$DMUX_PANE_ID/dev"

# Start dev server
pnpm dev > /tmp/dev-$DMUX_PANE_ID.log 2>&1 &
sleep 3

# Get port
PORT=$(grep -oP 'localhost:\K\d+' /tmp/dev-$DMUX_PANE_ID.log | head -1)
[ -z "$PORT" ] && PORT=3000

# Create shareable tunnel
TUNNEL=$(ngrok http $PORT --log=stdout 2>&1 | \
  grep -oP 'url=https://[^"]+' | head -1 | cut -d= -f2)

# Report tunnel URL
curl -X PUT "$API" -H "Content-Type: application/json" \
  -d "{\"status\": \"running\", \"url\": \"$TUNNEL\"}"

# Post to Slack
curl -X POST "$SLACK_WEBHOOK" \
  -d "{\"text\": \"Dev preview for $DMUX_SLUG: $TUNNEL\"}"
```

---

## Best Practices

### 1. Make Scripts Executable
Always set execute permissions on your hook scripts:
```bash
chmod +x .dmux/hooks/*
```

### 2. Use Shebang Lines
Start every hook with a proper shebang:
```bash
#!/bin/bash
# or
#!/usr/bin/env node
# or
#!/usr/bin/env python3
```

### 3. Handle Errors Gracefully
Don't let hook errors crash your scripts:
```bash
#!/bin/bash
set -e  # Exit on error

cd "$DMUX_WORKTREE_PATH" || {
  echo "Failed to cd to worktree"
  exit 1
}

pnpm install || echo "Install failed, continuing anyway"
```

### 4. Run Long Operations in Background
For hooks that trigger long-running processes, use `&` to background them:
```bash
#!/bin/bash
pnpm install &  # Don't block dmux
```

### 5. Log Hook Output
For debugging, log to a file:
```bash
#!/bin/bash
{
  echo "=== $(date) ==="
  echo "Pane: $DMUX_PANE_ID"
  echo "Worktree: $DMUX_WORKTREE_PATH"
  # Your hook logic
} >> "$DMUX_ROOT/.dmux/hooks.log" 2>&1
```

### 6. Check for Required Tools
Verify dependencies before using them:
```bash
#!/bin/bash
if ! command -v ngrok &> /dev/null; then
  echo "ngrok not found, skipping tunnel"
  exit 0
fi
```

### 7. Use Environment Variables for Config
Store sensitive data in environment variables, not in hook scripts:
```bash
#!/bin/bash
if [ -z "$SLACK_WEBHOOK" ]; then
  echo "SLACK_WEBHOOK not set, skipping notification"
  exit 0
fi

curl -X POST "$SLACK_WEBHOOK" -d '{"text": "..."}'
```

### 8. Keep Hooks Fast
Hooks should complete quickly or run in the background. Avoid:
- Large file downloads
- Long-running synchronous operations
- Blocking user input

### 9. Document Your Hooks
Add comments explaining what each hook does:
```bash
#!/bin/bash
# This hook installs dependencies when a worktree is created
# It runs in the background to avoid blocking dmux
```

---

## Debugging

### Enable Hook Logging

Hook execution is logged to stderr with the `[Hooks]` prefix. To see these logs:

```bash
# Run dmux and pipe stderr to a file
./dmux 2> dmux-hooks.log

# In another terminal, tail the log
tail -f dmux-hooks.log | grep '\[Hooks\]'
```

### Common Issues

#### Hook Not Running
1. Check if file exists: `ls -la .dmux/hooks/`
2. Verify it's executable: `ls -l .dmux/hooks/worktree_created`
3. Look for error logs: `grep '\[Hooks\]' dmux-hooks.log`

#### Hook Runs But Fails
1. Test the script manually:
   ```bash
   export DMUX_ROOT="$(pwd)"
   export DMUX_PANE_ID="test-pane"
   # ... set other vars
   ./.dmux/hooks/worktree_created
   ```
2. Check for missing dependencies: `command -v <tool>`
3. Review script syntax: `bash -n .dmux/hooks/worktree_created`

#### HTTP Callbacks Not Working
1. Verify server is running: `curl http://localhost:$DMUX_SERVER_PORT/api/health`
2. Check pane ID is correct: `echo $DMUX_PANE_ID`
3. Test endpoint manually:
   ```bash
   curl -X PUT http://localhost:3142/api/panes/dmux-123/test \
     -H "Content-Type: application/json" \
     -d '{"status": "passed"}'
   ```

#### Permission Denied
```bash
chmod +x .dmux/hooks/*
```

#### Shebang Issues
Make sure your shebang line is correct:
- `#!/bin/bash` - Use bash
- `#!/usr/bin/env node` - Use Node.js
- `#!/usr/bin/env python3` - Use Python 3

---

## Security Notes

1. **Never commit sensitive data** to hook scripts (API keys, tokens, etc.)
2. **Use environment variables** for secrets
3. **Validate input** if hooks process user data
4. **Be careful with `eval`** or dynamic code execution
5. **Review hook scripts** from untrusted sources before running

---

## Advanced: Hook Composition

You can create a "meta-hook" that calls multiple scripts:

```bash
#!/bin/bash
# .dmux/hooks/worktree_created

# Run all scripts in hooks/worktree_created.d/
if [ -d "$DMUX_ROOT/.dmux/hooks/worktree_created.d" ]; then
  for script in "$DMUX_ROOT/.dmux/hooks/worktree_created.d"/*; do
    if [ -x "$script" ]; then
      "$script" &
    fi
  done
fi
```

Then place individual hook scripts in `.dmux/hooks/worktree_created.d/`:
```
.dmux/hooks/
├── worktree_created          # Meta-hook that runs all .d/ scripts
└── worktree_created.d/
    ├── 01-install-deps
    ├── 02-copy-env
    └── 03-notify-team
```

---

## Troubleshooting Checklist

- [ ] Hook file exists in `.dmux/hooks/`
- [ ] Hook file is executable (`chmod +x`)
- [ ] Shebang line is correct (`#!/bin/bash`)
- [ ] Required tools are installed
- [ ] Environment variables are set
- [ ] Script has no syntax errors (`bash -n script`)
- [ ] dmux server is running (for HTTP callbacks)
- [ ] Checking logs for `[Hooks]` errors

---

## Further Reading

- [dmux Actions System](./CLAUDE.md#standardized-action-system)
- [dmux REST API](./API.md)
- [tmux Scripting](https://man.openbsd.org/tmux.1)
- [Git Worktrees](https://git-scm.com/docs/git-worktree)
