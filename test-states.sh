#!/bin/bash

echo "Testing different terminal states..."
echo ""

# Test 1: Option dialog
echo "=== TEST 1: OPTION DIALOG ==="
echo "Would you like to delete all temporary files?"
echo "[Y]es  [N]o  [C]ancel"
echo -n "> "
read -n 1 response
echo ""

# Test 2: Open prompt
echo "=== TEST 2: OPEN PROMPT ==="
echo "Enter the name of the file to create:"
echo -n "> "
read filename
echo ""

# Test 3: In progress
echo "=== TEST 3: IN PROGRESS ==="
echo "✶ Processing files..."
for i in {1..5}; do
  echo "Processing file $i of 5..."
  sleep 1
done

echo "Done!"