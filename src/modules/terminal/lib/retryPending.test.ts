import { describe, expect, it, vi } from "vitest";
import { discardPendingFlow, type RestoreBlock } from "./restoreStart";

const agentBlock: RestoreBlock = { reason: "old", dir: "/work", command: "claude", agent: "claude", restorable: true };

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
