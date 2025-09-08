# Backspace Test Case

## Current Issue
Backspace is deleting FORWARD (like delete key) instead of BACKWARD

## Test Case
1. Type: "hello" 
2. Press Enter (creates newline)
3. Type: "world"
4. Press Left Arrow 2 times (cursor should be between 'r' and 'l' in "world")
5. Press Backspace 2 times

## Expected Result
```
hello
wld
```
(The 'o' and 'r' from "world" should be deleted)

## What's Actually Happening
Backspace is deleting forward, so it's deleting 'l' and 'd' instead

## Testing Method
- Use tmux session to test dmux
- Capture pane output to verify behavior
- The cursor position after left arrow 2x should be: wor|ld
- After backspace 1x: wo|ld (deleted 'r')
- After backspace 2x: w|ld (deleted 'o')

## Files to Check
- Current implementation: CleanTextInput.tsx
- The backspace handler at line ~56