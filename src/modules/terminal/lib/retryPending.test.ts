import { describe, expect, it, vi } from "vitest";
import type { RestorePlan } from "@/modules/agents/lib/agentSessionRestore";
import {
  discardPendingFlow,
  retryPendingFlow,
  type RestoreBlock,
  type RetryPendingDeps,
} from "./restoreStart";

const plan = (over: Partial<RestorePlan> = {}): RestorePlan => ({
  tabId: "t1",
  agent: "claude",
  resumeCmd: "",
  attemptedCmd: "",
  cwdLaunch: "/work",
  errorReason: "",
  ...over,
});

const agentBlock: RestoreBlock = { reason: "old", dir: "/work", command: "claude", agent: "claude", restorable: true };
const cmdBlock: RestoreBlock = { reason: "old", dir: "/proj", command: "npm run dev", restorable: true };

function mk(block: RestoreBlock | null, over: Partial<RetryPendingDeps> = {}) {
  let pending = block;
  const calls = {
    write: vi.fn((_line: string) => Promise.resolve()),
    adopt: vi.fn(),
    markBlocked: vi.fn(),
    stillBlocked: vi.fn(),
    clearPlaceholder: vi.fn(),
  };
  const d: RetryPendingDeps = {
    leafId: "leaf",
    isWindows: false,
    getBlock: () => pending,
    setPending: (b) => {
      pending = b;
    },
    isAgentRunning: () => false,
    previewPlan: () => Promise.resolve(null),
    checkDir: () => Promise.resolve(null),
    isStale: () => false,
    ...calls,
    ...over,
  };
  return { d, calls, pending: () => pending };
}

describe("retryPendingFlow", () => {
  it("agent plan ok: clears pending and the placeholder, adopts the plan, types the resume line", async () => {
    const p = plan({ resumeCmd: "claude --resume 'a'" });
    const t = mk(agentBlock, { previewPlan: () => Promise.resolve(p) });
    await retryPendingFlow(t.d);
    expect(t.pending()).toBeNull();
    expect(t.calls.clearPlaceholder).toHaveBeenCalled();
    expect(t.calls.adopt).toHaveBeenCalledWith(p);
    expect(t.calls.write).toHaveBeenCalledWith("cd /work && claude --resume 'a'\r");
  });

  it("agent plan error: stays pending with the new reason, marks the tab, writes nothing", async () => {
    const t = mk(agentBlock, { previewPlan: () => Promise.resolve(plan({ errorReason: "still gone" })) });
    await retryPendingFlow(t.d);
    expect(t.pending()?.reason).toBe("still gone");
    expect(t.calls.markBlocked).toHaveBeenCalledWith(expect.objectContaining({ reason: "still gone" }));
    expect(t.calls.stillBlocked).toHaveBeenCalledWith(expect.objectContaining({ reason: "still gone" }));
    expect(t.calls.write).not.toHaveBeenCalled();
    expect(t.calls.clearPlaceholder).not.toHaveBeenCalled();
  });

  it("agent plan gone: clears pending and writes nothing", async () => {
    const t = mk(agentBlock);
    await retryPendingFlow(t.d);
    expect(t.pending()).toBeNull();
    expect(t.calls.write).not.toHaveBeenCalled();
    expect(t.calls.adopt).not.toHaveBeenCalled();
  });

  it("saved command with a good dir: types cd && command and clears pending", async () => {
    const t = mk(cmdBlock);
    await retryPendingFlow(t.d);
    expect(t.pending()).toBeNull();
    expect(t.calls.write).toHaveBeenCalledWith("cd /proj && npm run dev\r");
    expect(t.calls.stillBlocked).not.toHaveBeenCalled();
    expect(t.calls.adopt).not.toHaveBeenCalled();
    expect(t.calls.markBlocked).not.toHaveBeenCalled();
  });

  it("saved command with a still-bad dir: keeps pending with the new reason and writes nothing", async () => {
    const t = mk(cmdBlock, { checkDir: () => Promise.resolve("not a directory") });
    await retryPendingFlow(t.d);
    expect(t.pending()?.reason).toBe("not a directory");
    expect(t.calls.write).not.toHaveBeenCalled();
    expect(t.calls.markBlocked).not.toHaveBeenCalled();
    expect(t.calls.stillBlocked).toHaveBeenCalledWith(expect.objectContaining({ reason: "not a directory" }));
  });

  it("bails out and clears pending when an agent already runs in the shell", async () => {
    const t = mk(cmdBlock, { isAgentRunning: () => true });
    await retryPendingFlow(t.d);
    expect(t.pending()).toBeNull();
    expect(t.calls.write).not.toHaveBeenCalled();
  });

  it("bails out when an agent started while the check was awaiting", async () => {
    let running = false;
    const t = mk(cmdBlock, {
      isAgentRunning: () => running,
      checkDir: () => {
        running = true;
        return Promise.resolve(null);
      },
    });
    await retryPendingFlow(t.d);
    expect(t.pending()).toBeNull();
    expect(t.calls.write).not.toHaveBeenCalled();
  });

  it("does nothing when the tab went stale during the check", async () => {
    const t = mk(cmdBlock, { isStale: () => true });
    await retryPendingFlow(t.d);
    expect(t.pending()).toBe(cmdBlock);
    expect(t.calls.write).not.toHaveBeenCalled();
  });

  it("ignores a second activation while one is in flight", async () => {
    let release: (v: string | null) => void = () => {};
    const t = mk(cmdBlock, { checkDir: () => new Promise((r) => (release = r)) });
    const first = retryPendingFlow(t.d);
    await retryPendingFlow(t.d);
    release(null);
    await first;
    expect(t.calls.write).toHaveBeenCalledTimes(1);
  });

  it("releases the in-flight guard when the check throws", async () => {
    const bad = mk(cmdBlock, { checkDir: () => Promise.reject(new Error("boom")) });
    await expect(retryPendingFlow(bad.d)).rejects.toThrow("boom");
    const ok = mk(cmdBlock);
    await retryPendingFlow(ok.d);
    expect(ok.calls.write).toHaveBeenCalledTimes(1);
  });
});

describe("discardPendingFlow", () => {
  function mkd(running: boolean, block: RestoreBlock | null) {
    let pending = block;
    const clearPlaceholder = vi.fn();
    const detach = vi.fn(() => Promise.resolve());
    return {
      clearPlaceholder,
      detach,
      pending: () => pending,
      d: {
        leafId: "l",
        getBlock: () => pending,
        setPending: (b: RestoreBlock | null) => {
          pending = b;
        },
        isAgentRunning: () => running,
        clearPlaceholder,
        detach,
      },
    };
  }

  it("removes the placeholder and the stored record of an agent plan", async () => {
    const t = mkd(false, agentBlock);
    await discardPendingFlow(t.d);
    expect(t.pending()).toBeNull();
    expect(t.clearPlaceholder).toHaveBeenCalled();
    expect(t.detach).toHaveBeenCalled();
  });

  it("never touches the record of a live agent session", async () => {
    const t = mkd(true, agentBlock);
    await discardPendingFlow(t.d);
    expect(t.pending()).toBeNull();
    expect(t.clearPlaceholder).not.toHaveBeenCalled();
    expect(t.detach).not.toHaveBeenCalled();
  });

  it("only clears pending for a saved command", async () => {
    const t = mkd(false, { ...agentBlock, agent: undefined });
    await discardPendingFlow(t.d);
    expect(t.detach).not.toHaveBeenCalled();
  });
});
