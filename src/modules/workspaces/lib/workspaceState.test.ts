import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({ label: "w-test" }),
}));

import {
  getSavedWorkspaceState,
  initWorkspaceState,
  sanitizeWorkspace,
} from "./workspaceState";
import { isAutofocusActive, type Tab } from "./types";
import type { Workspace } from "./types";

describe("isAutofocusActive", () => {
  const off: Tab = { id: "t1", kind: "terminal", cwd: "/a" };
  const web: Tab = { id: "b1", kind: "browser", url: "https://x" };

  it("is never true in manual mode", () => {
    expect(isAutofocusActive(off, "manual", true)).toBe(false);
    expect(isAutofocusActive(off, "manual", false)).toBe(false);
  });

  it("is true for every capable tab in always mode, never for the rest", () => {
    expect(isAutofocusActive(off, "always", true)).toBe(true);
    expect(isAutofocusActive(web, "always", true)).toBe(false);
  });

  it("in noRoot mode is true only without a workspace root", () => {
    expect(isAutofocusActive(off, "noRoot", false)).toBe(true);
    expect(isAutofocusActive(off, "noRoot", true)).toBe(false);
    expect(isAutofocusActive(web, "noRoot", false)).toBe(false);
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

  it("normalizes saved actions and drops an active action that no longer exists", () => {
    const w = {
      id: "w1",
      title: "W",
      paneTree: { kind: "pane", id: "p1", tabs: [], activeTabId: null },
      activePaneId: "p1",
      actions: [
        { id: "ac-1", name: " Dev ", kind: "script", command: " npm run dev ", ownButton: true },
        { id: "ac-2", name: "Empty", kind: "script", command: " ", ownButton: false },
      ],
      activeAction: "ac-2",
    } as Workspace;
    const out = sanitizeWorkspace(w);
    expect(out.actions).toEqual([
      { id: "ac-1", name: "Dev", kind: "script", command: "npm run dev", ownButton: true },
    ]);
    expect(out.activeAction).toBeUndefined();
  });

  it("leaves a workspace without actions untouched", () => {
    const w: Workspace = {
      id: "w1",
      title: "W",
      paneTree: { kind: "pane", id: "p1", tabs: [], activeTabId: null },
      activePaneId: "p1",
    };
    const out = sanitizeWorkspace(w);
    expect(out).not.toHaveProperty("actions");
    expect(out).not.toHaveProperty("activeAction");
  });

  it("drops the scripts and the active script of an old saved workspace, with no migration", () => {
    const w = {
      id: "w1",
      title: "W",
      paneTree: { kind: "pane", id: "p1", tabs: [], activeTabId: null },
      activePaneId: "p1",
      scripts: [{ id: "sc-1", name: "dev", command: "pnpm dev", tabId: "tab-1" }],
      activeScript: "sc-1",
      scriptPaneId: "p1",
    } as unknown as Workspace;
    const out = sanitizeWorkspace(w);
    expect(out).not.toHaveProperty("scripts");
    expect(out).not.toHaveProperty("activeScript");
    expect(out).not.toHaveProperty("actions");
    expect(out.scriptPaneId).toBe("p1");
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

  it("restores every saved workspace as it was, keeping the hibernated tabs hibernated", async () => {
    const sleepy = saved("b");
    (sleepy as { paneTree: { tabs: unknown[] } }).paneTree.tabs = [{ id: "t1", kind: "terminal", hibernation: { at: 5 } }];
    invokeMock.mockResolvedValue({ workspaces: [saved("a"), sleepy, saved("c")], activeIndex: 0 });
    await initWorkspaceState();
    const state = getSavedWorkspaceState()!;
    expect(state.activeIndex).toBe(0);
    expect(state.workspaces[1]!.paneTree).toMatchObject({ tabs: [{ id: "t1", hibernation: { at: 5 } }] });
  });
});
