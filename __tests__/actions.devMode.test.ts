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
})
