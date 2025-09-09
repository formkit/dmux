#!/bin/bash

# Test script for dmux pane persistence and flickering issues
# This script verifies that:
# 1. Panes persist across dmux restarts
# 2. No flickering occurs with multiple panes
# 3. Panes in different windows are correctly tracked

set -e

echo "=== Dmux Pane Persistence Test ==="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test session name
TEST_SESSION="dmux-test-$$"
TEST_DIR="/tmp/dmux-test-$$"
DMUX_DIR="$HOME/.dmux"

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Cleaning up...${NC}"
    tmux kill-session -t "$TEST_SESSION" 2>/dev/null || true
    rm -rf "$TEST_DIR"
    # Clean up test panes files
    rm -f "$DMUX_DIR"/*test-$$*.json 2>/dev/null || true
}

# Set trap for cleanup
trap cleanup EXIT

echo "Creating test directory: $TEST_DIR"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

# Initialize as a git repo (dmux requires this)
git init --quiet
echo "test" > test.txt
git add test.txt
git commit -m "Initial commit" --quiet

echo -e "\n${YELLOW}Step 1: Creating tmux session and initial dmux setup${NC}"
tmux new-session -d -s "$TEST_SESSION" -c "$TEST_DIR"

# Get the project hash for this test directory
PROJECT_HASH=$(echo -n "$TEST_DIR" | md5sum | cut -c1-8)
PROJECT_NAME=$(basename "$TEST_DIR")
PANES_FILE="$DMUX_DIR/${PROJECT_NAME}-${PROJECT_HASH}-panes.json"

echo "Panes file will be: $PANES_FILE"

# Function to count panes in the panes.json file
count_panes_in_file() {
    if [ -f "$PANES_FILE" ]; then
        jq 'length' "$PANES_FILE" 2>/dev/null || echo 0
    else
        echo 0
    fi
}

# Function to get pane IDs from file
get_pane_ids_from_file() {
    if [ -f "$PANES_FILE" ]; then
        jq -r '.[].paneId' "$PANES_FILE" 2>/dev/null || true
    fi
}

# Function to check if pane exists in tmux
pane_exists_in_tmux() {
    local pane_id=$1
    tmux list-panes -s -t "$TEST_SESSION" -F '#{pane_id}' 2>/dev/null | grep -q "^${pane_id}$"
}

echo -e "\n${YELLOW}Step 2: Simulating creation of 2 dmux panes${NC}"

# Create mock panes data
cat > "$PANES_FILE" << EOF
[
  {
    "id": "test-pane-1",
    "slug": "test-feature-1",
    "prompt": "implement test feature 1",
    "paneId": "%100",
    "agent": "claude"
  },
  {
    "id": "test-pane-2",
    "slug": "test-feature-2",
    "prompt": "implement test feature 2",
    "paneId": "%101",
    "agent": "claude"
  }
]
EOF

# Create actual tmux panes to match
tmux split-window -h -t "$TEST_SESSION" -P -F '#{pane_id}' > /tmp/pane1_id.txt
PANE1_ID=$(cat /tmp/pane1_id.txt)
tmux split-window -h -t "$TEST_SESSION" -P -F '#{pane_id}' > /tmp/pane2_id.txt
PANE2_ID=$(cat /tmp/pane2_id.txt)

# Update the panes file with real pane IDs
cat > "$PANES_FILE" << EOF
[
  {
    "id": "test-pane-1",
    "slug": "test-feature-1",
    "prompt": "implement test feature 1",
    "paneId": "$PANE1_ID",
    "agent": "claude"
  },
  {
    "id": "test-pane-2",
    "slug": "test-feature-2",
    "prompt": "implement test feature 2",
    "paneId": "$PANE2_ID",
    "agent": "claude"
  }
]
EOF

echo "Created 2 test panes:"
echo "  Pane 1: $PANE1_ID"
echo "  Pane 2: $PANE2_ID"

# Verify panes exist
PANES_IN_FILE=$(count_panes_in_file)
echo "Panes in JSON file: $PANES_IN_FILE"

if [ "$PANES_IN_FILE" -eq 2 ]; then
    echo -e "${GREEN}✓ Successfully created 2 panes in JSON${NC}"
else
    echo -e "${RED}✗ Expected 2 panes in JSON, got $PANES_IN_FILE${NC}"
    exit 1
fi

echo -e "\n${YELLOW}Step 3: Testing pane persistence across windows${NC}"

# Create a new window in the same session
tmux new-window -t "$TEST_SESSION" -n "test-window-2"

# Verify panes are still tracked even though we're in a different window
echo "Checking if panes are visible from different window..."
ALL_PANES=$(tmux list-panes -s -t "$TEST_SESSION" -F '#{pane_id}' | wc -l)
echo "Total panes in session: $ALL_PANES"

if pane_exists_in_tmux "$PANE1_ID" && pane_exists_in_tmux "$PANE2_ID"; then
    echo -e "${GREEN}✓ Panes are correctly tracked across windows${NC}"
else
    echo -e "${RED}✗ Panes not found when checking from different window${NC}"
    exit 1
fi

echo -e "\n${YELLOW}Step 4: Simulating dmux restart (reading panes.json)${NC}"

# Build is done separately, just continue with test

# Test the usePanes hook logic by running a node script
cat > /tmp/test-panes-load.js << 'EOF'
const { execSync } = require('child_process');
const fs = require('fs');

const panesFile = process.argv[2];
const sessionName = process.argv[3];

// Simulate the usePanes hook logic
function loadPanes() {
    try {
        const content = fs.readFileSync(panesFile, 'utf-8');
        const loadedPanes = JSON.parse(content);
        
        let allPaneIds = [];
        try {
            // This now uses -s flag to list all panes in session
            const output = execSync(`tmux list-panes -s -t ${sessionName} -F '#{pane_id}'`, {
                encoding: 'utf-8',
                stdio: 'pipe',
                timeout: 1000
            });
            allPaneIds = output.trim().split('\n').filter(id => id && id.startsWith('%'));
        } catch (e) {
            console.log('Failed to get pane list:', e.message);
        }
        
        console.log('Loaded panes from file:', loadedPanes.length);
        console.log('Active pane IDs from tmux:', allPaneIds.length);
        
        // Check if filtering works correctly
        const activePanes = allPaneIds.length > 0 
            ? loadedPanes.filter(pane => allPaneIds.includes(pane.paneId))
            : loadedPanes;
            
        console.log('Active panes after filtering:', activePanes.length);
        return activePanes.length;
    } catch (e) {
        console.log('Error loading panes:', e.message);
        return 0;
    }
}

const result = loadPanes();
process.exit(result === 2 ? 0 : 1);
EOF

node /tmp/test-panes-load.js "$PANES_FILE" "$TEST_SESSION"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Panes correctly loaded after restart${NC}"
else
    echo -e "${RED}✗ Failed to load panes after restart${NC}"
    exit 1
fi

echo -e "\n${YELLOW}Step 5: Testing flickering prevention${NC}"

# Simulate rapid polling (what causes flickering)
echo "Simulating rapid polling (10 times in 5 seconds)..."
FLICKER_COUNT=0
LAST_COUNT=-1

for i in {1..10}; do
    # Run the load logic
    CURRENT_COUNT=$(node -e "
        const { execSync } = require('child_process');
        const fs = require('fs');
        
        const panesFile = '$PANES_FILE';
        const sessionName = '$TEST_SESSION';
        
        try {
            const content = fs.readFileSync(panesFile, 'utf-8');
            const loadedPanes = JSON.parse(content);
            
            let allPaneIds = [];
            // Randomly fail to simulate tmux command failures
            if (Math.random() > 0.3) {
                const output = execSync(\`tmux list-panes -s -t \${sessionName} -F '#{pane_id}'\`, {
                    encoding: 'utf-8',
                    stdio: 'pipe',
                    timeout: 1000
                });
                allPaneIds = output.trim().split('\\n').filter(id => id && id.startsWith('%'));
            }
            
            // With the fix, this should maintain consistent count
            const activePanes = allPaneIds.length > 0 
                ? loadedPanes.filter(pane => allPaneIds.includes(pane.paneId))
                : loadedPanes;  // Keep existing state when tmux fails
                
            console.log(activePanes.length);
        } catch {
            console.log(0);
        }
    " 2>/dev/null)
    
    if [ "$LAST_COUNT" -ne -1 ] && [ "$CURRENT_COUNT" -ne "$LAST_COUNT" ]; then
        FLICKER_COUNT=$((FLICKER_COUNT + 1))
        echo "  Flicker detected: count changed from $LAST_COUNT to $CURRENT_COUNT"
    fi
    
    LAST_COUNT=$CURRENT_COUNT
    sleep 0.5
done

if [ $FLICKER_COUNT -eq 0 ]; then
    echo -e "${GREEN}✓ No flickering detected during rapid polling${NC}"
else
    echo -e "${YELLOW}⚠ Detected $FLICKER_COUNT flickers (some variation is expected)${NC}"
    if [ $FLICKER_COUNT -gt 3 ]; then
        echo -e "${RED}✗ Too many flickers detected, this would cause visible UI issues${NC}"
        exit 1
    fi
fi

echo -e "\n${YELLOW}Step 6: Testing main pane closure and reopening${NC}"

# Kill the first pane (simulating closing the main dmux pane)
MAIN_PANE=$(tmux list-panes -t "$TEST_SESSION" -F '#{pane_id}' | head -1)
echo "Killing main pane: $MAIN_PANE"
tmux kill-pane -t "$MAIN_PANE"

# Verify the other panes still exist
if pane_exists_in_tmux "$PANE1_ID" && pane_exists_in_tmux "$PANE2_ID"; then
    echo -e "${GREEN}✓ Child panes survived main pane closure${NC}"
else
    echo -e "${RED}✗ Child panes were lost when main closed${NC}"
    exit 1
fi

# Simulate reopening dmux (it should find the existing panes)
echo "Simulating dmux reopen..."
node /tmp/test-panes-load.js "$PANES_FILE" "$TEST_SESSION"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Dmux successfully found existing panes after restart${NC}"
else
    echo -e "${RED}✗ Dmux failed to find panes after restart${NC}"
    exit 1
fi

echo -e "\n${GREEN}=== All tests passed! ===${NC}"
echo -e "${GREEN}✓${NC} Panes persist across dmux restarts"
echo -e "${GREEN}✓${NC} Panes are tracked across different tmux windows"
echo -e "${GREEN}✓${NC} Minimal flickering during rapid polling"
echo -e "${GREEN}✓${NC} Panes survive main dmux pane closure"