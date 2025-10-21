# Layout System Refactor Plan

## Table of Contents
1. [Current State Analysis](#current-state-analysis)
2. [Problems with Current Approach](#problems-with-current-approach)
3. [Desired Layout Behavior](#desired-layout-behavior)
4. [Implementation Plan](#implementation-plan)
5. [Testing Scenarios](#testing-scenarios)

---

## Current State Analysis

### Scattered Layout Operations

Layout logic is currently **spread across 9+ files** with inconsistent approaches:

#### 1. **src/index.ts**
- **Line 148**: `const SIDEBAR_WIDTH = 40` (duplicate definition)
- **Line 165**: Initial sidebar resize: `tmux resize-pane -t '${controlPaneId}' -x ${SIDEBAR_WIDTH}`
- **Problem**: Only resizes sidebar, doesn't set window max-width

#### 2. **src/utils/paneCreation.ts**
- **Line 112**: `const SIDEBAR_WIDTH = 40` (duplicate definition)
- **Line 155**: First pane: `setupSidebarLayout(controlPaneId)`
- **Lines 160-174**: Subsequent panes: alternating split logic
  ```typescript
  const splitDirection = dmuxPaneIds.length % 2 === 1 ? '-h' : '-v';
  tmux split-window ${splitDirection} -t '${targetPane}' -P -F '#{pane_id}'
  ```
- **Line 190**: `enforceControlPaneSize(controlPaneId, SIDEBAR_WIDTH)`
- **Problem**: Alternating splits create unbalanced layouts; enforcement happens **after** split (visual flicker)

#### 3. **src/utils/tmux.ts** (Main Layout Logic)
- **Lines 6-9**: Layout constants
  ```typescript
  export const SIDEBAR_WIDTH = 40;
  export const MIN_COMFORTABLE_WIDTH = 60;
  export const MAX_COMFORTABLE_WIDTH = 120;
  export const MIN_COMFORTABLE_HEIGHT = 15;
  ```
- **Line 99**: `setupSidebarLayout()` - splits horizontally from control pane
- **Line 127**: `generateSidebarGridLayout()` - custom layout string generator (249 lines)
- **Line 258**: `calculateOptimalColumns()` - determines column count based on dimensions
- **Line 315**: `enforceControlPaneSize()` - **THE MAIN LAYOUT FUNCTION** (113 lines)
  - **1 pane** (line 334): `main-vertical`
  - **2 panes** (lines 337-363): Decision based on width
    - Narrow: `main-vertical`
    - Wide: `even-horizontal` + manual resize
    - Comfortable: `main-vertical`
  - **3+ panes** (lines 365-409): `calculateOptimalColumns()` → custom layout string

#### 4. **src/utils/welcomePane.ts**
- **Line 19**: Creates welcome pane: `tmux split-window -h -t '${controlPaneId}'`
- **Problem**: Doesn't coordinate with layout system

#### 5. **src/utils/conflictResolutionPane.ts**
- **Line 50**: Creates conflict pane: `tmux split-window -h -P -F '#{pane_id}'`
- **Line 67**: `const SIDEBAR_WIDTH = 40` (duplicate definition)
- **Line 70**: `enforceControlPaneSize(controlPaneId, SIDEBAR_WIDTH)`
- **Problem**: Another ad-hoc pane creation without layout coordination

#### 6. **src/hooks/usePanes.ts**
- **Line 117**: Restores missing panes: `tmux split-window -h -P -F '#{pane_id}'`
- **Line 145**: `tmux select-layout even-horizontal` (ad-hoc layout fix)
- **Problem**: Bypasses layout system entirely

#### 7. **src/hooks/usePaneRunner.ts**
- **Line 139**: `const SIDEBAR_WIDTH = 40` (duplicate definition)
- **Line 142**: `enforceControlPaneSize(controlPaneId, SIDEBAR_WIDTH)`

#### 8. **src/hooks/useWorktreeActions.ts**
- **Line 36**: `const SIDEBAR_WIDTH = 40` (duplicate definition)
- **Line 39**: `enforceControlPaneSize(controlPaneId, SIDEBAR_WIDTH)`

#### 9. **src/DmuxApp.tsx**
- **Lines 1431, 1465, 1568, 2219**: Multiple `enforceControlPaneSize()` calls
- **Line 1550**: Debug dialog creates pane: `tmux split-window -h -P -F '#{pane_id}'`
- **Problem**: Reactive layout enforcement, not proactive

### Key Problems Summary

1. **SIDEBAR_WIDTH duplicated in 6 files** - inconsistency risk
2. **No centralized layout manager** - each file does its own thing
3. **No window max-width control** - window always fills terminal width
4. **Alternating split logic is naive** - creates unbalanced grids
5. **enforceControlPaneSize() called reactively** - causes visual flicker
6. **Welcome pane has no special layout handling** - should allow unlimited width
7. **No resize detection** - layout never adapts to terminal dimension changes

---

## Problems with Current Approach

### 1. Startup Flash
When dmux starts, the sidebar is initially full-width until first `resize-pane` command executes:
```
Initial:                    After 100ms:
┌───────────────────────┐   ┌──────────┬────────────┐
│  dmux (full width)    │   │  dmux    │  Welcome   │
│                       │ → │  (40)    │            │
└───────────────────────┘   └──────────┴────────────┘
```

### 2. Post-Split Layout Flicker
Panes are created with alternating splits, then `enforceControlPaneSize()` moves them:
```
After split-window:         After enforceControlPaneSize():
┌──────────┬──────────┐     ┌──────────┬─────────┬─────────┐
│  dmux    │  Pane 1  │     │  dmux    │ Pane 1  │ Pane 2  │
│  (50)    ├──────────┤ →   │  (40)    ├─────────┴─────────┤
│          │  Pane 2  │     │          │      Pane 3        │
└──────────┴──────────┘     └──────────┴────────────────────┘
```

### 3. No Width Constraints
dmux window always spans full terminal width, even when content doesn't need it:
```
Terminal = 300 cols, 3 panes:
┌──────────┬──────────────────────────────────────────────────┐
│  dmux    │            Content (260 cols)                    │
│  (40)    │   Panes are too wide for comfortable reading     │
└──────────┴──────────────────────────────────────────────────┘

Desired (with max-width constraint using MAX_COMFORTABLE_WIDTH = 120):
┌──────────┬────────────────────┬────────────────────┬────────────────────┐                       │
│  dmux    │      Pane 1        │      Pane 2        │      Pane 3        │   Empty space (right) │
│  (40)    │      (120)         │      (120)         │      (120)         │                       │
└──────────┴────────────────────┴────────────────────┴────────────────────┘                       │

Window max-width = 40 + 120*3 + 2 = 402 (but terminal is only 300, so uses 300)
Result: Panes are actually 86 cols each (see Phase 4)
```

### 4. Uneven Pane Distribution
Current custom layout string distributes panes left-to-right, top-to-bottom:
```
5 panes, 3 columns:
┌──────────┬────────┬────────┬────────┐
│  dmux    │ Pane 1 │ Pane 2 │ Pane 3 │
│  (40)    ├────────┼────────┼────────┤
│          │ Pane 4 │ Pane 5 │        │
└──────────┴────────┴────────┴────────┘

Desired (span orphan panes):
┌──────────┬────────┬────────┬────────┐
│  dmux    │ Pane 1 │ Pane 2 │ Pane 3 │
│  (40)    ├────────┼────────┤  (full │
│          │ Pane 4 │ Pane 5 │ height)│
└──────────┴────────┴────────┴────────┘
```

---

## Desired Layout Behavior

### Core Principles

1. **Sidebar is always 40 chars** - no startup flash
2. **Window has dynamic max-width** - leaves empty space when terminal is wider than needed
3. **Columns prioritized over rows** - maximize horizontal space usage
4. **Panes span when orphaned** - last column panes use full height
5. **Responsive to terminal resize** - recalculates layout when terminal dimensions change
6. **Centralized layout manager** - single source of truth for all layout decisions

### Layout Phases

#### Phase 0: No Panes (Initial Startup)
```
Terminal width = any
┌──────────┐
│  dmux    │ Empty space
│  (40)    │
└──────────┘
Max Width = 40
```

#### Phase 1: Welcome Pane Only
```
Terminal width = any
┌──────────┬──────────────────────────────────┐
│  dmux    │      Welcome Pane                │
│  (40)    │   (uses all remaining space)     │
└──────────┴──────────────────────────────────┘
Max Width = terminal width (unlimited)
```

#### Phase 2: Single Content Pane
```
Terminal = 300 cols

Available width = 300 - 40 (sidebar) = 260 cols
Ideal pane width = min(260, MAX_COMFORTABLE_WIDTH) = 120
Window max-width = 40 + 120 = 160

┌──────────┬────────────────────┐                            │
│  dmux    │   Content Pane     │   Empty space (140 cols)   │
│  (40)    │      (120)         │                            │
└──────────┴────────────────────┘                            │
Max Width = 160
```

#### Phase 3: Two Content Panes
```
Terminal = 300 cols

Try 2 columns:
  Required width = 40 + 60*2 + 1 (border) = 161 ✓ Fits!
  Available width = 300 - 40 - 1 = 259
  Per-pane width = 259 / 2 = 129.5
  Capped width = min(129.5, 120) = 120

Window max-width = 40 + 120*2 + 1 = 281

┌──────────┬────────────────────┬────────────────────┐       │
│  dmux    │   Pane 1           │   Pane 2           │ Empty │
│  (40)    │   (120)            │   (120)            │       │
└──────────┴────────────────────┴────────────────────┘       │
Max Width = 281
```

#### Phase 4: Three Content Panes (Same Terminal Size)
```
Terminal = 300 cols (keeping consistent with Phase 3)

Try 3 columns:
  Required width = 40 + 60*3 + 2 = 222 ✓ Fits!
  Available width = 300 - 40 - 2 = 258
  Per-pane width = 258 / 3 = 86

Window max-width = min(40 + 120*3 + 2, 300) = 300 (full terminal)

┌──────────┬───────────────┬───────────────┬───────────────┐
│  dmux    │   Pane 1      │   Pane 2      │   Pane 3      │
│  (40)    │     (86)      │     (86)      │     (86)      │
└──────────┴───────────────┴───────────────┴───────────────┘
Max Width = 300 (NO empty space - all 3 panes as columns, equal width)
```

#### Phase 5: Three Content Panes (Narrow Terminal)
```
Terminal = 200 cols

Try 3 columns:
  Required width = 40 + 60*3 + 2 = 222 ✗ Too wide!

Try 2 columns:
  Required width = 40 + 60*2 + 1 = 161 ✓ Fits!
  Available width = 200 - 40 - 1 = 159
  Per-pane width = 159 / 2 = 79.5

Window max-width = min(40 + 120*2 + 1, 200) = 200

┌──────────┬────────────────┬────────────────┐
│  dmux    │   Pane 1       │   Pane 2       │
│  (40)    │   (79)         ├────────────────┤
│          │                │   Pane 3       │
└──────────┴────────────────┴────────────────┘
Max Width = 200

Note: Panes 1 and 2 share left column (2 rows), Pane 3 is in right column (1 row, full height)
```

#### Phase 6: Five Content Panes with Spanning
```
Terminal = 300 cols

Try 5 columns:
  Required = 40 + 60*5 + 4 = 344 ✗ Too wide!

Try 4 columns:
  Required = 40 + 60*4 + 3 = 283 ✓ Fits!
  Available = 300 - 40 - 3 = 257
  Per-pane width = 257 / 4 = 64

Window max-width = min(40 + 120*4 + 3, 300) = 300 (full terminal)

Distribution: [2, 1, 1, 1] → 2 panes in col 1, 1 each in cols 2-4

┌──────────┬──────────┬──────────┬──────────┬──────────┐
│  dmux    │ Pane 1   │ Pane 2   │ Pane 3   │ Pane 4   │
│  (40)    │  (64)    │  (64)    │  (64)    │  (64)    │
│          ├──────────┤          │          │          │
│          │ Pane 5   │          │          │          │
└──────────┴──────────┴──────────┴──────────┴──────────┘
Max Width = 300 (NO empty space - columns expand to use full terminal width)

Note: Panes 2-4 span full height since they have only 1 pane each
```

#### Phase 7: Terminal Resize (Expand)
```
Initial (Terminal = 200 cols, 5 panes, 2 columns):
┌──────────┬──────────┬──────────┐
│  dmux    │ Pane 1   │ Pane 3   │
│  (40)    │  (79)    │  (79)    │
│          ├──────────┼──────────┤
│          │ Pane 2   │ Pane 4   │
│          ├──────────┴──────────┤
│          │      Pane 5         │
└──────────┴─────────────────────┘

After resize to 350 cols (can fit ALL 5 as individual columns):
Try 5 columns:
  Required = 40 + 60*5 + 4 = 344 ✓ Fits!
  Available = 350 - 40 - 4 = 306
  Per-pane width = 306 / 5 = 61 (barely above MIN 60!)

┌──────────┬──────┬──────┬──────┬──────┬──────┐
│  dmux    │ P1   │ P2   │ P3   │ P4   │ P5   │
│  (40)    │ (61) │ (61) │ (61) │ (61) │ (61) │
└──────────┴──────┴──────┴──────┴──────┴──────┘
Max Width = 350 (NO empty space, NO rows - 5 individual columns)

Trigger: SIGWINCH (terminal resize signal)
Action: Debounce 500ms → recalculateAndApplyLayout()
```

#### Phase 8: Terminal Resize (Shrink)
```
Initial (Terminal = 300 cols, 5 panes, 4 columns from Phase 6):
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│  dmux    │ Pane 1   │ Pane 2   │ Pane 3   │ Pane 4   │
│  (40)    │  (64)    │  (64)    │  (64)    │  (64)    │
│          ├──────────┤          │          │          │
│          │ Pane 5   │          │          │          │
└──────────┴──────────┴──────────┴──────────┴──────────┘

After resize to 180 cols:
Try 4 columns:
  Required = 40 + 60*4 + 3 = 283 ✗ Too wide!
Try 3 columns:
  Required = 40 + 60*3 + 2 = 222 ✗ Still too wide!
Try 2 columns:
  Required = 40 + 60*2 + 1 = 161 ✓ Fits!
  Available = 180 - 40 - 1 = 139
  Per-pane width = 139 / 2 = 69

┌──────────┬──────────┬──────────┐
│  dmux    │ Pane 1   │ Pane 3   │
│  (40)    │  (69)    │  (69)    │
│          ├──────────┼──────────┤
│          │ Pane 2   │ Pane 4   │
│          ├──────────┴──────────┤
│          │      Pane 5         │
└──────────┴─────────────────────┘
Max Width = 180 (columns shrunk to min before creating rows)

Trigger: SIGWINCH
Action: Debounce 500ms → recalculateAndApplyLayout() → reduce from 4 to 2 columns
```

### Layout Calculation Algorithm

**Configurable Layout Constants:**
```typescript
// These should be configurable (via settings or environment)
const SIDEBAR_WIDTH = 40;              // Fixed sidebar width
const MIN_COMFORTABLE_WIDTH = 60;      // Minimum pane width before creating rows
const MAX_COMFORTABLE_WIDTH = 120;     // Maximum pane width (cap for readability)
const MIN_COMFORTABLE_HEIGHT = 15;     // Minimum pane height
```

**Core Algorithm:**
```typescript
function calculateOptimalLayout(
  numContentPanes: number,
  terminalWidth: number,
  terminalHeight: number,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG  // Pass in configurable values
): LayoutConfiguration {
  const {
    SIDEBAR_WIDTH,
    MIN_COMFORTABLE_WIDTH,
    MAX_COMFORTABLE_WIDTH,
    MIN_COMFORTABLE_HEIGHT
  } = config;

  // Special case: welcome pane or no panes
  if (numContentPanes === 0) {
    return {
      cols: 0,
      rows: 0,
      windowWidth: terminalWidth, // Unlimited width for welcome pane
      paneDistribution: [],
      actualPaneWidth: 0
    };
  }

  // Try column counts from max down to 1 (prioritize columns > rows)
  for (let cols = numContentPanes; cols >= 1; cols--) {
    const rows = Math.ceil(numContentPanes / cols);
    const columnBorders = cols - 1;  // Vertical borders between columns
    const rowBorders = rows - 1;     // Horizontal borders between rows

    // Calculate minimum required dimensions (can we fit at MIN width?)
    const minRequiredWidth = SIDEBAR_WIDTH + (cols * MIN_COMFORTABLE_WIDTH) + columnBorders;
    const minRequiredHeight = (rows * MIN_COMFORTABLE_HEIGHT) + rowBorders;

    // Check if this layout fits in terminal at minimum comfortable size
    if (minRequiredWidth <= terminalWidth && minRequiredHeight <= terminalHeight) {
      // This layout fits! Now calculate actual pane dimensions

      // Calculate ideal window max-width (cap each pane at MAX_COMFORTABLE_WIDTH)
      // Window should be: sidebar + (columns * MAX width) + borders OR terminal width, whichever is smaller
      const idealMaxWidth = SIDEBAR_WIDTH + (cols * MAX_COMFORTABLE_WIDTH) + columnBorders;
      const windowWidth = Math.min(idealMaxWidth, terminalWidth);

      // Calculate actual pane width using the constrained windowWidth (not terminalWidth)
      // This ensures panes don't exceed MAX_COMFORTABLE_WIDTH
      const effectiveContentWidth = windowWidth - SIDEBAR_WIDTH - columnBorders;
      const actualPaneWidth = effectiveContentWidth / cols;

      // Calculate pane distribution for spanning (e.g., [2, 1, 1, 1])
      const distribution = distributePanes(numContentPanes, cols);

      return {
        cols,
        rows,
        windowWidth,
        paneDistribution: distribution,
        actualPaneWidth  // The width panes will actually be (between MIN and MAX)
      };
    }
  }

  // Ultimate fallback: single column (forced cramped layout if terminal too small)
  return {
    cols: 1,
    rows: numContentPanes,
    windowWidth: terminalWidth,
    paneDistribution: [numContentPanes],
    actualPaneWidth: terminalWidth - SIDEBAR_WIDTH
  };
}

function distributePanes(numPanes: number, cols: number): number[] {
  // Distribute panes as evenly as possible across columns
  // Examples:
  //   5 panes, 3 cols → [2, 2, 1] (first 2 columns get extra pane)
  //   5 panes, 4 cols → [2, 1, 1, 1] (first column gets extra pane)
  //   6 panes, 3 cols → [2, 2, 2] (perfectly even)
  const distribution: number[] = [];
  const basePerCol = Math.floor(numPanes / cols);
  const remainder = numPanes % cols;

  for (let i = 0; i < cols; i++) {
    // First 'remainder' columns get an extra pane
    distribution.push(basePerCol + (i < remainder ? 1 : 0));
  }

  return distribution;
}

/**
 * Example calculation walkthrough (Terminal = 300 cols, 5 panes):
 *
 * Try 5 columns:
 *   minRequired = 40 + (5 * 60) + 4 = 344 ✗ Too wide
 *
 * Try 4 columns:
 *   minRequired = 40 + (4 * 60) + 3 = 283 ✓ Fits!
 *   idealMaxWidth = 40 + (4 * 120) + 3 = 523
 *   windowWidth = min(523, 300) = 300 (use full terminal)
 *   effectiveContentWidth = 300 - 40 - 3 = 257
 *   actualPaneWidth = 257 / 4 = 64.25 → 64 (between MIN 60 and MAX 120 ✓)
 *   distribution = [2, 1, 1, 1]
 *
 * Result: 4 columns at 64 chars each, window uses full 300 cols
 */
```

---

## Implementation Plan

### Phase 1: Create Centralized Layout Manager

**File**: `src/utils/layoutManager.ts` (NEW)

**Tasks**:
1. Create `LayoutConfiguration` interface
2. Implement `calculateOptimalLayout()` with column prioritization
3. Implement `distributePanes()` for even distribution with spanning
4. Implement `generateLayoutString()` that respects pane distribution
5. Implement `setWindowMaxWidth()` using `tmux resize-window -x`
6. Implement `applyLayout()` that orchestrates all layout operations
7. Export `recalculateAndApplyLayout()` as the **single entry point**

**Code Structure**:
```typescript
// src/utils/layoutManager.ts

/**
 * Configurable layout parameters
 * These can be overridden via settings or environment
 */
export interface LayoutConfig {
  SIDEBAR_WIDTH: number;            // Fixed sidebar width (default: 40)
  MIN_COMFORTABLE_WIDTH: number;    // Min pane width before creating rows (default: 60)
  MAX_COMFORTABLE_WIDTH: number;    // Max pane width for readability (default: 120)
  MIN_COMFORTABLE_HEIGHT: number;   // Min pane height (default: 15)
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  SIDEBAR_WIDTH: 40,
  MIN_COMFORTABLE_WIDTH: 60,
  MAX_COMFORTABLE_WIDTH: 120,
  MIN_COMFORTABLE_HEIGHT: 15
};

// Export individual constants for convenience (allows direct imports)
export const SIDEBAR_WIDTH = DEFAULT_LAYOUT_CONFIG.SIDEBAR_WIDTH;
export const MIN_COMFORTABLE_WIDTH = DEFAULT_LAYOUT_CONFIG.MIN_COMFORTABLE_WIDTH;
export const MAX_COMFORTABLE_WIDTH = DEFAULT_LAYOUT_CONFIG.MAX_COMFORTABLE_WIDTH;
export const MIN_COMFORTABLE_HEIGHT = DEFAULT_LAYOUT_CONFIG.MIN_COMFORTABLE_HEIGHT;

/**
 * Result of layout calculation
 */
export interface LayoutConfiguration {
  cols: number;                // Number of columns (0 for welcome-only)
  rows: number;                // Number of rows
  windowWidth: number;         // Calculated window width (including sidebar)
  paneDistribution: number[];  // Panes per column [2, 2, 1]
  actualPaneWidth: number;     // Actual width each pane will be (between MIN and MAX)
}

/**
 * MASTER LAYOUT FUNCTION
 * Single entry point for all layout operations
 * Called on: initial setup, pane creation, pane deletion, terminal resize
 */
export function recalculateAndApplyLayout(
  controlPaneId: string,
  contentPaneIds: string[],
  terminalWidth: number,
  terminalHeight: number,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG  // Allow custom config
): void {
  const layout = calculateOptimalLayout(
    contentPaneIds.length,
    terminalWidth,
    terminalHeight,
    config  // Pass config through
  );

  setWindowMaxWidth(layout.windowWidth);
  applyPaneLayout(controlPaneId, contentPaneIds, layout, config);
}

function calculateOptimalLayout(
  numContentPanes: number,
  terminalWidth: number,
  terminalHeight: number,
  config: LayoutConfig
): LayoutConfiguration { ... }

function distributePanes(numPanes: number, cols: number): number[] { ... }

function generateLayoutString(
  controlPaneId: string,
  contentPanes: string[],
  layout: LayoutConfiguration,
  config: LayoutConfig  // Need config for SIDEBAR_WIDTH, etc.
): string { ... }

function setWindowMaxWidth(width: number): void {
  try {
    execSync(`tmux set-window-option window-size manual`, { stdio: 'pipe' });
    execSync(`tmux resize-window -x ${width}`, { stdio: 'pipe' });
  } catch (error) {
    // Log but don't fail
  }
}

function applyPaneLayout(
  controlPaneId: string,
  contentPaneIds: string[],
  layout: LayoutConfiguration,
  config: LayoutConfig
): void { ... }
```

### Phase 2: Update Pane Creation Flow

**File**: `src/utils/paneCreation.ts`

**Changes**:
1. **Line 112**: Remove `const SIDEBAR_WIDTH = 40` (use import)
2. **Lines 152-174**: Replace alternating split logic:
   ```typescript
   // OLD: Alternating splits
   const splitDirection = dmuxPaneIds.length % 2 === 1 ? '-h' : '-v';
   paneInfo = execSync(`tmux split-window ${splitDirection} ...`);

   // NEW: Always split horizontally, let layout manager organize
   paneInfo = execSync(`tmux split-window -h -t '${targetPane}' ...`);
   ```
3. **Line 190**: Replace `enforceControlPaneSize()` with `recalculateAndApplyLayout()`:
   ```typescript
   // OLD:
   enforceControlPaneSize(controlPaneId, SIDEBAR_WIDTH);

   // NEW:
   const dimensions = getWindowDimensions();
   recalculateAndApplyLayout(
     controlPaneId,
     [...existingPanes, newPane].map(p => p.paneId),
     dimensions.width,
     dimensions.height
   );
   ```

### Phase 3: Fix Startup Flash

**File**: `src/index.ts`

**Changes**:
1. **Line 148**: Remove `const SIDEBAR_WIDTH = 40`
2. **Lines 164-168**: Replace with layout manager call:
   ```typescript
   // OLD:
   execSync(`tmux resize-pane -t '${controlPaneId}' -x ${SIDEBAR_WIDTH}`, { stdio: 'pipe' });

   // NEW:
   import { recalculateAndApplyLayout, SIDEBAR_WIDTH } from './utils/layoutManager.js';
   const dimensions = { width: 80, height: 24 }; // Fallback dimensions
   try {
     const output = execSync('tmux display-message -p "#{window_width} #{window_height}"', {
       encoding: 'utf-8',
       stdio: 'pipe'
     }).trim();
     const [w, h] = output.split(' ').map(n => parseInt(n));
     dimensions.width = w;
     dimensions.height = h;
   } catch {}

   // Set initial window max-width to sidebar only (before welcome pane)
   setWindowMaxWidth(SIDEBAR_WIDTH);
   execSync(`tmux resize-pane -t '${controlPaneId}' -x ${SIDEBAR_WIDTH}`, { stdio: 'pipe' });
   ```

### Phase 4: Welcome Pane Special Handling

**File**: `src/utils/welcomePane.ts`

**Changes**:
1. **After line 23** (after creating welcome pane): Set window width to unlimited
   ```typescript
   // After: const welcomePaneId = result;

   // Welcome pane should use full terminal width
   const dimensions = getWindowDimensions();
   setWindowMaxWidth(dimensions.width);
   ```

**File**: `src/utils/welcomePaneManager.ts`

**Changes**:
1. **After line 66** (after destroying welcome pane): Recalculate layout
   ```typescript
   // After: destroyWelcomePane(config.welcomePaneId);

   // Recalculate layout now that welcome pane is gone
   const contentPanes = config.panes || [];
   if (contentPanes.length > 0 && config.controlPaneId) {
     const dimensions = getWindowDimensions();
     recalculateAndApplyLayout(
       config.controlPaneId,
       contentPanes.map(p => p.paneId),
       dimensions.width,
       dimensions.height
     );
   }
   ```

### Phase 5: Replace All enforceControlPaneSize Calls

**Files to Update**:
- `src/DmuxApp.tsx` (lines 1431, 1465, 1568, 2219)
- `src/hooks/usePaneRunner.ts` (line 142)
- `src/hooks/useWorktreeActions.ts` (line 39)
- `src/utils/conflictResolutionPane.ts` (line 70)
- `src/utils/tmux.ts` (line 111 - inside `setupSidebarLayout`)

**Pattern**:
```typescript
// OLD:
enforceControlPaneSize(controlPaneId, SIDEBAR_WIDTH);

// NEW:
import { recalculateAndApplyLayout } from './utils/layoutManager.js';
import { getWindowDimensions } from './utils/tmux.js';

const dimensions = getWindowDimensions();
const contentPaneIds = panes.map(p => p.paneId); // Get from context
recalculateAndApplyLayout(controlPaneId, contentPaneIds, dimensions.width, dimensions.height);
```

### Phase 6: Remove Duplicate SIDEBAR_WIDTH Definitions

**Files to Update**:
- `src/index.ts:148` → REMOVE, import from layoutManager
- `src/utils/paneCreation.ts:112` → REMOVE, import from layoutManager
- `src/utils/conflictResolutionPane.ts:67` → REMOVE, import from layoutManager
- `src/hooks/usePaneRunner.ts:139` → REMOVE, import from layoutManager
- `src/hooks/useWorktreeActions.ts:36` → REMOVE, import from layoutManager

**Keep Only**:
- `src/utils/layoutManager.ts` (or `src/utils/tmux.ts` if layoutManager re-exports it)

### Phase 7: Add Terminal Resize Detection

**File**: `src/DmuxApp.tsx`

**Add After Line 21** (imports):
```typescript
import { debounce } from 'lodash'; // Or implement simple debounce
```

**Add in Component Body** (around line 100):
```typescript
// Terminal resize handler
useEffect(() => {
  const handleResize = debounce(() => {
    if (!controlPaneId) return;

    const dimensions = getWindowDimensions();
    const contentPaneIds = panes.map(p => p.paneId);

    recalculateAndApplyLayout(
      controlPaneId,
      contentPaneIds,
      dimensions.width,
      dimensions.height
    );
  }, 500); // Debounce 500ms

  // Listen for terminal resize via stdout
  process.stdout.on('resize', handleResize);

  return () => {
    process.stdout.off('resize', handleResize);
  };
}, [controlPaneId, panes]);
```

### Phase 8: Update Custom Layout String Generator

**File**: `src/utils/layoutManager.ts` (or update `src/utils/tmux.ts`)

**Task**: Rewrite `generateSidebarGridLayout()` to support pane spanning

**Key Changes**:
1. Accept `paneDistribution: number[]` parameter
2. Build columns with variable pane counts
3. Panes in shorter columns get extra height

**Pseudo-code**:
```typescript
function generateLayoutStringWithSpanning(
  controlPaneId: string,
  contentPanes: string[],
  layout: LayoutConfiguration,
  windowWidth: number,
  windowHeight: number
): string {
  const { cols, paneDistribution } = layout;

  // Build columns
  const columns: string[][] = [];
  let paneIndex = 0;

  for (let col = 0; col < cols; col++) {
    const panesInCol = paneDistribution[col];
    const columnPanes: string[] = [];

    for (let i = 0; i < panesInCol; i++) {
      if (paneIndex < contentPanes.length) {
        columnPanes.push(contentPanes[paneIndex++]);
      }
    }

    columns.push(columnPanes);
  }

  // Calculate dimensions per column
  const borders = cols - 1;
  const contentWidth = windowWidth - SIDEBAR_WIDTH - borders;
  const colWidth = Math.floor(contentWidth / cols);

  // Build layout string with variable heights
  // Panes in shorter columns span more rows
  const maxRowsInAnyColumn = Math.max(...paneDistribution);

  // ... (complex layout string generation)
}
```

### Phase 9: Clean Up Old Layout Logic

**File**: `src/utils/tmux.ts`

**Tasks**:
1. **Deprecate `enforceControlPaneSize()`** - mark as deprecated, redirect to layoutManager
2. **Keep `setupSidebarLayout()`** - still useful for initial sidebar creation
3. **Keep `calculateOptimalColumns()`** - move to layoutManager
4. **Keep `generateSidebarGridLayout()`** - move to layoutManager or deprecate

### Phase 10: Update Tests

**File**: `tests/layout.test.ts`

**Tasks**:
1. Update imports to use `layoutManager.ts`
2. Add tests for new layout scenarios:
   - Welcome pane unlimited width
   - Window max-width constraints
   - Pane spanning in uneven distributions
   - Terminal resize triggers
3. Add tests for pane distribution:
   ```typescript
   it('distributes 5 panes across 3 columns as [2, 2, 1]', () => {
     const dist = distributePanes(5, 3);
     expect(dist).toEqual([2, 2, 1]);
   });

   it('calculates correct window width for 3 panes in 2 columns', () => {
     const layout = calculateOptimalLayout(3, 300, 40);
     // 40 (sidebar) + 120*2 (panes) + 1 (border) = 281
     expect(layout.windowWidth).toBe(281);
   });
   ```

---

## Testing Scenarios

### Scenario 1: Fresh Startup
1. Start dmux in 200-col terminal
2. **Expected**: Sidebar appears immediately at 40 cols (no flash)
3. **Expected**: Welcome pane uses all remaining 159 cols
4. **Expected**: Window max-width = 200

### Scenario 2: First Content Pane Creation
1. Create first content pane with prompt
2. **Expected**: Welcome pane destroyed smoothly
3. **Expected**: Content pane appears at ≤120 cols
4. **Expected**: Window max-width = min(40 + 120, terminal width)
5. **Expected**: Empty space visible on right

### Scenario 3: Multiple Panes in Wide Terminal
1. Terminal = 400 cols
2. Create 5 content panes
3. **Expected**: Panes arranged in 3-4 columns (not single column)
4. **Expected**: Each pane between 60-120 cols
5. **Expected**: Last column panes span full height if fewer panes

### Scenario 4: Multiple Panes in Narrow Terminal
1. Terminal = 180 cols
2. Create 5 content panes
3. **Expected**: Panes arranged in 2 columns (3 would be too cramped)
4. **Expected**: Each pane ≥60 cols
5. **Expected**: Distribution like [3, 2] or [2, 2, 1] depending on height

### Scenario 5: Terminal Resize (Expand)
1. Start with terminal = 180 cols, 5 panes (2 columns)
2. Resize terminal to 350 cols
3. **Expected**: After 500ms debounce, layout recalculates to 3 columns
4. **Expected**: Panes redistribute smoothly
5. **Expected**: Window max-width increases

### Scenario 6: Terminal Resize (Shrink)
1. Start with terminal = 350 cols, 5 panes (3 columns)
2. Resize terminal to 180 cols
3. **Expected**: After 500ms debounce, layout recalculates to 2 columns
4. **Expected**: Panes stack vertically as needed
5. **Expected**: Window max-width decreases

### Scenario 7: Pane Closure Triggers Reflow
1. Terminal = 300 cols, 6 panes (3 columns, 2 rows)
2. Close 3 panes
3. **Expected**: Remaining 3 panes spread across 3 columns (1 row)
4. **Expected**: Each pane expands to use full height
5. **Expected**: Window max-width adjusts

### Scenario 8: Welcome Pane Recreation
1. Start with 3 content panes
2. Close all panes
3. **Expected**: Welcome pane recreated automatically
4. **Expected**: Window max-width becomes unlimited (terminal width)

### Scenario 9: Conflict Resolution Pane
1. Create conflict resolution pane during merge
2. **Expected**: Layout system handles it like any other pane
3. **Expected**: No ad-hoc layout commands bypass layout manager

### Scenario 10: Pane Restoration (from usePanes.ts)
1. Restart dmux session with saved panes
2. **Expected**: Panes restored with correct layout
3. **Expected**: No `even-horizontal` hack applied
4. **Expected**: Layout manager recalculates optimal layout

---

## Migration Checklist

### Critical Path (Must Do First)
- [ ] Create `src/utils/layoutManager.ts` with core functions
- [ ] Implement `calculateOptimalLayout()` with tests
- [ ] Implement `setWindowMaxWidth()` and test with tmux
- [ ] Update `src/index.ts` to fix startup flash
- [ ] Update `src/utils/paneCreation.ts` to use layoutManager

### Secondary Tasks
- [ ] Update welcome pane creation/destruction to call layoutManager
- [ ] Replace all `enforceControlPaneSize()` calls (9 locations)
- [ ] Remove duplicate `SIDEBAR_WIDTH` definitions (5 locations)
- [ ] Add terminal resize detection in DmuxApp.tsx
- [ ] Fix `usePanes.ts` pane restoration to use layoutManager

### Polish & Testing
- [ ] Implement pane spanning in layout string generator
- [ ] Update layout tests with new scenarios
- [ ] Test all scenarios listed above
- [ ] Deprecate old layout functions in tmux.ts
- [ ] Update documentation (CLAUDE.md, README.md)

---

## Open Questions

1. **Should we detect terminal resize globally or per-component?**
   - **Recommendation**: Globally in DmuxApp.tsx, since it has access to all panes and controlPaneId

2. **How to handle pane spanning in tmux layout strings?**
   - **Recommendation**: Distribute panes vertically within each column, give shorter columns full-height panes

3. **Should layoutManager be part of tmux.ts or separate file?**
   - **Recommendation**: Separate file for clarity, import constants from tmux.ts

4. **What if tmux doesn't support `resize-window -x`?**
   - **Recommendation**: Graceful fallback - log warning and continue without max-width constraint

5. **Should we animate layout changes or apply instantly?**
   - **Recommendation**: Instant application, tmux will handle the transition

---

## Success Metrics

After implementation, we should achieve:
- ✅ **No startup flash** - sidebar locked to 40 cols immediately
- ✅ **Empty space visible** - window constrained to needed width
- ✅ **Responsive layouts** - adapts to terminal resize within 500ms
- ✅ **Even pane distribution** - orphan panes span full height
- ✅ **Single layout entry point** - all layout operations go through layoutManager
- ✅ **No duplicate constants** - SIDEBAR_WIDTH defined once
- ✅ **All tests passing** - layout.test.ts covers new scenarios

---

## Notes

- **tmux layout string format** is complex but well-documented in existing `generateSidebarGridLayout()`
- **Checksum calculation** is critical for custom layout strings to work
- **Border accounting** must be precise (cols-1 horizontal borders, rows-1 vertical borders)
- **Debouncing resize** prevents excessive recalculations during drag-resize
- **Welcome pane** is a special case that should NOT have width constraints
