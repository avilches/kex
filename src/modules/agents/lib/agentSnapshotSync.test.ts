// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import { _clearAll, setOscTitle } from "@/modules/terminal/lib/oscTitleStore";
import { useAgentStore } from "../store/agentStore";
import { startAgentSnapshotSync } from "./agentSnapshotSync";

let stop: (() => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  invoke.mockReset();
  invoke.mockResolvedValue(true);
  useAgentStore.setState({ sessions: {}, notifications: [], closedSessions: {} });
  _clearAll();
});

afterEach(() => {
  stop?.();
  stop = null;
  vi.useRealTimers();
});

describe("startAgentSnapshotSync", () => {
  it("sends a changed tab once, 1.5s after the last change", () => {
    stop = startAgentSnapshotSync();
    useAgentStore.getState().startIdle("t1", "ws", "claude");
    setOscTitle("t1", "fixing the build");
    vi.advanceTimersByTime(1400);
    expect(invoke).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("agent_session_set_snapshot", {
      tabId: "t1",
      title: "fixing the build",
      notification: "",
    });

    vi.advanceTimersByTime(5000);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("sends the tab again on its next change when Rust had no record for it", async () => {
    invoke.mockResolvedValue(false);
    stop = startAgentSnapshotSync();
    useAgentStore.getState().startIdle("t1", "ws", "claude");
    vi.advanceTimersByTime(1600);
    await Promise.resolve();
    await Promise.resolve();

    useAgentStore.setState((s) => ({ sessions: { ...s.sessions } }));
    vi.advanceTimersByTime(1600);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("does not resend a tab Rust accepted when nothing about it changed", async () => {
    stop = startAgentSnapshotSync();
    useAgentStore.getState().startIdle("t1", "ws", "claude");
    vi.advanceTimersByTime(1600);
    await Promise.resolve();
    await Promise.resolve();

    useAgentStore.setState((s) => ({ sessions: { ...s.sessions } }));
    vi.advanceTimersByTime(1600);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("also sends the tab again after a failed call", async () => {
    invoke.mockRejectedValue(new Error("ipc down"));
    stop = startAgentSnapshotSync();
    useAgentStore.getState().startIdle("t1", "ws", "claude");
    vi.advanceTimersByTime(1600);
    await Promise.resolve();
    await Promise.resolve();

    useAgentStore.setState((s) => ({ sessions: { ...s.sessions } }));
    vi.advanceTimersByTime(1600);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("flushes a pending change when the window is about to unload", () => {
    stop = startAgentSnapshotSync();
    useAgentStore.getState().startIdle("t1", "ws", "claude");
    window.dispatchEvent(new Event("beforeunload"));
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("flushes a pending change when stopped", () => {
    stop = startAgentSnapshotSync();
    useAgentStore.getState().startIdle("t1", "ws", "claude");
    stop();
    stop = null;
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
