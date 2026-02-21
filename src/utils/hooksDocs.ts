/**
 * Embedded Hooks Documentation
 *
 * This file contains all documentation that gets written to .dmux-hooks/
 * when the directory is initialized. The AGENTS_MD content is auto-generated
 * and imported from generated-agents-doc.ts
 */

import { AGENTS_MD } from './generated-agents-doc.js';

/**
 * Main documentation - gets written as both AGENTS.md and CLAUDE.md
 * Different agents look for different filenames, but content is identical
 */
export const HOOKS_DOCUMENTATION = AGENTS_MD;

/**
 * README for the .dmux-hooks/ directory
 */
export const HOOKS_README = `# dmux Hooks

This directory contains hooks that run automatically at key lifecycle events in dmux.

## Quick Start

1. **Read the documentation**:
   - \`AGENTS.md\` - Complete reference (for any AI agent)
   - \`CLAUDE.md\` - Same content (Claude Code looks for this filename)

2. **Check examples**:
   - \`examples/\` directory contains starter templates

3. **Create a hook**:
   \`\`\`bash
   touch worktree_created
   chmod +x worktree_created
   nano worktree_created
   \`\`\`

4. **Test it**:
   \`\`\`bash
   export DMUX_ROOT="\$(pwd)"
   export DMUX_WORKTREE_PATH="\$(pwd)"
   ./worktree_created
   \`\`\`

## Available Hooks

- \`before_pane_create\` - Before pane creation
- \`pane_created\` - After pane created
- \`worktree_created\` - After worktree setup
- \`before_pane_close\` - Before closing
- \`pane_closed\` - After closed
- \`before_worktree_remove\` - Before worktree removal
- \`worktree_removed\` - After worktree removed
- \`pre_merge\` - Before merge
- \`post_merge\` - After merge
- \`pre_pr\` - Before PR creation (blocking)
- \`post_pr\` - After PR created
- \`post_ci_check\` - When CI status changes
- \`run_test\` - When running tests
- \`run_dev\` - When starting dev server

## Documentation

See \`AGENTS.md\` or \`CLAUDE.md\` for complete documentation including:
- Environment variables
- HTTP callback API
- Common patterns
- Best practices
- Testing strategies

## Note

This directory is **version controlled**. Hooks you create here will be shared with your team.
`;

/**
 * Example: worktree_created hook
 */
export const EXAMPLE_WORKTREE_CREATED = `#!/bin/bash
# Example: worktree_created hook
#
# This hook runs after a new worktree is created and the agent is launched.
# Use it to set up the worktree environment (install deps, copy configs, etc.)

set -e  # Exit on error

echo "[Hook] Setting up worktree: $DMUX_SLUG"

cd "$DMUX_WORKTREE_PATH"

# Install dependencies in background (don't block dmux)
if [ -f "pnpm-lock.yaml" ]; then
  echo "[Hook] Installing dependencies with pnpm..."
  pnpm install --prefer-offline &
elif [ -f "package-lock.json" ]; then
  echo "[Hook] Installing dependencies with npm..."
  npm install &
elif [ -f "yarn.lock" ]; then
  echo "[Hook] Installing dependencies with yarn..."
  yarn install &
fi

# Copy environment file if it exists
if [ -f "$DMUX_ROOT/.env.local" ]; then
  echo "[Hook] Copying .env.local"
  cp "$DMUX_ROOT/.env.local" "$DMUX_WORKTREE_PATH/.env.local"
fi

# Set custom git config for this worktree
echo "[Hook] Configuring git"
git config user.name "dmux-agent/$DMUX_SLUG"
git config user.email "agent@dmux.local"

# Create a log entry
echo "[\$(date)] Created worktree: $DMUX_SLUG | Agent: $DMUX_AGENT | Prompt: $DMUX_PROMPT" \\
  >> "$DMUX_ROOT/.dmux/worktree_history.log"

echo "[Hook] Worktree setup complete!"
`;

/**
 * Example: run_dev hook
 */
