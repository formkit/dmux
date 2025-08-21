#!/bin/bash

# Test script to monitor dmux permission prompt handling

echo "Starting dmux permission prompt test..."
echo "This will create a new dmux pane and monitor for permission prompts"
echo ""

# Function to capture pane content
capture_pane() {
    local pane_id=$1
    tmux capture-pane -t "$pane_id" -p -S -30
}

# Get current tmux session
SESSION=$(tmux display-message -p '#S')
echo "Current session: $SESSION"

# Count initial panes
INITIAL_PANES=$(tmux list-panes | wc -l)
echo "Initial pane count: $INITIAL_PANES"

# Start dmux
echo ""
echo "Starting dmux..."
./dmux &
DMUX_PID=$!

# Wait for dmux to start
sleep 2

echo ""
echo "Instructions:"
echo "1. Press 'n' to create a new pane"
echo "2. Enter a test prompt (or just press Enter)"
echo "3. Watch the console output for [dmux] debug messages"
echo ""
echo "The permission prompt should be automatically handled!"
echo ""
echo "Press Ctrl+C to stop monitoring"
echo ""

# Monitor for new panes and capture their content
while true; do
    CURRENT_PANES=$(tmux list-panes | wc -l)
    if [ "$CURRENT_PANES" -gt "$INITIAL_PANES" ]; then
        # New pane detected
        LATEST_PANE=$(tmux list-panes -F '#{pane_id}' | tail -1)
        echo "New pane detected: $LATEST_PANE"
        
        # Monitor the new pane for permission prompts
        for i in {1..20}; do
            sleep 0.5
            CONTENT=$(capture_pane "$LATEST_PANE")
            if echo "$CONTENT" | grep -iE "trust|permission|allow|folder.*\?" > /dev/null; then
                echo "=== PERMISSION PROMPT DETECTED ==="
                echo "$CONTENT" | tail -10
                echo "=================================="
                echo "Waiting for auto-response..."
                sleep 2
                echo "=== AFTER AUTO-RESPONSE ==="
                capture_pane "$LATEST_PANE" | tail -10
                echo "=================================="
                break
            fi
        done
        
        # Reset for next pane
        INITIAL_PANES=$CURRENT_PANES
    fi
    sleep 1
done