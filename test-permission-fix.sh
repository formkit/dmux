#!/bin/bash

# Test script to verify the permission prompt fix
echo "Testing Claude permission prompt auto-acceptance..."

# Create test directory without Claude permissions
cd /tmp
rm -rf test-permission-fix
mkdir test-permission-fix
cd test-permission-fix
git init
echo "console.log('test')" > test.js
git add .
git commit -m "initial"

# Create tmux session
tmux new-session -d -s test-permission-fix

# Navigate and start Claude
tmux send-keys -t test-permission-fix "cd /tmp/test-permission-fix" Enter
sleep 1

# Start Claude (this should trigger permission prompt)
tmux send-keys -t test-permission-fix "claude 'test prompt'" Enter
sleep 2

# Capture content to see if permission prompt appeared
echo "Initial content:"
tmux capture-pane -t test-permission-fix -p

# Test our new auto-approval logic manually
echo ""
echo "Testing auto-approval (simulating dmux logic)..."

# Check for new Claude format
CONTENT=$(tmux capture-pane -t test-permission-fix -p)
if echo "$CONTENT" | grep -q "❯.*1.*Yes.*proceed"; then
    echo "Detected new Claude format, sending Enter..."
    tmux send-keys -t test-permission-fix Enter
    sleep 2
    echo "Content after Enter:"
    tmux capture-pane -t test-permission-fix -p
elif echo "$CONTENT" | grep -q "Do you trust"; then
    echo "Detected trust prompt, trying legacy 'y' + Enter..."
    tmux send-keys -t test-permission-fix 'y' Enter
    sleep 2
    echo "Content after 'y' + Enter:"
    tmux capture-pane -t test-permission-fix -p
else
    echo "No permission prompt detected, content:"
    echo "$CONTENT"
fi

# Clean up
tmux kill-session -t test-permission-fix
cd /tmp
rm -rf test-permission-fix

echo "Test completed!"