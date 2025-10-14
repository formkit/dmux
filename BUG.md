# Merge Menu Bug Investigation

## Problem
When selecting "Merge" from the kebab menu (press `m` on a pane), the menu closes but the merge popup does not appear.

## What We've Discovered

### 1. Kebab Menu Works Correctly ✅
- Debug logs show the kebab menu popup IS working
- It correctly detects ENTER key press
- It correctly identifies the selected action as "merge"
- It writes the result to the result file

**Evidence from `/tmp/dmux-kebab-debug.log`:**
```
[2025-10-14T19:45:43.452Z] Input: "", escape: false, return: true
[2025-10-14T19:45:43.453Z] ENTER pressed, selected: merge
```

### 2. Result File Race Condition 🔍
The main app receives `cancelled: true` instead of the merge action.

**Evidence from dmux logs:**
```
15:42:45 [KebabMenu] INFO: Kebab menu result: {"success":false,"cancelled":true}
```

This happens in `src/utils/popup.ts` when the result file doesn't exist:
```typescript
} else {
  // No result file = cancelled
  resolve({
    success: false,
    cancelled: true,
  });
}
```

### 3. The Race Condition
1. Kebab menu popup writes result file and calls `exit()`
2. Popup process closes
3. Main app's `child.on('close')` fires
4. Main app tries to read result file
5. **File doesn't exist yet** (not flushed to disk)
6. Main app returns `cancelled: true`

### 4. Attempted Fix - 100ms Delay
Added a delay before reading the result file:
```typescript
child.on('close', () => {
  setTimeout(() => {
    if (fs.existsSync(resultFile)) {
      // read file...
    } else {
      // Still returns cancelled: true
    }
  }, 100);
});
```

**Status:** Did not fix the issue. File still not found after 100ms delay.

## Possible Causes

### Theory 1: File System Sync Issue
The `fs.writeFileSync()` in the kebab menu popup may not be forcing an immediate disk sync. The file may be buffered.

### Theory 2: Wrong Result File Path
The result file being written might have a different path than what's being read. Need to verify:
- Popup writes to: `process.argv[2]` (passed as first arg)
- Main app reads from: `path.join(os.tmpdir(), 'dmux-popup-${Date.now()}.json')`

### Theory 3: Multiple Result Files
Since `Date.now()` is called twice (once when creating the popup, once when reading), there could be two different timestamps, creating different file paths.

## File Locations

- **Kebab menu popup:** `src/popups/kebabMenuPopup.tsx`
- **Popup launcher:** `src/DmuxApp.tsx` line 485 (`launchKebabMenuPopup`)
- **Result reading:** `src/utils/popup.ts` line 316 (`launchPopupNonBlocking`)
- **Merge popup (not yet working):** `src/popups/mergePopup.tsx`
- **Merge launcher:** `src/DmuxApp.tsx` line 1070 (`launchMergePopup`)

## Debug Logging Added

### In DmuxApp.tsx
- Line 532: Logs full kebab menu result JSON
- Line 537: Logs selected action ID
- Line 541+: Logs merge action execution

### In kebabMenuPopup.tsx
- Logs all inputs to `/tmp/dmux-kebab-debug.log`
- Logs when ENTER is pressed and which action is selected

### In popup.ts
- Line 344: Logs when result file not found

## Next Steps to Investigate

1. **Verify result file path consistency**
   - Log the result file path when creating the popup
   - Log the result file path when reading the result
   - Confirm they match

2. **Check if file is actually written**
   - After kebab menu closes, manually check if result file exists in `/tmp`
   - `ls -la /tmp/dmux-popup-*.json` immediately after closing menu

3. **Try synchronous file check**
   - Instead of setTimeout, try waiting for file to appear with retries
   - Poll for file existence with exponential backoff

4. **Test with explicit fsync**
   - In kebab menu, call `fs.fsyncSync()` after writing result file

5. **Alternative: Use different IPC mechanism**
   - Instead of temp files, use stdin/stdout communication
   - Or use a named pipe
   - Or use process exit code + stderr for data

## Code Changes Made

1. Added `await` to action execution in kebab menu handler (line 539)
2. Created `src/popups/mergePopup.tsx` - comprehensive merge workflow UI
3. Added `launchMergePopup()` function in `DmuxApp.tsx`
4. Added extensive logging to track the issue
5. Added 100ms delay in `popup.ts` before reading result file (didn't fix issue)

## Current Status

❌ **Bug still present** - Merge menu selection not working
✅ Identified root cause - result file not being read
🔍 Need to determine why file doesn't exist when being read
