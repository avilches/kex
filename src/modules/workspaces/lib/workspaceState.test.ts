import { describe, expect, it } from "vitest";
import { sanitizeTab, sanitizeWorkspace } from "./workspaceState";
import type { Tab } from "./types";
import type { Workspace } from "./types";

describe("sanitizeTab", () => {
  it("preserves the terminal autofocus flag", () => {
    const p: Tab = { id: "t1", kind: "terminal", cwd: "/a", autofocus: true };
    expect(sanitizeTab(p)).toMatchObject({ autofocus: true });
  });
});

describe("sanitizeWorkspace", () => {
  it("preserves an empty pane (no tabs) so a workspace can persist without tabs", () => {
    const w: Workspace = {
      id: "w1",
      title: "W",
      paneTree: { kind: "pane", id: "p1", tabs: [], activeTabId: null },
      activePaneId: "p1",
    };
    const out = sanitizeWorkspace(w);
    const pane = out.paneTree as Extract<Workspace["paneTree"], { kind: "pane" }>;
    expect(pane.kind).toBe("pane");
    expect(pane.tabs).toEqual([]);
    expect(pane.activeTabId).toBeNull();
  });
});
