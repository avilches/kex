import { describe, expect, it } from "vitest";
import { linearNavTarget, type NavWorkspace } from "./linearNav";

const A: NavWorkspace = { id: "A", rowTabIds: ["a1", "a2"] };
const B: NavWorkspace = { id: "B", rowTabIds: [] };
const C: NavWorkspace = { id: "C", rowTabIds: ["c1"] };
const all = [A, B, C];

describe("linearNavTarget", () => {
  it("walks the tabs of a workspace in order", () => {
    expect(linearNavTarget(all, { workspaceId: "A", tabId: "a1" }, 1)).toEqual({
      workspaceId: "A",
      tabId: "a2",
    });
  });

  it("moves to the next workspace after its last tab", () => {
    expect(linearNavTarget(all, { workspaceId: "A", tabId: "a2" }, 1)).toEqual({
      workspaceId: "B",
      tabId: null,
    });
  });

  it("treats a workspace without rows as a single stop", () => {
    expect(linearNavTarget(all, { workspaceId: "B", tabId: "x" }, 1)).toEqual({
      workspaceId: "C",
      tabId: "c1",
    });
    expect(linearNavTarget(all, { workspaceId: "B", tabId: null }, -1)).toEqual({
      workspaceId: "A",
      tabId: "a2",
    });
  });

  it("wraps around at both ends", () => {
    expect(linearNavTarget(all, { workspaceId: "C", tabId: "c1" }, 1)).toEqual({
      workspaceId: "A",
      tabId: "a1",
    });
    expect(linearNavTarget(all, { workspaceId: "A", tabId: "a1" }, -1)).toEqual({
      workspaceId: "C",
      tabId: "c1",
    });
  });

  it("enters a workspace at its first tab going forward and its last going back", () => {
    expect(linearNavTarget(all, { workspaceId: "B", tabId: null }, 1)).toEqual({
      workspaceId: "C",
      tabId: "c1",
    });
    expect(linearNavTarget(all, { workspaceId: "C", tabId: "c1" }, -1)).toEqual({
      workspaceId: "B",
      tabId: null,
    });
  });

  it("handles a focused tab the sidebar does not list", () => {
    expect(linearNavTarget(all, { workspaceId: "A", tabId: "hidden" }, 1)).toEqual({
      workspaceId: "A",
      tabId: "a1",
    });
    expect(linearNavTarget(all, { workspaceId: "A", tabId: "hidden" }, -1)).toEqual({
      workspaceId: "C",
      tabId: "c1",
    });
  });

  it("returns null when there is nowhere to go", () => {
    expect(linearNavTarget([B], { workspaceId: "B", tabId: null }, 1)).toBeNull();
    expect(linearNavTarget([], { workspaceId: "B", tabId: null }, 1)).toBeNull();
  });

  it("starts at an end when the active workspace is not listed", () => {
    expect(linearNavTarget(all, { workspaceId: "Z", tabId: null }, 1)).toEqual({
      workspaceId: "A",
      tabId: "a1",
    });
    expect(linearNavTarget(all, { workspaceId: "Z", tabId: null }, -1)).toEqual({
      workspaceId: "C",
      tabId: "c1",
    });
  });
});
