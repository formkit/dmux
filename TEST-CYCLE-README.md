# Terminal Streaming Test Cycle

This document explains how to test and debug terminal streaming/patching issues.

## Test Infrastructure

### Components

1. **Test Logger** (`streaming-test-pane` worktree)
   - Ink app that simulates dynamic terminal updates
   - Updates status bar, scrolling logs, and fixed prompt areas
   - Located: `/Users/justinschroeder/Projects/dmux/.dmux/worktrees/http-rest-server/.dmux/worktrees/streaming-test-pane/test-stream-logger.tsx`

2. **Playwright Capture** (`test-stream-capture.ts`)
   - Opens browser to stream URL
   - Captures screenshots every 500ms
   - Logs browser console errors
   - Saves to `./test-output/`

3. **Start Script** (`start-test-logger.sh`)
   - Sends commands to streaming-test-pane to run the test logger
   - Reads pane ID from dmux config

## Test Cycle Workflow

### Step 1: Build dmux with changes

```bash
cd /Users/justinschroeder/Projects/dmux/.dmux/worktrees/http-rest-server
npm run build
```

### Step 2: Restart dmux server

Kill any existing dmux process and restart it. The server will pick up the newly built code.

```bash
# Find and kill dmux process (if running)
pkill -f "node.*dmux"

# Start dmux (in the main pane)
/Users/justinschroeder/Projects/dmux/main/dmux
```

### Step 3: Start test logger in streaming-test-pane

```bash
./start-test-logger.sh
```

This will:
- Find the streaming-test-pane pane ID
- Send commands to start the test logger
- The test logger will begin outputting dynamic content

### Step 4: Capture browser output with Playwright

```bash
npx tsx test-stream-capture.ts streaming-test-pane
```

This will:
- Open browser (visible, not headless)
- Navigate to the stream URL
- Capture screenshots every 500ms for 30 seconds
- Log all console output
- Save screenshots to `./test-output/`

### Step 5: Analyze results

1. **Compare Screenshots to Terminal**
   - Look at `./test-output/screenshot-*.png`
   - Compare to actual streaming-test-pane in tmux
   - Identify discrepancies

2. **Review Console Logs**
   - Backend logs in terminal where dmux is running
   - Frontend logs shown by playwright script
   - Look for patterns:
     - `[PATCH OUT]` - Backend sending patch
     - `[PATCH IN]` - Frontend receiving patch
     - `[CSI X]` - Cursor movement commands
     - `[PATCH DONE]` - Final cursor position

3. **Identify Issues**
   - Characters appearing in wrong positions
   - Missing content
   - Cursor position mismatches
   - Incomplete ANSI sequences (look for literal "B", etc.)

### Step 6: Fix Issues

Based on analysis, fix issues in:
- `src/services/TerminalStreamer.ts` - Backend buffering/streaming
- `src/server/static.ts` - Frontend ANSI parsing

### Step 7: Repeat

Go back to Step 1 and repeat until output matches perfectly.

## Debug Log Format

### Backend Logs

```
[PATCH OUT] pane=streaming-test-pane cursor=(10,5) len=256
[PATCH OUT] first100: \x1b[10;5H\x1b[32mLog line 1\x1b[0m\r\n
[PATCH OUT] last100: ...more content...\r\n
```

### Frontend Logs

```
[PATCH IN] cursor=(10,5) changes=1
[PATCH IN] change[0] len=256 first50: \x1b[10;5H\x1b[32mLog line...
[CSI H] (0,0) -> (9,4)     // Cursor positioning (note: 0-indexed in frontend)
[CSI B] down 1 (9,4) -> (10,4)
[PATCH DONE] final cursor=(10,5)
```

## Known Issues to Watch For

1. **Cursor position off-by-one**: Check if row/column indexing is consistent (0-based vs 1-based)
2. **Incomplete ANSI sequences**: Look for literal "B", "H", etc. in rendered output
3. **Lost content**: Content from patches not appearing at all
4. **Wrong position**: Content appearing in wrong part of screen
5. **Cursor jumps**: Cursor moving to unexpected positions

## Tips

- The test logger uses Ink, which generates complex cursor movements
- Focus on cursor positioning commands (H, A, B) - these are most critical
- Check that `window.cursorRow/Col` stay in bounds (0 to height-1/width-1)
- Verify that incomplete ANSI sequences are buffered (backend) and not processed (frontend)
- Use browser DevTools to inspect the actual DOM structure

## Quick Commands Reference

```bash
# Build
npm run build

# Start test logger (sends keys to streaming-test-pane)
./start-test-logger.sh

# Capture with Playwright
npx tsx test-stream-capture.ts streaming-test-pane

# View screenshots
open test-output/

# Clear test output
rm -rf test-output/
```