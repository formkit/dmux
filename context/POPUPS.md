# Popup Refactoring Plan - Complete Boilerplate Elimination

## Current State

dmux has **13 popup files** with massive code duplication:

```
src/popups/
├── agentChoicePopup.tsx      (~130 lines)
├── choicePopup.tsx            (~146 lines)
├── confirmPopup.tsx           (~150 lines)
├── hooksPopup.tsx             (~130 lines)
├── inputPopup.tsx             (~120 lines)
├── kebabMenuPopup.tsx         (~111 lines)
├── logsPopup.tsx              (~434 lines - complex)
├── mergePopup.tsx             (~482 lines - complex)
├── newPanePopup.tsx           (~67 lines - REFACTORED ✅)
├── progressPopup.tsx          (~? lines)
├── remotePopup.tsx            (~203 lines)
├── settingsPopup.tsx          (~311 lines - complex)
└── shortcutsPopup.tsx         (~95 lines)
```

### Problems

**Every popup repeats 20-30 lines of boilerplate:**

```typescript
// ❌ REPEATED IN EVERY POPUP:
interface PopupResult {
  success: boolean;
  data?: T;
  cancelled?: boolean;
}

const { exit } = useApp();

useInput((input, key) => {
  if (key.escape) {
    const result: PopupResult = {
      success: false,
      cancelled: true,
    };
    fs.writeFileSync(resultFile, JSON.stringify(result));
    exit();
  }
});

const handleSuccess = (data) => {
  const result: PopupResult = {
    success: true,
    data,
  };
  fs.writeFileSync(resultFile, JSON.stringify(result));
  exit();
};
```

**Additional issues:**
1. Many popups don't use `PopupContainer` (still using raw `Box` with manual padding)
2. Inconsistent footer text (some use `PopupFooters`, others hardcode)
3. ESC handling duplicated in every file
4. Result writing duplicated in every file

## Solution: Shared Infrastructure

We've created (but not fully deployed):

### 1. PopupWrapper Component ✅
**Location**: `src/popups/components/PopupWrapper.tsx`

Handles:
- ESC key cancellation
- Result file writing
- Exit logic
- Common lifecycle

### 2. Helper Functions ✅
```typescript
writeSuccessAndExit(resultFile, data, exit)
writeErrorAndExit(resultFile, error, exit)
writeCancelAndExit(resultFile, exit)
```

### 3. Layout Components ✅
- `PopupContainer` - Consistent padding, title, footer
- `PopupInputBox` - Themed input borders
- `PopupFooters` - Standard footer text

### 4. Theme Config ✅
- `POPUP_CONFIG` - Colors, dimensions, spacing
- `TMUX_COLORS` integration

## Implementation Plan

### Phase 1: Refactor Simple Popups (High Priority)

Each popup should follow this pattern:

**BEFORE** (~120 lines with boilerplate):
```typescript
import React, { useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import * as fs from 'fs';

interface PopupResult {
  success: boolean;
  data?: string;
  cancelled?: boolean;
}

const MyPopup: React.FC<{ resultFile: string }> = ({ resultFile }) => {
  const [value, setValue] = useState('');
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.escape) {
      const result: PopupResult = {
        success: false,
        cancelled: true,
      };
      fs.writeFileSync(resultFile, JSON.stringify(result));
      exit();
    }
  });

  const handleSubmit = (data: string) => {
    const result: PopupResult = {
      success: true,
      data,
    };
    fs.writeFileSync(resultFile, JSON.stringify(result));
    exit();
  };

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box marginBottom={1}>
        <Text>Enter value:</Text>
      </Box>
      <Box marginBottom={1} borderStyle="bold" borderColor="yellow" paddingX={1}>
        <TextInput value={value} onChange={setValue} onSubmit={handleSubmit} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Enter to submit • ESC to cancel</Text>
      </Box>
    </Box>
  );
};
```

**AFTER** (~40 lines, 66% reduction):
```typescript
import React, { useState } from 'react';
import { render, useApp } from 'ink';
import { PopupWrapper, PopupContainer, PopupInputBox, writeSuccessAndExit } from './components/index.js';
import { PopupFooters } from './config.js';

const MyPopup: React.FC<{ resultFile: string }> = ({ resultFile }) => {
  const [value, setValue] = useState('');
  const { exit } = useApp();

  return (
    <PopupWrapper resultFile={resultFile}>
      <PopupContainer footer={PopupFooters.input()}>
        <Text>Enter value:</Text>
        <PopupInputBox>
          <TextInput
            value={value}
            onChange={setValue}
            onSubmit={(v) => writeSuccessAndExit(resultFile, v, exit)}
          />
        </PopupInputBox>
      </PopupContainer>
    </PopupWrapper>
  );
};
```

### Popup-by-Popup Migration Checklist

#### Completed ✅
- [x] **newPanePopup.tsx** - Fully refactored with PopupWrapper

#### Simple Popups - Ready for Full Refactor
- [ ] **inputPopup.tsx** - Generic input (used by actions)
  - Current: 120 lines
  - Target: ~40 lines
  - Pattern: Input + submit

- [ ] **confirmPopup.tsx** - Yes/No dialogs
  - Current: 150 lines
  - Target: ~50 lines
  - Pattern: Choice between 2 options

