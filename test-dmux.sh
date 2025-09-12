#!/bin/bash
# Start dmux in background
./dmux &
DMUX_PID=$!

# Wait a bit for it to start
sleep 2

# Capture screen content
tmux capture-pane -p | head -20

# Kill dmux
kill $DMUX_PID 2>/dev/null

# Wait for it to exit
wait $DMUX_PID 2>/dev/null

echo "Test completed"
