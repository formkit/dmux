# Empty Catch Block Audit

**Last Updated**: 2025-10-21
**Status**: In Progress
**Total Found**: TBD (counting in progress)

## Categories

- **Category 1**: Optional UI operations (keep silent, add comment)
- **Category 2**: Non-critical with fallback (log but continue)
- **Category 3**: Critical path (log and throw)
- **Category 4**: Expected errors (log at debug level)

## Audit Progress

### src/services/PopupManager.ts

| Line | Context | Category | Status | Notes |
|------|---------|----------|--------|-------|
| 151 | `execSync` cleanup in error handler | 1 | ⏳ Pending | Cleanup operation in error path |
| 160 | `execSync` cleanup in error handler | 1 | ⏳ Pending | Cleanup operation in error path |
| 435 | JSON parse result | 2 | ⏳ Pending | Parsing popup result, has fallback |

### src/services/TerminalStreamer.ts

| Line | Context | Category | Status | Notes |
|------|---------|----------|--------|-------|
| 171 | Remove pipe file | 2 | ⏳ Pending | "No existing pipe, which is fine" comment exists |
| 480 | Kill tail process | 1 | ⏳ Pending | Cleanup operation |
| 491 | Kill tail process | 1 | ⏳ Pending | Cleanup operation |

### src/services/PaneWorkerManager.ts

| Line | Context | Category | Status | Notes |
|------|---------|----------|--------|-------|
| 300 | Worker termination | 1 | ⏳ Pending | Cleanup before restart |

### src/services/TmuxService.ts

| Line | Context | Category | Status | Notes |
|------|---------|----------|--------|-------|
| 273 | `hasSession()` check | 4 | ⏳ Pending | Expected error when session doesn't exist |
| 293 | Get pane title in filter | 2 | ⏳ Pending | "Include pane if we can't get title" comment exists |
| 416 | `refresh-client` | 1 | ✅ Done | Already has comment + debug log |
| 462 | Get window dimensions | 2 | ⏳ Pending | Returns fallback dimensions |
| 477 | Get pane dimensions | 2 | ⏳ Pending | Returns fallback dimensions |
| 489 | Get all panes | 2 | ⏳ Pending | Returns empty array |
| 513 | List windows | 2 | ⏳ Pending | Returns empty array |
| 524 | Get pane title | 2 | ⏳ Pending | Returns empty string |
| 558 | `refresh-client` | 1 | ✅ Done | Already has comment |

### src/services/AutoUpdater.ts

| Line | Context | Category | Status | Notes |
|------|---------|----------|--------|-------|
| 17 | Find git root (directory traversal) | 2 | ⏳ Pending | Continues traversing up |
| 57 | Read update settings file | 2 | ⏳ Pending | Returns default config |
| 70 | Write update settings file | 2 | ⏳ Pending | Silent write failure |
| 101 | GitHub API call | 2 | ⏳ Pending | Has fallback to npm registry |
| 117 | npm registry API call | 2 | ⏳ Pending | "Network error or API unavailable" comment |
| 158 | Check npm global packages | 2 | ⏳ Pending | Method 1 of 4, has fallbacks |
| 170 | Check pnpm global packages | 2 | ⏳ Pending | Method 2 of 4, has fallbacks |
| 182 | Check yarn global packages | 2 | ⏳ Pending | Method 3 of 4, has fallbacks |
| 201 | Check executable path | 2 | ⏳ Pending | Method 4 of 4, final fallback |
| 204 | Outer detection wrapper | 2 | ⏳ Pending | Returns unknown if all methods fail |
| 261 | Version comparison | 2 | ⏳ Pending | Returns false on error |

### src/index.ts

| Line | Context | Category | Status | Notes |
|------|---------|----------|--------|-------|
| 112 | `has-session` check | 4 | ⏳ Pending | Expected error, creates new session |
| 304 | Git check | 4 | ⏳ Pending | `isGitRepo()` - expected to fail sometimes |
| 326 | Git check | 4 | ⏳ Pending | `isGitRepo()` - expected to fail sometimes |
| 360 | Get git root | 2 | ⏳ Pending | Falls back to current directory |
| 458 | File cleanup | 1 | ⏳ Pending | Old config migration |
| 466 | File cleanup | 1 | ⏳ Pending | Old config migration |
| 474 | File cleanup | 1 | ⏳ Pending | Old config migration |
| 484 | File cleanup | 1 | ⏳ Pending | Old config migration |
| 503 | File cleanup | 1 | ⏳ Pending | Old config migration |
| 506 | File cleanup | 1 | ⏳ Pending | Old config migration |
| 509 | File cleanup | 1 | ⏳ Pending | Old config migration |
| 512 | File cleanup | 1 | ⏳ Pending | Old config migration |
| 528 | Background update check | 2 | ⏳ Pending | "Silently ignore errors" comment exists |
| 580 | Cleanup on exit | 1 | ⏳ Pending | "Ignore cleanup errors" comment exists |
| 590 | Cleanup on exit | 1 | ⏳ Pending | "Ignore cleanup errors" comment exists |
| 613 | Signal handler cleanup | 1 | ⏳ Pending | Best-effort cleanup |

### src/actions/implementations/copyPathAction.ts

| Line | Context | Category | Status | Notes |
|------|---------|----------|--------|-------|
| 33 | Clipboard copy | 2 | ⏳ Pending | "If clipboard copy fails, just show the path" comment |

### __tests__/dmux.e2e.create-pane.test.ts

| Line | Context | Category | Status | Notes |
|------|---------|----------|--------|-------|
| 13 | Test helper - check session | 4 | ⏳ Pending | Test code - expected error |
| 76 | Test cleanup | 1 | ⏳ Pending | Test cleanup code |
| 77 | Test cleanup | 1 | ⏳ Pending | Test cleanup code |
| 94 | Test helper - wait for session | 4 | ⏳ Pending | Test code - expected error |
| 128 | Test cleanup | 1 | ⏳ Pending | Test cleanup code |
| 131 | Test cleanup | 1 | ⏳ Pending | Test cleanup code |
| 132 | Test cleanup | 1 | ⏳ Pending | Test cleanup code |

## Summary by Category

- **Category 1 (Optional UI)**: TBD
- **Category 2 (Non-critical with fallback)**: TBD
- **Category 3 (Critical path)**: TBD
- **Category 4 (Expected errors)**: TBD
- **Test Code**: TBD (generally acceptable to leave as-is)

## Next Steps

1. ✅ Create inventory document
2. ⏳ Review each catch block in context
3. ⏳ Categorize each instance
4. ⏳ Fix based on category
5. ⏳ Test changes
