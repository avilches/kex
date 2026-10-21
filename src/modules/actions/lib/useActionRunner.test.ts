// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tab, Workspace } from "@/modules/workspaces/lib/types";
import {
  clearScriptRunningEntry,
  getScriptRunningSnapshot,
  setScriptRunning,
} from "@/modules/workspaces/lib/terminalEphemeralStore";
import { getActionTab, linkActionTab, unlinkActionTab } from "./actionStateStore";
import { useActionRunner, type ActionRunnerDeps } from "./useActionRunner";
import type { Action } from "./types";

const spawn = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const toastError = vi.hoisted(() => vi.fn());
const ptyStop = vi.hoisted(() => vi.fn(() => Promise.resolve(0)));
vi.mock("@/lib/native", () => ({
  native: { actionSpawn: spawn, fsStat: () => Promise.resolve({ kind: "dir" }), ptyStop },
}));
vi.mock("sonner", () => ({ toast: { error: toastError } }));
vi.mock("@/modules/terminal/lib/useTerminalSession", () => ({ requestLeafFocus: vi.fn() }));
vi.mock("@/modules/workspace", () => ({
  useWorkspaceEnvStore: { getState: () => ({ env: { kind: "local" } }) },
}));

const script: Action = { id: "ac-s", name: "Dev", runInTerminal: true, command: "npm run dev", ownButton: true };
const app: Action = { id: "ac-a", name: "Code", runInTerminal: false, command: "code {workspace}", ownButton: true };

const termTab = (id: string, cwd?: string): Tab => ({ id, kind: "terminal", cwd });
const ws = (o: Partial<Workspace> = {}): Workspace => ({
  id: "w1",
  title: "",
  workspaceRoot: "/w",
  cwd: "/w",
  actions: [script, app],
  activeAction: script.id,
  paneTree: { kind: "pane", id: "p1", tabs: [termTab("tab-user")], activeTabId: "tab-user" },
  activePaneId: "p1",
  ...o,
});

function setup(workspace: Workspace, found: Record<string, Tab> = {}) {
  const write = vi.fn();
  const deps = {
    activeWorkspace: workspace,
    activeWorkspaceId: workspace.id,
    findTabGlobal: (id: string) =>
      found[id] ? { workspace, pane: { id: "p-other" }, tab: found[id] } : null,
    setActiveWorkspaceId: vi.fn(),
    activateTab: vi.fn(),
    revealTab: vi.fn(),
    focusPane: vi.fn(),
    openTab: vi.fn(),
    splitPaneAndOpenTab: vi.fn(() => "p-scripts"),
    setScriptPaneId: vi.fn(),
    terminalHandles: { current: new Map([["any", { write }]]) },
    scriptCommandSeen: { current: new Set<string>() },
    focusFolder: { current: null as string | null },
  } satisfies ActionRunnerDeps;
  const hook = renderHook(() => useActionRunner(deps));
  return { deps, write, ...hook };
}

beforeEach(() => {
  vi.useFakeTimers();
  spawn.mockClear();
  ptyStop.mockClear();
  toastError.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  unlinkActionTab(script.id);
  for (const t of ["tab-old"]) clearScriptRunningEntry(t);
});