export const EXAMPLE_RUN_DEV = `#!/bin/bash
# Example: run_dev hook
#
# This hook starts a dev server and optionally creates a tunnel for sharing.
# It reports the server URL back to dmux via the HTTP API.

set -e

echo "[Hook] Starting dev server for $DMUX_SLUG"

cd "$DMUX_WORKTREE_PATH"
API_URL="http://localhost:$DMUX_SERVER_PORT/api/panes/$DMUX_PANE_ID/dev"

# Update status: starting
curl -s -X PUT "$API_URL" \\
  -H "Content-Type: application/json" \\
  -d '{"status": "running"}' > /dev/null

# Start dev server in background
# Adjust the command for your project (pnpm dev, npm run dev, vite, etc.)
LOG_FILE="/tmp/dmux-dev-$DMUX_PANE_ID.log"
pnpm dev > "$LOG_FILE" 2>&1 &
DEV_PID=$!

# Wait for server to be ready
echo "[Hook] Waiting for dev server to start..."
sleep 5

# Detect port from log output
# Adjust the grep pattern for your dev server's output format
PORT=\$(grep -oP '(?<=localhost:)\\d+' "$LOG_FILE" | head -1)

if [ -z "$PORT" ]; then
  echo "[Hook] Warning: Could not detect port from logs, using default 3000"
  PORT=3000
fi

LOCAL_URL="http://localhost:$PORT"
echo "[Hook] Dev server running at $LOCAL_URL"

# Optional: Create a public tunnel (uncomment to enable)
# Requires ngrok, cloudflared, or another tunneling tool

# Example with cloudflared:
# TUNNEL_URL=\$(cloudflared tunnel --url "$LOCAL_URL" 2>&1 | \\
#   grep -oP 'https://[a-z0-9-]+\\.trycloudflare\\.com' | head -1)

# Example with ngrok:
# TUNNEL_URL=\$(ngrok http $PORT --log=stdout 2>&1 | \\
#   grep -oP 'url=https://[^"]+' | head -1 | cut -d= -f2)

# For now, just use local URL (uncomment tunnel code above to enable)
FINAL_URL="$LOCAL_URL"

# Report status back to dmux
curl -s -X PUT "$API_URL" \\
  -H "Content-Type: application/json" \\
  -d "{\\"status\\": \\"running\\", \\"url\\": \\"$FINAL_URL\\"}" > /dev/null

echo "[Hook] Dev server ready at: $FINAL_URL"
echo "[Hook] Dev server PID: $DEV_PID"
echo "[Hook] Log file: $LOG_FILE"
`;

/**
 * Example: run_test hook
 */
export const EXAMPLE_RUN_TEST = `#!/bin/bash
# Example: run_test hook
#
# This hook runs tests and reports the status back to dmux via the HTTP API.
# Status updates appear in real-time in the dmux UI.

set -e

echo "[Hook] Running tests for $DMUX_SLUG"

cd "$DMUX_WORKTREE_PATH"
API_URL="http://localhost:$DMUX_SERVER_PORT/api/panes/$DMUX_PANE_ID/test"

# Update status: running
curl -s -X PUT "$API_URL" \\
  -H "Content-Type: application/json" \\
  -d '{"status": "running"}' > /dev/null

echo "[Hook] Running test suite..."

# Capture test output
OUTPUT_FILE="/tmp/dmux-test-$DMUX_PANE_ID.txt"

# Run tests (adjust command for your project)
# Examples:
#   - pnpm test
#   - npm test
#   - vitest run
#   - jest
#   - pytest
#   - cargo test
if pnpm test > "$OUTPUT_FILE" 2>&1; then
  STATUS="passed"
  echo "[Hook] Tests passed ✓"
else
  STATUS="failed"
  echo "[Hook] Tests failed ✗"
fi

# Get output (truncate if too long)
OUTPUT=\$(head -c 5000 "$OUTPUT_FILE")

# Report results back to dmux
curl -s -X PUT "$API_URL" \\
  -H "Content-Type: application/json" \\
  -d "\$(jq -n \\
    --arg status "$STATUS" \\
    --arg output "$OUTPUT" \\
    '{status: \$status, output: \$output}')" > /dev/null

# Cleanup
rm -f "$OUTPUT_FILE"

echo "[Hook] Test results reported to dmux"

# Exit with test status
if [ "$STATUS" = "passed" ]; then
  exit 0
else
  exit 1
fi
`;

/**
 * Example: post_merge hook
 */
export const EXAMPLE_POST_MERGE = `#!/bin/bash
# Example: post_merge hook
#
# This hook runs after a successful merge into the target branch.
# Use it to trigger deployments, close issues, notify teams, etc.

set -e

echo "[Hook] Post-merge processing for $DMUX_SLUG → $DMUX_TARGET_BRANCH"

cd "$DMUX_ROOT"

# Push to remote if merging to main/master
if [ "$DMUX_TARGET_BRANCH" = "main" ] || [ "$DMUX_TARGET_BRANCH" = "master" ]; then
  echo "[Hook] Pushing to origin/$DMUX_TARGET_BRANCH"
  git push origin "$DMUX_TARGET_BRANCH"

  # Optional: Trigger deployment
  # if [ -n "$VERCEL_TOKEN" ]; then
  #   echo "[Hook] Triggering Vercel deployment..."
  #   curl -X POST "https://api.vercel.com/v1/deployments" \\
  #     -H "Authorization: Bearer $VERCEL_TOKEN" \\
  #     -H "Content-Type: application/json" \\
  #     -d '{
  #       "name": "my-project",
  #       "gitSource": {
  #         "type": "github",
  #         "ref": "main"
  #       }
  #     }'
  # fi
fi

# Close related GitHub issue (if prompt contains #123 format)
ISSUE_NUM=\$(echo "$DMUX_PROMPT" | grep -oP '#\\K\\d+' | head -1)
if [ -n "$ISSUE_NUM" ]; then
  echo "[Hook] Closing GitHub issue #$ISSUE_NUM"
  if command -v gh &> /dev/null; then
    gh issue close "$ISSUE_NUM" \\
      -c "Resolved in branch $DMUX_SLUG, merged to $DMUX_TARGET_BRANCH" \\
      2>/dev/null || echo "[Hook] Warning: Failed to close issue (maybe already closed?)"
  else
    echo "[Hook] GitHub CLI (gh) not found, skipping issue close"
  fi
fi

# Send notification to Slack
# if [ -n "$SLACK_WEBHOOK" ]; then
#   echo "[Hook] Sending Slack notification"
#   curl -s -X POST "$SLACK_WEBHOOK" \\
#     -H "Content-Type: application/json" \\
#     -d "{
#       \\"text\\": \\"Merged: $DMUX_SLUG → $DMUX_TARGET_BRANCH\\",
#       \\"blocks\\": [
#         {
#           \\"type\\": \\"section\\",
#           \\"text\\": {
#             \\"type\\": \\"mrkdwn\\",
#             \\"text\\": \\"*Branch Merged* :rocket:\\n\\n*From:* \\\`$DMUX_SLUG\\\`\\n*To:* \\\`$DMUX_TARGET_BRANCH\\\`\\n*Task:* $DMUX_PROMPT\\"
#           }
#         }
#       ]
#     }" > /dev/null
# fi

echo "[Hook] Post-merge processing complete"
`;

