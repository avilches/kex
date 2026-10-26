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
const fsStat = vi.hoisted(() => vi.fn((_path: string): Promise<{ kind: string }> => Promise.resolve({ kind: "dir" })));
vi.mock("@/lib/native", () => ({
  native: { actionSpawn: spawn, fsStat, ptyStop },
}));
vi.mock("sonner", () => ({ toast: { error: toastError } }));
const scriptCommand = vi.hoisted(() => vi.fn());
vi.mock("@/modules/workspaces/lib/terminalEphemeralStore", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/modules/workspaces/lib/terminalEphemeralStore")>();
  return {
    ...real,
    setScriptCommand: (tabId: string, command: string) => {
      scriptCommand(tabId, command);
      real.setScriptCommand(tabId, command);
    },
  };
});
vi.mock("@/modules/terminal/lib/useTerminalSession", () => ({ requestLeafFocus: vi.fn() }));
vi.mock("@/modules/workspace", () => ({
  useWorkspaceEnvStore: { getState: () => ({ env: { kind: "local" } }) },
}));

const script: Action = { id: "ac-s", name: "Dev", kind: "script", command: "npm run dev", cwdMode: "workspace", ownButton: true };
const app: Action = { id: "ac-a", name: "Code", kind: "app", command: "code {workspace}", ownButton: true };

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

