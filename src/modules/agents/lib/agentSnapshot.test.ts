import { describe, expect, it } from "vitest";
import { agentSnapshot, changedSnapshots } from "./agentSnapshot";
import type { AgentNotification, AgentSession } from "./types";

function session(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    tabId: "t1",
    workspaceId: "ws",
    agent: "claude",
    status: "idle",
    startedAt: 0,
    lastActivityAt: 0,
    attentionSince: null,
    restored: false,
    restoreError: false,
    subagents: {},
    meta: { sessionId: "s1" },
    ...overrides,
  };
}

function notif(overrides: Partial<AgentNotification> = {}): AgentNotification {
  return {
    id: "n1",
    source: "terminal",
    tabId: "t1",
    workspaceId: "ws",
    agent: "claude",
    kind: "finished",
    at: 0,
    read: false,
    ...overrides,
  };
}

describe("agentSnapshot", () => {
  it("prefers the agent's title over the session title", () => {
    const s = session({ meta: { sessionId: "s1", sessionTitle: "from hook" } });
    expect(agentSnapshot(s, "from osc", []).title).toBe("from osc");
    expect(agentSnapshot(s, undefined, []).title).toBe("from hook");
    expect(agentSnapshot(session(), undefined, []).title).toBe("");
  });

  it("reports an unread notification of the tab by its kind", () => {
    expect(agentSnapshot(session(), undefined, [notif({ kind: "error" })]).notification).toBe("error");
  });

  it("ignores read notifications and those of other tabs", () => {
    expect(agentSnapshot(session(), undefined, [notif({ read: true })]).notification).toBe("");
    expect(agentSnapshot(session(), undefined, [notif({ tabId: "t2" })]).notification).toBe("");
  });

  it("stores a working or already interrupted session as interrupted, over any notification", () => {
    expect(agentSnapshot(session({ status: "working" }), undefined, [notif()]).notification).toBe("interrupted");
    expect(agentSnapshot(session({ interrupted: true }), undefined, []).notification).toBe("interrupted");
  });

  it("falls back to attention when only the session dot is raised", () => {
    expect(agentSnapshot(session({ status: "attention" }), undefined, []).notification).toBe("attention");
  });
});

describe("changedSnapshots", () => {
  const titleOf = (t: string) => (t === "t1" ? "one" : undefined);

  it("reports every session the first time and nothing when they did not change", () => {
    const sessions = { t1: session() };
    const first = changedSnapshots(sessions, [], titleOf, new Map());
    expect(first.changes).toHaveLength(1);
    expect(first.changes[0].snapshot).toEqual({ title: "one", notification: "" });

    const second = changedSnapshots(sessions, [], titleOf, first.sent);
    expect(second.changes).toHaveLength(0);
  });

  it("reports a tab again when its notification appears or clears", () => {
    const sessions = { t1: session() };
    const base = changedSnapshots(sessions, [], titleOf, new Map()).sent;

    const raised = changedSnapshots(sessions, [notif()], titleOf, base);
    expect(raised.changes[0].snapshot.notification).toBe("finished");

    const cleared = changedSnapshots(sessions, [notif({ read: true })], titleOf, raised.sent);
    expect(cleared.changes[0].snapshot.notification).toBe("");
  });

  it("forgets ended sessions so a new one on the same tab is sent again, and skips failed restores", () => {
    const first = changedSnapshots({ t1: session() }, [], titleOf, new Map());
    const gone = changedSnapshots({}, [], titleOf, first.sent);
    expect(gone.sent.size).toBe(0);
    expect(changedSnapshots({ t1: session() }, [], titleOf, gone.sent).changes).toHaveLength(1);

    const failed = changedSnapshots({ t1: session({ restoreError: true }) }, [], titleOf, new Map());
    expect(failed.changes).toHaveLength(0);
  });

  it("carries the session id, resends after a new session id on the same tab, and waits for the id", () => {
    const first = changedSnapshots({ t1: session() }, [], titleOf, new Map());
    expect(first.changes[0].sessionId).toBe("s1");

    const cleared = changedSnapshots({ t1: session({ meta: { sessionId: "s2" } }) }, [], titleOf, first.sent);
    expect(cleared.changes.map((c) => c.sessionId)).toEqual(["s2"]);

    const unknown = changedSnapshots({ t1: session({ meta: undefined }) }, [], titleOf, new Map());
    expect(unknown.changes).toHaveLength(0);
    expect(unknown.sent.size).toBe(0);
  });
});