/**
 * Example: pre_pr hook (paranoid review)
 */
export const EXAMPLE_PRE_PR = `#!/bin/bash
# Example: pre_pr hook
#
# This hook runs BEFORE a PR is created (blocking).
# It reviews the diff using Claude with a paranoid review methodology,
# fixes any issues found, and commits the fixes.
#
# Available environment variables:
#   DMUX_WORKTREE_PATH - Path to the worktree
#   DMUX_BRANCH        - Branch name
#   DMUX_PR_TITLE      - Proposed PR title
#   DMUX_PR_BODY       - Proposed PR body
#   DMUX_BASE_BRANCH   - Base branch (e.g., main)
#   DMUX_SLUG          - Pane slug
#   DMUX_PROMPT        - Original task prompt
#
# Exit 0 to continue with PR creation, non-zero to abort.

set -e

cd "\$DMUX_WORKTREE_PATH"

BASE_BRANCH="\${DMUX_BASE_BRANCH:-main}"

# Get the diff to review
DIFF=\$(git diff "\$BASE_BRANCH"...HEAD 2>/dev/null || git diff HEAD~1 2>/dev/null || echo "(no diff available)")

# Skip review if diff is empty
if [ -z "\$DIFF" ] || [ "\$DIFF" = "(no diff available)" ]; then
  echo "[pre_pr] No changes to review, skipping."
  exit 0
fi

echo "[pre_pr] Reviewing diff before PR creation..."

# Truncate very large diffs to avoid token limits
MAX_CHARS=12000
if [ \${#DIFF} -gt \$MAX_CHARS ]; then
  DIFF="\${DIFF:0:\$MAX_CHARS}
...(truncated)"
fi

# Run Claude with a paranoid review prompt
claude --dangerously-skip-permissions -p "You are a paranoid code reviewer. Review the following diff and FIX any issues you find directly in the code.

Review across these 6 lenses:
1. **Correctness**: Logic errors, off-by-one, wrong variable, missing return, race conditions
2. **Edge Cases**: Null/undefined, empty arrays, boundary values, concurrent access
3. **Security**: Injection, XSS, SSRF, path traversal, secrets in code, unsafe deserialization
4. **Error Handling**: Swallowed errors, missing try/catch, unhelpful error messages, resource leaks
5. **Test Gaps**: Untested branches, missing edge case tests, assertions that don't verify behavior
6. **Architecture**: Coupling, naming, single responsibility, API contract violations

Rules:
- Only fix REAL issues. Do not refactor for style or add unnecessary comments.
- For each fix, stage the file with git add and commit with a descriptive message.
- If no issues are found, do nothing and exit cleanly.
- Work in the current directory: \$PWD

Original task: \$DMUX_PROMPT
PR Title: \$DMUX_PR_TITLE

Diff to review:
\$DIFF"

echo "[pre_pr] Review complete."
exit 0
`;

/**
 * Example: post_pr hook
 */
export const EXAMPLE_POST_PR = `#!/bin/bash
# Example: post_pr hook
#
# This hook runs after a GitHub Pull Request is created.
# Use it to notify teams, add labels, request reviewers, etc.

set -e

echo "[Hook] PR created: $DMUX_PR_URL"

# Add labels
if command -v gh &> /dev/null; then
  gh pr edit "$DMUX_PR_NUMBER" --add-label "ai-generated" 2>/dev/null || true
fi

# Request reviewers (uncomment and customize)
# gh pr edit "$DMUX_PR_NUMBER" --add-reviewer "@me" 2>/dev/null || true

echo "[Hook] Post-PR processing complete"
`;

/**
 * All embedded examples for easy iteration
 */
export const EXAMPLE_HOOKS = {
  'worktree_created.example': EXAMPLE_WORKTREE_CREATED,
  'run_dev.example': EXAMPLE_RUN_DEV,
  'run_test.example': EXAMPLE_RUN_TEST,
  'post_merge.example': EXAMPLE_POST_MERGE,
  'pre_pr.example': EXAMPLE_PRE_PR,
  'post_pr.example': EXAMPLE_POST_PR,
};
