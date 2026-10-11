import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({ label: "w-test" }),
}));

import {
  getSavedWorkspaceState,
  initWorkspaceState,
  sanitizeTab,
  sanitizeWorkspace,
} from "./workspaceState";
import { isAutofocusActive, type Tab } from "./types";
import type { Workspace } from "./types";

describe("sanitizeTab", () => {
  it("preserves the terminal autofocus flag", () => {
    const p: Tab = { id: "t1", kind: "terminal", cwd: "/a", autofocus: true };
    expect(sanitizeTab(p)).toMatchObject({ autofocus: true });
  });
});

describe("isAutofocusActive", () => {
  const off: Tab = { id: "t1", kind: "terminal", cwd: "/a" };
  const on: Tab = { ...off, autofocus: true };
  const web: Tab = { id: "b1", kind: "browser", url: "https://x" };

  it("follows the per-tab flag in manual and new-tabs modes", () => {
    expect(isAutofocusActive(on, "manual")).toBe(true);
    expect(isAutofocusActive(off, "manual")).toBe(false);
    expect(isAutofocusActive(off, "new-tabs")).toBe(false);
  });

  it("is true for every capable tab in always mode, never for the rest", () => {
    expect(isAutofocusActive(off, "always")).toBe(true);
    expect(isAutofocusActive(web, "always")).toBe(false);
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

  it("keeps two markdown tabs open on the same path", () => {
    const w: Workspace = {
      id: "ws-1",
      title: "W",
      activePaneId: "pane-1",
      paneTree: {
        kind: "pane",
        id: "pane-1",
        activeTabId: "tab-1",
        tabs: [
          { id: "tab-1", kind: "markdown", path: "/n/a.md" },
          { id: "tab-2", kind: "markdown", path: "/n/a.md" },
        ],
      },
    };

    const out = sanitizeWorkspace(w);
    const pane = out.paneTree as Extract<Workspace["paneTree"], { kind: "pane" }>;
    expect(pane.tabs).toHaveLength(2);
    expect(pane.tabs.map((t) => t.id)).toEqual(["tab-1", "tab-2"]);
  });
});

describe("initWorkspaceState", () => {
  const saved = (id: string): Workspace => ({
    id,
    title: id,
    paneTree: { kind: "pane", id: `p-${id}`, tabs: [{ id: `t-${id}`, kind: "terminal" }], activeTabId: `t-${id}` },
    activePaneId: `p-${id}`,
  });

  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({
      workspaces: [saved("a"), saved("b"), saved("c")],
      activeIndex: 1,
    });
  });

  it("hibernates every saved workspace but the active one when restoreAll is false", async () => {
    await initWorkspaceState(false);
    const state = getSavedWorkspaceState()!;
    expect(state.activeIndex).toBe(1);
    expect(state.workspaces.map((w) => w.hibernated)).toEqual([true, undefined, true]);
  });

  it("hibernates nothing when restoreAll is true", async () => {
    await initWorkspaceState(true);
    expect(getSavedWorkspaceState()!.workspaces.some((w) => w.hibernated)).toBe(false);
  });
});
