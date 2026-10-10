import { describe, expect, it } from "vitest";
import { detachesRecord, endsAgentSession, isRunningAgentSession } from "./sessionEndPolicy";
import type { AgentSession } from "./types";

describe("endsAgentSession", () => {
  it("ends the session when the agent process exits", () => {
    expect(endsAgentSession("exited")).toBe(true);
  });

  it("keeps the session when a turn fails, since the process is still alive", () => {
    expect(endsAgentSession("StopFailure")).toBe(false);
  });

  it("keeps the session on SessionEnd, which /clear and /resume also emit", () => {
    expect(endsAgentSession("SessionEnd")).toBe(false);
  });

  it("keeps the session for every other signal", () => {
    for (const kind of ["started", "UserPromptSubmit", "Notification", "Stop", "PermissionRequest", "MessageDisplay"] as const) {
      expect(endsAgentSession(kind)).toBe(false);
    }
  });
});

describe("detachesRecord", () => {
  it("drops the stored record when the agent exits on a normal tab", () => {
    expect(detachesRecord("exited", false)).toBe(true);
  });

  it("keeps the record when the exit comes from hibernating the workspace", () => {
    expect(detachesRecord("exited", true)).toBe(false);
  });

  it("never drops it for signals that do not end the session", () => {
    expect(detachesRecord("Stop", false)).toBe(false);
  });
});

describe("isRunningAgentSession", () => {
  const base: AgentSession = {
    tabId: "tab-1",
    workspaceId: "ws-1",
    agent: "claude",
    status: "idle",
    startedAt: 0,
    lastActivityAt: 0,
    attentionSince: null,
    restored: false,
    restoreError: false,
  };

  it("is false when the tab has no session", () => {
    expect(isRunningAgentSession(undefined)).toBe(false);
  });

  it("is true for a live session", () => {
    expect(isRunningAgentSession(base)).toBe(true);
  });

  it("is false for the placeholder left by a failed restore", () => {
    expect(isRunningAgentSession({ ...base, restoreError: true })).toBe(false);
  });
});
