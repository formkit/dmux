# Terminal Streaming Feature Implementation

## Overview
Implement real-time HTTP streaming of tmux panes to browser using Server-Sent Events (SSE) with efficient incremental updates.

## Architecture Summary
- **Protocol**: Server-Sent Events (SSE) for one-way streaming
- **Initial State**: Send full terminal capture + dimensions on connect
- **Updates**: Stream incremental patches (only changed regions)
- **Rendering**: Use `<pre>` element with efficient DOM patching
- **Resize Handling**: Detect dimension changes, send new full capture

## Implementation Checklist

### Phase 1: Backend Infrastructure
- [x] Create `src/services/TerminalStreamer.ts` service class
  - [x] Track active streams Map<paneId, StreamInfo>
  - [x] Implement stream lifecycle (start/stop)
  - [x] Handle multiple clients per pane
  - [x] Cleanup on disconnect

- [x] Implement tmux integration methods
  - [x] Get pane dimensions: `tmux display -p "#{pane_width}x#{pane_height}" -t {paneId}`
  - [x] Capture pane state: `tmux capture-pane -ep -t {paneId}`
  - [x] Start pipe: `tmux pipe-pane -t {paneId} -o 'cat >> /tmp/dmux-pipe-{id}'`
  - [x] Stop pipe: `tmux pipe-pane -t {paneId}`
  - [x] Monitor pipe file with tail process

### Phase 2: SSE Endpoint
- [ ] Create `/api/stream/:paneId` endpoint in `src/server/routes.ts`
  - [ ] Set SSE headers (Content-Type: text/event-stream)
  - [ ] Send initial `init` message with dimensions and content
  - [ ] Stream incremental updates as `patch` messages
  - [ ] Handle client disconnect cleanup
  - [ ] Implement heartbeat/keepalive

### Phase 3: Message Protocol
- [ ] Define message types in `src/shared/StreamProtocol.ts`
  ```typescript
  interface InitMessage {
    type: 'init';
    width: number;
    height: number;
    content: string;
  }

  interface PatchMessage {
    type: 'patch';
    changes: Array<{
      row: number;
      col: number;
      text: string;
      length?: number;
    }>;
  }

  interface ResizeMessage {
    type: 'resize';
    width: number;
    height: number;
    content: string;
  }
  ```

### Phase 4: Incremental Update System
- [ ] Create `src/services/TerminalDiffer.ts`
  - [ ] Virtual terminal state tracking
  - [ ] ANSI escape sequence parser
  - [ ] Diff algorithm (old vs new state)
  - [ ] Patch generation (minimal change set)
  - [ ] Buffer management (16ms batching for 60fps)

### Phase 5: Resize Detection
- [ ] Add dimension monitoring to TerminalStreamer
  - [ ] Poll dimensions every 500ms during active stream
  - [ ] Compare with cached dimensions
  - [ ] On change: capture full state, send resize message
  - [ ] Restart pipe after resize

### Phase 6: Frontend Terminal Viewer
- [ ] Update dashboard HTML in `src/server/static.ts`
  - [ ] Add click handler to pane cards
  - [ ] Create modal/overlay for terminal view
  - [ ] Add close button and escape key handler

- [ ] Implement terminal renderer
  - [ ] Create EventSource connection
  - [ ] Handle init message (setup display)
  - [ ] Handle patch messages (apply changes)
  - [ ] Handle resize messages (rebuild display)
  - [ ] Error handling and reconnection

### Phase 7: DOM Rendering Optimization
- [ ] Implement efficient patching algorithm
  - [ ] Parse terminal into 2D character array
  - [ ] Apply patches to specific positions
  - [ ] Batch DOM updates using DocumentFragment
  - [ ] Use requestAnimationFrame for smooth updates
  - [ ] Handle ANSI colors with CSS classes

### Phase 8: ANSI Color Support
- [ ] Create ANSI to CSS mapping
  - [ ] Basic colors (30-37, 40-47)
  - [ ] Bright colors (90-97, 100-107)
  - [ ] Text attributes (bold, dim, italic, underline)
  - [ ] Reset sequences
  - [ ] Cursor visibility

### Phase 9: Performance Optimizations
- [ ] Implement viewport culling (only render visible area)
- [ ] Add dirty region tracking
- [ ] Coalesce rapid updates
- [ ] Implement backpressure handling
- [ ] Add metrics/debugging overlay

### Phase 10: Error Handling & Cleanup
- [ ] Handle connection failures gracefully
  - [ ] Automatic reconnection with backoff
  - [ ] Show connection status in UI
  - [ ] Fallback to periodic capture if pipe fails

- [ ] Resource cleanup
  - [ ] Clean up temp files on shutdown
  - [ ] Stop all pipes on server exit
  - [ ] Handle tmux session destruction

### Phase 11: Testing & Polish
- [ ] Test with various terminal applications
  - [ ] vim/neovim
  - [ ] htop/top
  - [ ] Long-running builds
  - [ ] Interactive prompts

- [ ] Edge cases
  - [ ] Very large terminals (200+ cols)
  - [ ] Rapid output (build logs)
  - [ ] Unicode/emoji support
  - [ ] Multiple simultaneous streams

### Phase 12: Documentation
- [ ] Update CLAUDE.md with streaming feature
- [ ] Add inline code documentation
- [ ] Create troubleshooting guide
- [ ] Document performance characteristics

## Technical Details

### SSE Message Format
```
event: message
data: {"type":"patch","changes":[{"row":5,"col":10,"text":"Hello"}]}

event: message
data: {"type":"resize","width":120,"height":40,"content":"..."}
```

### File Structure
```
src/
├── services/
│   ├── TerminalStreamer.ts    # Main streaming service
│   └── TerminalDiffer.ts      # Diff/patch generation
├── shared/
│   └── StreamProtocol.ts      # Message type definitions
└── server/
    └── routes.ts              # SSE endpoint
```

### Key Commands
```bash
# Get pane dimensions
tmux display -p "#{pane_width}x#{pane_height}" -t %15

# Capture pane with ANSI codes
tmux capture-pane -ep -t %15

# Start piping pane output
tmux pipe-pane -t %15 -o 'cat >> /tmp/dmux-pipe-15'

# Stop piping
tmux pipe-pane -t %15

# Tail the pipe file
tail -f /tmp/dmux-pipe-15
```

## Progress Tracking

### Current Status
**Phase**: Planning
**Completed**: TODO file creation
**Next Step**: Create TerminalStreamer service

### Notes for Future Sessions
When continuing this feature:
1. Check this file for current phase
2. Look for any `[x]` completed items
3. Start with next unchecked `[ ]` item
4. Update checkboxes as you progress
5. Test each phase before moving to next
6. **IMPORTANT**: Commit after completing each major phase/milestone
7. Mark items as complete `[x]` in this TODO file when done

### Integration Points
- Reuses existing `StateManager` for pane tracking
- Integrates with `DmuxServer` for HTTP endpoints
- Uses pane IDs from `DmuxPane` type
- Follows existing worker pattern from `PaneWorker`

---

To continue implementation, run: `claude "Continue implementing terminal streaming from current phase"`