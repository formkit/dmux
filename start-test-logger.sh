#!/bin/bash

# Script to start the test logger in the streaming-test-pane tmux pane
# Usage: ./start-test-logger.sh

PANE_NAME="streaming-test-pane"

# Find the pane ID for streaming-test-pane
echo "[SCRIPT] Looking for pane: $PANE_NAME"

# Get list of all panes in current session with their IDs
PANE_LIST=$(tmux list-panes -a -F "#{pane_id} #{pane_title} #{pane_current_path}")

# Try to find the pane by checking dmux config
CONFIG_FILE=".dmux/dmux.config.json"

if [ -f "$CONFIG_FILE" ]; then
  echo "[SCRIPT] Reading dmux config..."
  PANE_ID=$(cat "$CONFIG_FILE" | grep -A 3 "\"$PANE_NAME\"" | grep "paneId" | sed 's/.*"paneId": "\(.*\)".*/\1/')

  if [ -n "$PANE_ID" ]; then
    echo "[SCRIPT] Found pane ID: $PANE_ID"

    # Clear the pane first
    echo "[SCRIPT] Clearing pane..."
    tmux send-keys -t "$PANE_ID" C-c
    sleep 0.5
    tmux send-keys -t "$PANE_ID" C-l

    # Change to the test pane directory
    echo "[SCRIPT] Starting test logger..."
    tmux send-keys -t "$PANE_ID" "cd /Users/justinschroeder/Projects/dmux/.dmux/worktrees/http-rest-server/.dmux/worktrees/streaming-test-pane" Enter
    sleep 0.3

    # Run the test logger
    tmux send-keys -t "$PANE_ID" "npx tsx test-stream-logger.tsx" Enter

    echo "[SCRIPT] Test logger started in pane $PANE_ID"
    echo "[SCRIPT] You can now run: npx tsx test-stream-capture.ts streaming-test-pane"
  else
    echo "[SCRIPT] ERROR: Could not find pane ID for $PANE_NAME in config"
    exit 1
  fi
else
  echo "[SCRIPT] ERROR: dmux config file not found: $CONFIG_FILE"
  exit 1
fi