function setup(workspace: Workspace, found: Record<string, Tab> = {}, others: Workspace[] = []) {
  const write = vi.fn();
  const deps = {
    activeWorkspace: workspace,
    activeWorkspaceId: workspace.id,
    findWorkspace: (id: string) => [workspace, ...others].find((w) => w.id === id),
    findTabGlobal: (id: string) =>
      found[id] ? { workspace, pane: { id: "p-other" }, tab: found[id] } : null,
    setActiveWorkspaceId: vi.fn(),
    activateTab: vi.fn(),
    revealTab: vi.fn(),
    focusPane: vi.fn(),
    openTab: vi.fn(),
    splitPaneAndOpenTab: vi.fn(() => "p-scripts"),
    setScriptPaneId: vi.fn(),
    wakeTab: vi.fn(async () => {}),
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
  scriptCommand.mockClear();
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

  it("wakes a linked sleeping shell with nothing to restore and reuses it", () => {
    linkActionTab(script.id, "tab-old");
    const asleep: Tab = { id: "tab-old", kind: "terminal", cwd: "/w", hibernation: { at: 1 } };
    const { deps, result } = setup(ws(), { "tab-old": asleep });
    act(() => result.current.runAction(script));
    expect(deps.wakeTab).toHaveBeenCalledWith("w1", "tab-old");
    expect(deps.openTab).not.toHaveBeenCalled();
    expect(deps.splitPaneAndOpenTab).not.toHaveBeenCalled();
    expect(getScriptRunningSnapshot().get("tab-old")).toBe("running");
  });

  it("opens a new tab instead of waking one that would come back running its Run on start command", () => {
    linkActionTab(script.id, "tab-old");
    const asleep: Tab = { id: "tab-old", kind: "terminal", cwd: "/w", hibernation: { at: 1, command: "pnpm dev" } };
    const { deps, result } = setup(ws(), { "tab-old": asleep });
    act(() => result.current.runAction(script));
    expect(deps.wakeTab).not.toHaveBeenCalled();
    expect(deps.splitPaneAndOpenTab).toHaveBeenCalledTimes(1);
    clearScriptRunningEntry(getActionTab(script.id) as string);
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

  it("stays quiet while the focused tab sleeps and the Action reads its folder", () => {
    const here: Action = { ...script, id: "ac-here", command: "ls {cwd}" };
    const asleep: Tab = { id: "tab-user", kind: "terminal", hibernation: { at: 1 } };
    const { result } = setup(
      ws({ paneTree: { kind: "pane", id: "p1", tabs: [asleep], activeTabId: "tab-user" } }),
    );
    act(() => result.current.runAction(here));
    expect(toastError).not.toHaveBeenCalled();
    expect(getActionTab(here.id)).toBeUndefined();
  });

  it("opens a new tab per click of an agent, with no link and no running mark", () => {
    const agent: Action = { id: "ac-g", name: "Claude", kind: "agent", command: "claude", cwdMode: "workspace", ownButton: true };
    const { deps, result, write } = setup(ws());
    act(() => result.current.runAction(agent));
    act(() => result.current.runAction(agent));
    expect(deps.openTab).toHaveBeenCalledTimes(2);
    const tabs = deps.openTab.mock.calls.map((c) => (c as unknown[])[2] as Tab);
    expect(tabs[0].id).not.toBe(tabs[1].id);
    expect(tabs[0]).toMatchObject({ kind: "terminal", title: "Claude", cwd: "/w" });
    expect(deps.openTab).toHaveBeenCalledWith("w1", "p1", tabs[0]);
    expect(deps.activateTab).toHaveBeenCalledWith("w1", tabs[1].id);
    expect(deps.setScriptPaneId).not.toHaveBeenCalled();
    expect(deps.splitPaneAndOpenTab).not.toHaveBeenCalled();
    expect(getActionTab(agent.id)).toBeUndefined();
    expect(getScriptRunningSnapshot().has(tabs[0].id)).toBe(false);
    deps.terminalHandles.current.set(tabs[0].id, { write });
    act(() => void vi.advanceTimersByTime(500));
    expect(write).toHaveBeenCalledWith("claude\r");
  });

  it("runs an agent in the workspace its overlay names, and makes it the active one", () => {
    const agent: Action = { id: "ac-g", name: "Claude", kind: "agent", command: "claude", cwdMode: "context", ownButton: true };
    const other = ws({ id: "w2", workspaceRoot: "/o", cwd: "/o", paneTree: { kind: "pane", id: "p9", tabs: [], activeTabId: null }, activePaneId: "p9" });
    const { deps, result } = setup(ws(), {}, [other]);
    act(() => result.current.runAction(agent, { focusFolder: "/o/src", workspaceId: "w2" }));
    expect(deps.setActiveWorkspaceId).toHaveBeenCalledWith("w2");
    expect(deps.openTab).toHaveBeenCalledTimes(1);
    expect(deps.openTab).toHaveBeenCalledWith("w2", "p9", expect.objectContaining({ kind: "terminal", cwd: "/o/src" }));
  });

  it("does not change the active workspace for a run in the active one", () => {
    const agent: Action = { id: "ac-g", name: "Claude", kind: "agent", command: "claude", cwdMode: "workspace", ownButton: true };
    const { deps, result } = setup(ws());
    act(() => result.current.runAction(agent, { workspaceId: "w1" }));
    expect(deps.setActiveWorkspaceId).not.toHaveBeenCalled();
  });

  it("types an agent's line when its terminal handle only appears on a later retry", () => {
    const agent: Action = { id: "ac-g", name: "Claude", kind: "agent", command: "claude", cwdMode: "workspace", ownButton: true };
    const { deps, result, write } = setup(ws());
    act(() => result.current.runAction(agent));
    const tab = (deps.openTab.mock.calls[0] as unknown[])[2] as Tab;
    act(() => void vi.advanceTimersByTime(650));
    expect(write).not.toHaveBeenCalled();
    deps.terminalHandles.current.set(tab.id, { write });
    act(() => void vi.advanceTimersByTime(100));
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("claude\r");
    act(() => void vi.advanceTimersByTime(5000));
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("gives up on an agent's line in silence when its terminal never shows up", () => {
    const agent: Action = { id: "ac-g", name: "Claude", kind: "agent", command: "claude", cwdMode: "workspace", ownButton: true };
    const { deps, result, write } = setup(ws());
    act(() => result.current.runAction(agent));
    const tab = (deps.openTab.mock.calls[0] as unknown[])[2] as Tab;
    act(() => void vi.advanceTimersByTime(10_000));
    expect(vi.getTimerCount()).toBe(0);
    deps.terminalHandles.current.set(tab.id, { write });
    act(() => void vi.advanceTimersByTime(1000));
    expect(write).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(getScriptRunningSnapshot().has(tab.id)).toBe(false);
  });

  it("never records a script command for an agent's tab, while a script's tab gets one", () => {
    const agent: Action = { id: "ac-g", name: "Claude", kind: "agent", command: "claude", cwdMode: "workspace", ownButton: true };
    const { deps, result } = setup(ws());
    act(() => result.current.runAction(agent));
    expect(scriptCommand).not.toHaveBeenCalled();
    act(() => result.current.runAction(script));
    const tab = (deps.splitPaneAndOpenTab.mock.calls[0] as unknown[])[3] as Tab;
    expect(scriptCommand).toHaveBeenCalledWith(tab.id, script.command);
    clearScriptRunningEntry(tab.id);
  });

  it("tells the user when the folder an agent starts in is gone", async () => {
    fsStat.mockImplementationOnce(() => Promise.reject(new Error("missing")));
    const agent: Action = { id: "ac-g", name: "Claude", kind: "agent", command: "claude", cwdMode: "fixed", cwd: "/gone", ownButton: true };
    const { result } = setup(ws());
    act(() => result.current.runAction(agent));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fsStat).toHaveBeenCalledWith("/gone");
    expect(toastError).toHaveBeenCalledWith("Claude not run: the folder /gone does not exist", { duration: 6000 });
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
    expect(deps.activateTab).toHaveBeenCalledWith("w1", "tab-old");
    expect(deps.revealTab).not.toHaveBeenCalled();
  });

  it("a second stop on the still-marked script signals its tree instead of typing again", () => {
    linkActionTab(script.id, "tab-old");
    setScriptRunning("tab-old", "waiting");
    const { result, write, deps } = setup(ws(), { "tab-old": termTab("tab-old", "/w") });
    deps.scriptCommandSeen.current.add("tab-old");
    act(() => result.current.stopAction(script));
    expect(write).not.toHaveBeenCalled();
    expect(ptyStop).toHaveBeenCalledWith("tab-old");
    expect(getScriptRunningSnapshot().get("tab-old")).toBe("waiting");
  });

  it("a stop on a script whose command ended does nothing at all", () => {
    linkActionTab(script.id, "tab-old");
    const { result, write } = setup(ws(), { "tab-old": termTab("tab-old", "/w") });
    act(() => result.current.stopAction(script));
    expect(write).not.toHaveBeenCalled();
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
