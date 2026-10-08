import { describe, expect, test } from "vitest";
import {
  buildAgentEntries,
  entriesByWorkspace,
  nextEntryTab,
} from "./notificationList";
import type { AgentNotification, AgentSession } from "./types";

const session = (
  tabId: string,
  workspaceId: string,
  status: AgentSession["status"],
): AgentSession => ({
  tabId,
  workspaceId,
  agent: "claude",
  status,
  startedAt: 1,
  lastActivityAt: 1,
  attentionSince: status === "attention" ? 1 : null,
  restored: false,
  restoreError: false,
});

const errorNotif = (tabId: string, workspaceId: string): AgentNotification => ({
  id: "n1",
  source: "terminal",
  tabId,
  workspaceId,
  agent: "claude",
  kind: "error",
  at: 1,
  read: false,
});

describe("buildAgentEntries with live tab locations", () => {
  test("drops agents whose tab is closed", () => {
    const entries = buildAgentEntries(
      { a: session("a", "w1", "attention") },
      [errorNotif("b", "w1")],
      { c: "w1" },
    );
    expect(entries).toEqual([]);
  });

  test("uses the live workspace instead of the stored one", () => {
    const entries = buildAgentEntries(
      { a: session("a", "old", "working") },
      [],
      { a: "w2" },
    );
    expect(entries[0].workspaceId).toBe("w2");
  });

  test("null locations keep everything (not reported yet)", () => {
    expect(
      buildAgentEntries({ a: session("a", "w1", "working") }, [], null),
    ).toHaveLength(1);
  });
});

describe("entriesByWorkspace and nextEntryTab", () => {
  const entries = buildAgentEntries(
    {
      a: session("a", "w1", "working"),
      b: session("b", "w1", "attention"),
      c: session("c", "w2", "working"),
    },
    [],
    { a: "w1", b: "w1", c: "w2" },
  );

  test("groups by workspace, most urgent first", () => {
    const by = entriesByWorkspace(entries);
    expect(by.w1.map((e) => e.tabId)).toEqual(["b", "a"]);
    expect(by.w2.map((e) => e.tabId)).toEqual(["c"]);
  });

  test("walks the list on repeated jumps and wraps around", () => {
    const w1 = entriesByWorkspace(entries).w1;
    expect(nextEntryTab(w1, undefined)).toBe("b");
    expect(nextEntryTab(w1, "b")).toBe("a");
    expect(nextEntryTab(w1, "a")).toBe("b");
  });

  test("restarts at the first entry when the last visit is gone", () => {
    const w1 = entriesByWorkspace(entries).w1;
    expect(nextEntryTab(w1, "cleared")).toBe("b");
    expect(nextEntryTab([], "b")).toBeNull();
  });
});
