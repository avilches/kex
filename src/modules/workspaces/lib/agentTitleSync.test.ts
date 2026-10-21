import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTitleCoalescer } from "./agentTitleSync";

describe("createTitleCoalescer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves the first change right away", () => {
    const apply = vi.fn();
    createTitleCoalescer(apply, 10_000).push("t1", "A");
    expect(apply).toHaveBeenCalledWith(new Map([["t1", "A"]]));
  });

  it("holds later changes until the window ends and sends all tabs in one save", () => {
    const apply = vi.fn();
    const c = createTitleCoalescer(apply, 10_000);
    c.push("t1", "A");
    vi.advanceTimersByTime(1000);
    c.push("t1", "B");
    c.push("t2", "X");
    vi.advanceTimersByTime(1000);
    c.push("t2", "Y");
    expect(apply).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(8000);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenLastCalledWith(new Map([["t1", "B"], ["t2", "Y"]]));
  });

  it("saves immediately again once the window has passed with nothing pending", () => {
    const apply = vi.fn();
    const c = createTitleCoalescer(apply, 10_000);
    c.push("t1", "A");
    vi.advanceTimersByTime(30_000);
    c.push("t1", "B");
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("flush sends what is pending and cancels the timer", () => {
    const apply = vi.fn();
    const c = createTitleCoalescer(apply, 10_000);
    c.push("t1", "A");
    vi.advanceTimersByTime(1000);
    c.push("t1", "B");
    expect(c.flush()).toBe(true);
    expect(apply).toHaveBeenLastCalledWith(new Map([["t1", "B"]]));
    vi.advanceTimersByTime(20_000);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(c.flush()).toBe(false);
  });
});
import type { AgentSession } from "@/modules/agents/lib/types";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { isHibernating } from "@/modules/agents/lib/hibernatingTabs";
import { restoreSnapshotTabIds } from "@/modules/agents/lib/agentSessionRestore";
import { setOscTitle } from "@/modules/terminal/lib/oscTitleStore";
import { startAgentTitleSync } from "./agentTitleSync";

vi.mock("@/modules/agents/lib/hibernatingTabs", () => ({
  isHibernating: vi.fn(() => false),
}));
vi.mock("@/modules/agents/lib/agentSessionRestore", () => ({
  restorePlansReady: vi.fn(() => Promise.resolve()),
  restoreSnapshotTabIds: vi.fn(() => new Set<string>()),
}));

function agentSession(tabId = "tab-1"): AgentSession {
  return {
    tabId,
    workspaceId: "ws-1",
    agent: "omp",
    status: "idle",
    startedAt: 0,
    lastActivityAt: 0,
    attentionSince: null,
    restored: false,
    restoreError: false,
    subagents: {},
    meta: {},
  };
}

describe("startAgentTitleSync - revocation", () => {
  let save: ReturnType<typeof vi.fn<(titles: Map<string, string>) => void>>;
  let revoke: ReturnType<typeof vi.fn<(tabIds: ReadonlySet<string>) => void>>;
  let stop: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    useAgentStore.setState({ sessions: {}, notifications: [] });
    vi.mocked(isHibernating).mockReturnValue(false);
    vi.mocked(restoreSnapshotTabIds).mockReturnValue(new Set());
    save = vi.fn();
    revoke = vi.fn();
  });
  afterEach(() => {
    stop?.();
    vi.useRealTimers();
  });

  it("deletes the persisted title when the session ends, and a stale save cannot bring it back", async () => {
    setOscTitle("tab-1", "pi > Kex");
    stop = startAgentTitleSync(save, revoke);
    await Promise.resolve();
    useAgentStore.setState({ sessions: { "tab-1": agentSession() } });
    expect(save).toHaveBeenCalledWith(new Map([["tab-1", "pi > Kex"]]));

    // A later title stays pending in the 10s save window while the session dies.
    setOscTitle("tab-1", "pi > Kex 2");
    useAgentStore.setState({ sessions: {} });
    expect(revoke).toHaveBeenCalledWith(new Set(["tab-1"]));

    vi.advanceTimersByTime(30_000);
    expect(save.mock.calls).toHaveLength(1);
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it("keeps the persisted title while the workspace hibernates: the wake reclaims it", () => {
    vi.mocked(isHibernating).mockReturnValue(true);
    setOscTitle("tab-1", "pi > Kex");
    stop = startAgentTitleSync(save, revoke);
    useAgentStore.setState({ sessions: { "tab-1": agentSession() } });
    useAgentStore.setState({ sessions: {} });
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(save.mock.calls).toHaveLength(1);
  });

  it("keeps the persisted title while a restore plan or staged snapshot may claim the tab", () => {
    vi.mocked(restoreSnapshotTabIds).mockReturnValue(new Set(["tab-1"]));
    setOscTitle("tab-1", "fixing the parser");
    stop = startAgentTitleSync(save, revoke);
    useAgentStore.setState({ sessions: { "tab-1": agentSession() } });
    useAgentStore.setState({ sessions: {} });
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(save.mock.calls).toHaveLength(1);
  });

  it("never touches a tab whose OSC title came from a non-agent shell", () => {
    stop = startAgentTitleSync(save, revoke);
    setOscTitle("tab-1", "vim /p/x");
    vi.advanceTimersByTime(60_000);
    expect(save).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it("revokes once the shield lifts: a plan consumed without the agent ever registering", async () => {
    vi.mocked(restoreSnapshotTabIds).mockReturnValue(new Set(["tab-1"]));
    setOscTitle("tab-1", "pi > Kex");
    stop = startAgentTitleSync(save, revoke);
    await Promise.resolve();
    useAgentStore.setState({ sessions: { "tab-1": agentSession() } });
    useAgentStore.setState({ sessions: {} });
    expect(revoke).not.toHaveBeenCalled();
    // The plan is consumed and no session ever registers: nothing claims the title anymore.
    vi.mocked(restoreSnapshotTabIds).mockReturnValue(new Set());
    useAgentStore.setState({ sessions: {}, notifications: [] });
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(save.mock.calls).toHaveLength(1);
    useAgentStore.setState({ sessions: {}, notifications: [] });
    expect(revoke).toHaveBeenCalledTimes(1);
  });
});
