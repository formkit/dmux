#!/bin/bash

# Test script for POST /api/panes endpoint
# This demonstrates how to create a new pane via the API

# Function to find dmux server port
find_server_port() {
  local config_file="$HOME/.dmux/dmux-dmux-panes.json"
  if [ -f "$config_file" ]; then
    # Try to extract port from running dmux instance
    # Port auto-selects, typically starts at 3000
    for port in {3000..3010}; do
      if curl -s "http://127.0.0.1:$port/api/health" &>/dev/null; then
        echo "$port"
        return 0
      fi
    done
  fi
  echo "3000"  # Default fallback
}

PORT=$(find_server_port)
BASE_URL="http://127.0.0.1:$PORT"

echo "Testing POST /api/panes endpoint on port $PORT"
echo "============================================="
echo ""

# Test 1: Health check
echo "1. Checking server health..."
health=$(curl -s "$BASE_URL/api/health")
if [ $? -eq 0 ]; then
  echo "✓ Server is running"
  echo "  Response: $health"
else
  echo "✗ Server is not running on port $PORT"
  echo "  Please start dmux first to enable the API"
  exit 1
fi
echo ""

# Test 2: Create pane with prompt only (will need agent choice if multiple available)
echo "2. Creating pane with prompt only..."
response=$(curl -s -X POST "$BASE_URL/api/panes" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write a hello world function in TypeScript"
  }')
echo "  Response: $response"
echo ""

# Test 3: Create pane with explicit agent (claude)
echo "3. Creating pane with Claude agent..."
response=$(curl -s -X POST "$BASE_URL/api/panes" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Add tests for the new feature",
    "agent": "claude"
  }')
echo "  Response: $response"
echo ""

# Test 4: Create pane with explicit agent (opencode)
echo "4. Creating pane with opencode agent..."
response=$(curl -s -X POST "$BASE_URL/api/panes" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Refactor the main component",
    "agent": "opencode"
  }')
echo "  Response: $response"
echo ""

# Test 5: Invalid request (missing prompt)
echo "5. Testing error handling (missing prompt)..."
response=$(curl -s -X POST "$BASE_URL/api/panes" \
  -H "Content-Type: application/json" \
  -d '{}')
echo "  Response: $response"
echo ""

# Test 6: Invalid request (invalid agent)
echo "6. Testing error handling (invalid agent)..."
response=$(curl -s -X POST "$BASE_URL/api/panes" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Test prompt",
    "agent": "invalid-agent"
  }')
echo "  Response: $response"
echo ""

# Test 7: List all panes
echo "7. Listing all panes after creation..."
response=$(curl -s "$BASE_URL/api/panes")
echo "  Response: $response"
echo ""

echo "============================================="
echo "Testing complete!"
echo ""
echo "Usage in your own code:"
echo "  curl -X POST http://127.0.0.1:$PORT/api/panes \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"prompt\": \"Your prompt here\", \"agent\": \"claude\"}'"