- [ ] **choicePopup.tsx** - Multi-option selection
  - Current: 146 lines
  - Target: ~60 lines
  - Pattern: List + selection

- [ ] **agentChoicePopup.tsx** - Agent selection
  - Current: 130 lines
  - Target: ~50 lines
  - Pattern: List + selection (simplified)

- [ ] **kebabMenuPopup.tsx** - Action menu
  - Current: 111 lines
  - Target: ~40 lines
  - Pattern: List + selection

- [ ] **shortcutsPopup.tsx** - Keyboard shortcuts display
  - Current: 95 lines
  - Target: ~40 lines
  - Pattern: Read-only list

- [ ] **hooksPopup.tsx** - Hooks editor
  - Current: 130 lines
  - Target: ~60 lines
  - Pattern: List + action selection

#### Complex Popups - Partial Refactor (Keep Custom Logic)
- [ ] **mergePopup.tsx** - Multi-step merge workflow
  - Current: 482 lines
  - Target: ~420 lines (remove 62 lines of boilerplate)
  - Keep: Multi-step state machine
  - Remove: ESC/result boilerplate

- [ ] **settingsPopup.tsx** - Multi-mode settings editor
  - Current: 311 lines
  - Target: ~260 lines (remove 51 lines)
  - Keep: Mode switching logic
  - Remove: ESC/result boilerplate

- [ ] **logsPopup.tsx** - Scrolling logs viewer
  - Current: 434 lines
  - Target: ~380 lines (remove 54 lines)
  - Keep: Scrolling/filtering logic
  - Remove: ESC/result boilerplate

- [ ] **remotePopup.tsx** - Remote tunnel UI
  - Current: 203 lines
  - Target: ~170 lines (remove 33 lines)
  - Keep: Tunnel status/QR code logic
  - Remove: ESC/result boilerplate

- [ ] **progressPopup.tsx** - Progress indicator
  - Status: TBD (need to check implementation)

### Phase 2: Fix Tmux Background Colors

**Current Issue**: The tmux `-s` flag for popup background is not being applied correctly.

**Investigation needed**:
1. Verify the generated tmux command includes `-s 'bg=colour232,border-fg=colour214'`
2. Check if tmux version supports these style flags
3. Test manual tmux command: `tmux display-popup -s 'bg=colour232,border-fg=colour214' echo test`

**Files to check**:
- `src/utils/popup.ts` (lines 138, 292, 446) - All three popup launch functions

### Phase 3: Testing

For each refactored popup:
1. ✅ Builds without TypeScript errors
2. ⏳ Launches correctly in tmux
3. ⏳ Orange borders display (both tmux and Ink)
4. ⏳ Dark background displays
5. ⏳ ESC cancellation works
6. ⏳ Submit/success works
7. ⏳ Data returned correctly

## Migration Script Template

For each simple popup, follow this process:

```bash
# 1. Check current line count
wc -l src/popups/POPUP_NAME.tsx

# 2. Add imports
# Add: PopupWrapper, writeSuccessAndExit, PopupContainer, PopupFooters

# 3. Remove boilerplate
# Delete: PopupResult interface
# Delete: useInput ESC handler
# Delete: Manual fs.writeFileSync calls

# 4. Wrap component
# Add: <PopupWrapper resultFile={resultFile}>
# Replace: Manual Box with <PopupContainer footer={PopupFooters.XXX()}>

# 5. Simplify handlers
# Replace: Manual result writing with writeSuccessAndExit()

# 6. Build and test
pnpm build
./dmux  # Test the popup
```

## Expected Outcomes

### Code Reduction
- **Simple popups**: 60-70% reduction (120 lines → 40 lines)
- **Complex popups**: 10-15% reduction (retain custom logic)
- **Total**: ~800 lines eliminated across all popups

### Benefits
1. **DRY**: ESC handling in one place
2. **Consistency**: All popups behave identically
3. **Maintainability**: Fix bugs once, applies to all
4. **Type Safety**: Shared PopupResult type
5. **Readability**: Business logic visible, not buried in boilerplate

## Files Created

### Foundation (Complete ✅)
- `src/popups/config.ts` - Theme configuration
- `src/popups/components/PopupContainer.tsx` - Layout wrapper
- `src/popups/components/PopupInputBox.tsx` - Input wrapper
- `src/popups/components/PopupWrapper.tsx` - Lifecycle wrapper ✅ NEW
- `src/popups/components/index.ts` - Barrel export

### Templates (In Progress 🚧)
- `src/popups/templates/SimpleInputPopup.tsx` - Template for input popups

## Next Actions

1. **Immediate**: Refactor all simple popups using the template above
2. **After simple popups**: Add PopupWrapper to complex popups (keep their custom logic)
3. **Fix**: Debug tmux background color issue
4. **Test**: Visual testing in tmux for all refactored popups
5. **Document**: Update CLAUDE.md with new popup creation pattern

## Notes

- **Why separate files?** Each popup must be a separate Node process (tmux limitation)
- **Why not more templates?** The 13 popups have very different data needs - templates would just be abstraction overhead
- **Focus**: Eliminate boilerplate, not file count