describe("useActionRunner", () => {
  it("opens a split scripts pane, links the new tab and marks it running", () => {
    const { deps, result } = setup(ws());
    act(() => result.current.runAction(script));
    expect(deps.splitPaneAndOpenTab).toHaveBeenCalledTimes(1);
    const tab = (deps.splitPaneAndOpenTab.mock.calls[0] as unknown[])[3] as Tab;
    expect(tab).toMatchObject({ kind: "terminal", title: "Dev", cwd: "/w" });
    expect(deps.setScriptPaneId).toHaveBeenCalledWith("w1", "p-scripts");
    expect(getActionTab(script.id)).toBe(tab.id);
    expect(getScriptRunningSnapshot().get(tab.id)).toBe("running");
    clearScriptRunningEntry(tab.id);
  });

  it("writes the typed line once the terminal handle exists", () => {
    const { deps, result, write } = setup(ws());
    act(() => result.current.runAction(script));
    const tab = (deps.splitPaneAndOpenTab.mock.calls[0] as unknown[])[3] as Tab;
    deps.terminalHandles.current.set(tab.id, { write });
    act(() => void vi.advanceTimersByTime(200));
    expect(write).toHaveBeenCalledWith("npm run dev\r");
    clearScriptRunningEntry(tab.id);
  });

  it("gives up and clears the mark when the terminal never shows up", () => {
    const { deps, result } = setup(ws());
    act(() => result.current.runAction(script));
    const tab = (deps.splitPaneAndOpenTab.mock.calls[0] as unknown[])[3] as Tab;
    act(() => void vi.advanceTimersByTime(5000));
    expect(getScriptRunningSnapshot().has(tab.id)).toBe(false);
  });

  it("opens a new tab when the linked tab is busy with the user's own command", () => {
    linkActionTab(script.id, "tab-old");
    const { deps, result } = setup(ws(), { "tab-old": termTab("tab-old") });
    deps.scriptCommandSeen.current.add("tab-old");
    act(() => result.current.runAction(script));
    expect(deps.splitPaneAndOpenTab).toHaveBeenCalledTimes(1);
    expect(getActionTab(script.id)).not.toBe("tab-old");
    clearScriptRunningEntry(getActionTab(script.id) as string);
  });

  it("opens a new tab when the linked tab is a browser", () => {
    linkActionTab(script.id, "tab-old");
    const browser: Tab = { id: "tab-old", kind: "browser", url: "http://x" };
    const { deps, result } = setup(ws(), { "tab-old": browser });
    act(() => result.current.runAction(script));
    expect(deps.splitPaneAndOpenTab).toHaveBeenCalledTimes(1);
    clearScriptRunningEntry(getActionTab(script.id) as string);
  });

  it("reuses an idle linked terminal instead of opening another tab", () => {
    linkActionTab(script.id, "tab-old");
    const { deps, result } = setup(ws(), { "tab-old": termTab("tab-old", "/w") });
    act(() => result.current.runAction(script));
    expect(deps.splitPaneAndOpenTab).not.toHaveBeenCalled();
    expect(deps.openTab).not.toHaveBeenCalled();
    expect(getScriptRunningSnapshot().get("tab-old")).toBe("running");
  });

  it("adds to the scripts pane when it exists", () => {
    const withPane = ws({
      scriptPaneId: "p2",
      paneTree: {
        kind: "split",
        id: "s",
        orientation: "vertical",
        dividerPosition: 50,
        first: { kind: "pane", id: "p1", tabs: [termTab("tab-user")], activeTabId: "tab-user" },
        second: { kind: "pane", id: "p2", tabs: [], activeTabId: null },
      },
    });
    const { deps, result } = setup(withPane);
    act(() => result.current.runAction(script));
    expect(deps.openTab).toHaveBeenCalledWith("w1", "p2", expect.objectContaining({ kind: "terminal" }));
    expect(deps.splitPaneAndOpenTab).not.toHaveBeenCalled();
    clearScriptRunningEntry(getActionTab(script.id) as string);
  });

  it("spawns an app without a terminal and without linking a tab", () => {
    const { deps, result } = setup(ws());
    act(() => result.current.runAction(app));
    expect(spawn).toHaveBeenCalledWith(["code", "/w"], "/w");
    expect(deps.splitPaneAndOpenTab).not.toHaveBeenCalled();
    expect(getActionTab(app.id)).toBeUndefined();
  });

  it("tells the user why an Action did not run", () => {
    const { result } = setup(ws({ workspaceRoot: undefined }));
    act(() => result.current.runAction(app));
    expect(spawn).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("Code not run: {workspace} has no value here", { duration: 4000 });
  });

  it("stays quiet while the workspace sleeps", () => {
    const { result } = setup(ws({ hibernated: true }));
    act(() => result.current.runAction(script));
    expect(toastError).not.toHaveBeenCalled();
    expect(getActionTab(script.id)).toBeUndefined();
  });

  it("stops by sending Ctrl+C to the tab it runs in", () => {
    linkActionTab(script.id, "tab-old");
    setScriptRunning("tab-old", "running");
    const { deps, result, write } = setup(ws(), { "tab-old": termTab("tab-old") });
    deps.terminalHandles.current.set("tab-old", { write });
    deps.scriptCommandSeen.current.add("tab-old");
    act(() => result.current.stopAction(script));
    expect(write).toHaveBeenCalledWith("\x03");
    expect(getScriptRunningSnapshot().get("tab-old")).toBe("waiting");
  });

  it("stop leaves alone a tab the user reused after the script ended", () => {
    linkActionTab(script.id, "tab-old");
    const { deps, result, write } = setup(ws(), { "tab-old": termTab("tab-old") });
    deps.terminalHandles.current.set("tab-old", { write });
    deps.scriptCommandSeen.current.add("tab-old");
    act(() => result.current.stopAction(script));
    expect(write).not.toHaveBeenCalled();
    expect(deps.revealTab).not.toHaveBeenCalled();
    expect(deps.activateTab).not.toHaveBeenCalled();
  });

  it("stop does nothing when the Action has no tab", () => {
    const { result, write } = setup(ws());
    act(() => result.current.stopAction(script));
    expect(write).not.toHaveBeenCalled();
  });

  it("focusActionTab reveals the tab it runs in and reports false without one", () => {
    const { deps, result } = setup(ws(), { "tab-old": termTab("tab-old") });
    expect(result.current.focusActionTab(script)).toBe(false);
    linkActionTab(script.id, "tab-old");
    expect(result.current.focusActionTab(script)).toBe(true);
    expect(deps.revealTab).toHaveBeenCalledWith("w1", "tab-old");
  });

  it("stop signals the script tree only when the command is still marked after Ctrl+C", () => {
    linkActionTab(script.id, "tab-old");
    setScriptRunning("tab-old", "running");
    const { result, write, deps } = setup(ws(), { "tab-old": termTab("tab-old", "/w") });
    deps.terminalHandles.current.set("tab-old", { write });
    deps.scriptCommandSeen.current.add("tab-old");
    act(() => result.current.stopAction(script));
    expect(write).toHaveBeenCalledWith("\x03");
    expect(ptyStop).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(700));
    expect(ptyStop).toHaveBeenCalledWith("tab-old");
  });

  it("stop never signals a tree whose command already ended", () => {
    linkActionTab(script.id, "tab-old");
    setScriptRunning("tab-old", "running");
    const { result, deps } = setup(ws(), { "tab-old": termTab("tab-old", "/w") });
    deps.scriptCommandSeen.current.add("tab-old");
    act(() => result.current.stopAction(script));
    clearScriptRunningEntry("tab-old");
    act(() => void vi.advanceTimersByTime(700));
    expect(ptyStop).not.toHaveBeenCalled();
  });

  it("F12 runs the active Action, and stops it when it is running", () => {
    const found: Record<string, Tab> = {};
    const { deps, result, write } = setup(ws(), found);
    act(() => result.current.toggleActiveAction());
    expect(deps.splitPaneAndOpenTab).toHaveBeenCalledTimes(1);
    const tabId = getActionTab(script.id) as string;
    found[tabId] = termTab(tabId);
    deps.terminalHandles.current.set(tabId, { write });
    act(() => result.current.toggleActiveAction());
    expect(write).toHaveBeenCalledWith("\x03");
    clearScriptRunningEntry(tabId);
  });

  it("F12 skips an active Action with no command", () => {
    const empty: Action = { ...script, id: "ac-e", command: "" };
    const { deps, result } = setup(ws({ actions: [empty, script], activeAction: "ac-e" }));
    act(() => result.current.toggleActiveAction());
    expect(deps.splitPaneAndOpenTab).toHaveBeenCalledTimes(1);
    clearScriptRunningEntry(getActionTab(script.id) as string);
  });
});
