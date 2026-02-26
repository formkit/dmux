import { describe, it, expect } from "vitest"
import { getAvailableActions, PaneAction } from "../src/actions/types.js"
import type { DmuxPane } from "../src/types.js"

const pane: DmuxPane = {
  id: "1",
  slug: "feature-a",
  prompt: "test",
  paneId: "%1",
  worktreePath: "/tmp/repo/.dmux/worktrees/feature-a",
}

describe("dev-only action visibility", () => {
  it("hides set_source when not in dev mode", () => {
    const actions = getAvailableActions(pane, {}, false)
    const ids = actions.map((action) => action.id)
    expect(ids.includes(PaneAction.SET_SOURCE)).toBe(false)
  })

  it("shows set_source in dev mode", () => {
    const actions = getAvailableActions(pane, {}, true)
    const ids = actions.map((action) => action.id)
    expect(ids.includes(PaneAction.SET_SOURCE)).toBe(true)
  })

  it("shows open_terminal_in_worktree for worktree panes", () => {
    const actions = getAvailableActions(pane, {}, false)
    const ids = actions.map((action) => action.id)
    expect(ids.includes(PaneAction.OPEN_TERMINAL_IN_WORKTREE)).toBe(true)
  })

  it("keeps add agent as the last visible pane action", () => {
    const actions = getAvailableActions(pane, {}, false)
    const ids = actions.map((action) => action.id)
    expect(ids[ids.length - 1]).toBe(PaneAction.ATTACH_AGENT)
    expect(ids.indexOf(PaneAction.OPEN_TERMINAL_IN_WORKTREE)).toBeLessThan(
      ids.indexOf(PaneAction.ATTACH_AGENT)
    )
  })

  it("hides open_terminal_in_worktree for shell panes", () => {
    const shellPane: DmuxPane = {
      id: "2",
      slug: "shell-1",
      prompt: "",
      paneId: "%2",
      type: "shell",
    }

    const actions = getAvailableActions(shellPane, {}, false)
    const ids = actions.map((action) => action.id)
    expect(ids.includes(PaneAction.OPEN_TERMINAL_IN_WORKTREE)).toBe(false)
  })
})
