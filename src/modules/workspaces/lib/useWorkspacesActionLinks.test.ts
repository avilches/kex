// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getActionTab, linkActionTab, unlinkActionTab } from "@/modules/actions/lib/actionStateStore";
import type { Action } from "@/modules/actions";
import {
  clearScriptRunningEntry,
  getScriptRunningSnapshot,
  setScriptRunning,
} from "./terminalEphemeralStore";
import type { Workspace } from "./types";
import { useWorkspaces } from "./useWorkspaces";

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ destroy: vi.fn() }) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve()) }));

const script: Action = { id: "ac-s", name: "Dev", runInTerminal: true, command: "npm run dev", ownButton: true };

const workspace = (): Workspace => ({
  id: "w1",
  title: "W",
  paneTree: { kind: "pane", id: "p1", tabs: [{ id: "tab-1", kind: "terminal" }], activeTabId: "tab-1" },
  activePaneId: "p1",
  actions: [script],
});

function start() {
  linkActionTab(script.id, "tab-1");
  setScriptRunning("tab-1", "running");
  return renderHook(() => useWorkspaces({ initialWorkspaces: [workspace()] }));
}

afterEach(() => {
  unlinkActionTab(script.id);
  clearScriptRunningEntry("tab-1");
});

describe("deleting or retyping a running Action", () => {
  it("clears its link and running mark when it is deleted, so nothing stays stuck", () => {
    const { result } = start();
    act(() => result.current.removeWorkspaceAction("w1", script.id));
    expect(getActionTab(script.id)).toBeUndefined();
    expect(getScriptRunningSnapshot().has("tab-1")).toBe(false);
  });

  it("clears them when a script is turned into an app", () => {
    const { result } = start();
    act(() => result.current.updateWorkspaceAction("w1", script.id, { runInTerminal: false }));
    expect(getActionTab(script.id)).toBeUndefined();
    expect(getScriptRunningSnapshot().has("tab-1")).toBe(false);
  });

  it("keeps them for an edit that leaves it a script", () => {
    const { result } = start();
    act(() => result.current.updateWorkspaceAction("w1", script.id, { name: "Renamed" }));
    expect(getActionTab(script.id)).toBe("tab-1");
    expect(getScriptRunningSnapshot().get("tab-1")).toBe("running");
  });

  it("keeps them while it is promoted, as it goes on running as a global Action", () => {
    const { result } = start();
    act(() => result.current.promoteWorkspaceAction("w1", script.id));
    expect(getActionTab(script.id)).toBe("tab-1");
    expect(getScriptRunningSnapshot().get("tab-1")).toBe("running");
  });
});
