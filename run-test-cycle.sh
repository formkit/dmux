#!/bin/bash

# Automated test cycle for terminal streaming
# Runs test logger, captures with Playwright, analyzes results

set -e

echo "=== Terminal Streaming Test Cycle ==="
echo

# Step 1: Clear old test output
echo "[1/5] Clearing old test output..."
rm -rf test-output
mkdir -p test-output

# Step 2: Start test logger in streaming-test-pane
echo "[2/5] Starting test logger in streaming-test-pane..."
PANE_ID="%36"

# Clear the pane
tmux send-keys -t "$PANE_ID" C-c 2>/dev/null || true
sleep 0.5
tmux send-keys -t "$PANE_ID" C-l

# Navigate and start
tmux send-keys -t "$PANE_ID" "cd /Users/justinschroeder/Projects/dmux/.dmux/worktrees/http-rest-server/.dmux/worktrees/streaming-test-pane" Enter
sleep 0.3
tmux send-keys -t "$PANE_ID" "npx tsx test-stream-logger.tsx" Enter

echo "   Logger started (will run for 8 seconds)"

# Step 3: Wait for logger to generate content
echo "[3/5] Waiting for test logger to run..."
sleep 2

# Step 4: Run Playwright capture
echo "[4/5] Starting Playwright capture (10 seconds)..."
npx tsx test-stream-capture.ts streaming-test-pane 42000

# Step 5: Analyze results
echo
echo "[5/5] Test complete!"
echo "   Screenshots saved to: test-output/"
echo "   Total screenshots: $(ls test-output/screenshot-*.png 2>/dev/null | wc -l | tr -d ' ')"
echo
echo "Next steps:"
echo "  1. Review screenshots in test-output/"
echo "  2. Compare to actual tmux pane"
echo "  3. Check console logs for debug output"
echo
