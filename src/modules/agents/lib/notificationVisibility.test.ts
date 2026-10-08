import { describe, expect, test } from "vitest";
import { buildAgentEntries, workspaceAgentVisuals } from "./notificationList";
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

describe("workspaceAgentVisuals", () => {
  test("attention beats working, per workspace", () => {
    const entries = buildAgentEntries(
      {
        a: session("a", "w1", "working"),
        b: session("b", "w1", "attention"),
        c: session("c", "w2", "working"),
      },
      [],
      { a: "w1", b: "w1", c: "w2" },
    );
    expect(workspaceAgentVisuals(entries)).toEqual({
      w1: "attention",
      w2: "working",
    });
  });
});
