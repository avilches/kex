import { afterEach, describe, expect, it } from "vitest";
import {
  actionForTab,
  actionsToUnlink,
  unlinkRemovedActions,
  actionStates,
  getActionTab,
  getActionTabsSnapshot,
  linkActionTab,
  sameStates,
  unlinkActionTab,
  unlinkTab,
} from "./actionStateStore";
import { getActionStatesSnapshot } from "./useActionStates";
import {
  clearScriptRunningEntry,
  getScriptRunningSnapshot,
  setScriptRunning,
} from "@/modules/workspaces/lib/terminalEphemeralStore";

afterEach(() => {
  for (const id of ["a", "b"]) unlinkActionTab(id);
  for (const t of ["t1", "t2"]) clearScriptRunningEntry(t);
});

describe("action to tab links", () => {
  it("links, reads and unlinks", () => {
    linkActionTab("a", "t1");
    expect(getActionTab("a")).toBe("t1");
    unlinkActionTab("a");
    expect(getActionTab("a")).toBeUndefined();
  });

  it("publishes a new snapshot only when something changes", () => {
    linkActionTab("a", "t1");
    const first = getActionTabsSnapshot();
    linkActionTab("a", "t1");
    expect(getActionTabsSnapshot()).toBe(first);
    linkActionTab("a", "t2");
    expect(getActionTabsSnapshot()).not.toBe(first);
  });

  it("drops every link to a tab that went away", () => {
    linkActionTab("a", "t1");
    linkActionTab("b", "t1");
    unlinkTab("t1");
    expect(getActionTab("a")).toBeUndefined();
    expect(getActionTab("b")).toBeUndefined();
  });

  it("finds the Action that ran in a tab", () => {
    linkActionTab("a", "t1");
    expect(actionForTab("t1")).toBe("a");
    expect(actionForTab("t2")).toBeUndefined();
  });
});

describe("actionStates", () => {
  it("shows the mark of the tab each Action runs in and omits idle ones", () => {
    const links = new Map([["a", "t1"], ["b", "t2"]]);
    const marks = new Map([["t1", "running" as const]]);
    expect([...actionStates(links, marks)]).toEqual([["a", "running"]]);
  });

  it("compares states by value", () => {
    expect(sameStates(new Map([["a", "running" as const]]), new Map([["a", "running" as const]]))).toBe(true);
    expect(sameStates(new Map([["a", "running" as const]]), new Map([["a", "waiting" as const]]))).toBe(false);
    expect(sameStates(new Map(), new Map([["a", "running" as const]]))).toBe(false);
  });
});

describe("useActionStates snapshot", () => {
  it("follows the tab marks and keeps its reference when nothing visible changed", () => {
    linkActionTab("a", "t1");
    const idle = getActionStatesSnapshot();
    expect(idle.size).toBe(0);
    setScriptRunning("t1", "running");
    const running = getActionStatesSnapshot();
    expect(running.get("a")).toBe("running");
    expect(getActionStatesSnapshot()).toBe(running);
    setScriptRunning("t2", "running");
    expect(getActionStatesSnapshot()).toBe(running);
    setScriptRunning("t1", "waiting");
    expect(getActionStatesSnapshot().get("a")).toBe("waiting");
    clearScriptRunningEntry("t1");
    expect(getActionStatesSnapshot().size).toBe(0);
  });
});

describe("actionsToUnlink", () => {
  const a = { id: "a", name: "A", runInTerminal: true, command: "x", ownButton: true };
  const b = { ...a, id: "b" };

  it("lists Actions that disappeared", () => {
    expect(actionsToUnlink([a, b], [b])).toEqual(["a"]);
    expect(actionsToUnlink([a], [])).toEqual(["a"]);
  });

  it("lists Actions that switched between script and app", () => {
    expect(actionsToUnlink([a], [{ ...a, runInTerminal: false }])).toEqual(["a"]);
  });

  it("ignores edits that keep the Action what it was", () => {
    expect(actionsToUnlink([a], [{ ...a, name: "Renamed", command: "y" }])).toEqual([]);
    expect(actionsToUnlink([a], [a, b])).toEqual([]);
  });
});

describe("unlinkRemovedActions", () => {
  const a = { id: "a", name: "A", runInTerminal: true, command: "x", ownButton: true };

  it("drops the link and the running mark of a deleted Action, so nothing stays stuck", () => {
    linkActionTab("a", "t1");
    setScriptRunning("t1", "running");
    unlinkRemovedActions([a], []);
    expect(getActionTab("a")).toBeUndefined();
    expect(getScriptRunningSnapshot().has("t1")).toBe(false);
  });

  it("drops the link when the Action stops being a script", () => {
    linkActionTab("a", "t1");
    setScriptRunning("t1", "running");
    unlinkRemovedActions([a], [{ ...a, runInTerminal: false }]);
    expect(getActionTab("a")).toBeUndefined();
    expect(getScriptRunningSnapshot().has("t1")).toBe(false);
  });

  it("leaves a still existing Action alone", () => {
    linkActionTab("a", "t1");
    setScriptRunning("t1", "running");
    unlinkRemovedActions([a], [{ ...a, name: "B" }]);
    expect(getActionTab("a")).toBe("t1");
    expect(getScriptRunningSnapshot().get("t1")).toBe("running");
  });

  it("keeps the mark when another Action still runs in the same tab", () => {
    linkActionTab("a", "t1");
    linkActionTab("b", "t1");
    setScriptRunning("t1", "running");
    unlinkRemovedActions([a], []);
    expect(getScriptRunningSnapshot().get("t1")).toBe("running");
    unlinkActionTab("b");
  });
});
