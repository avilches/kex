import { describe, expect, it } from "vitest";
import { sanitizePanel, sanitizeWorkspace } from "./workspaceState";
import type { Panel } from "./types";
import type { Workspace } from "./types";

describe("sanitizePanel", () => {
  it("preserves the terminal autofocus flag", () => {
    const p: Panel = { id: "t1", kind: "terminal", cwd: "/a", autofocus: true };
    expect(sanitizePanel(p)).toMatchObject({ autofocus: true });
  });
});

describe("sanitizeWorkspace", () => {
  it("preserves an empty pane (no tabs) so a workspace can persist without tabs", () => {
    const w: Workspace = {
      id: "w1",
      title: "W",
      paneTree: { kind: "pane", id: "p1", panels: [], activePanelId: null },
      activePaneId: "p1",
    };
    const out = sanitizeWorkspace(w);
    const pane = out.paneTree as Extract<Workspace["paneTree"], { kind: "pane" }>;
    expect(pane.kind).toBe("pane");
    expect(pane.panels).toEqual([]);
    expect(pane.activePanelId).toBeNull();
  });
});
