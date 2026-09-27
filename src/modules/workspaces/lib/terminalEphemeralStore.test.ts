import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearRunningCommandEntry,
  getRunningCommand,
  getRunningCommandsSnapshot,
  setRunningCommand,
  subscribeToRunningCommands,
} from "./terminalEphemeralStore";

beforeEach(() => {
  for (const tabId of Array.from(getRunningCommandsSnapshot().keys())) {
    clearRunningCommandEntry(tabId);
  }
});

describe("terminalEphemeralStore running commands", () => {
  it("getRunningCommand returns null for an unknown tab", () => {
    expect(getRunningCommand("tab-a")).toBeNull();
  });

  it("stores and retrieves a running command by tab id", () => {
    setRunningCommand("tab-a", "pnpm dev");
    expect(getRunningCommand("tab-a")).toBe("pnpm dev");
  });

  it("clearRunningCommandEntry removes only that tab's entry", () => {
    setRunningCommand("tab-a", "pnpm dev");
    setRunningCommand("tab-b", "pnpm test");
    clearRunningCommandEntry("tab-a");
    expect(getRunningCommand("tab-a")).toBeNull();
    expect(getRunningCommand("tab-b")).toBe("pnpm test");
  });

  // This is the invariant a per-tab useSyncExternalStore selector relies on:
  // a change to one tab's entry must not change the primitive value read for
  // an unrelated tab, so React bails out of re-rendering components that
  // only subscribed to that other tab.
  it("an unrelated tab's value is unaffected when another tab's command changes", () => {
    setRunningCommand("tab-a", "pnpm dev");
    const before = getRunningCommand("tab-b");
    setRunningCommand("tab-a", "pnpm build");
    const after = getRunningCommand("tab-b");
    expect(before).toBe(after);
  });

  it("subscribe notifies listeners on any change (global fan-out, per-tab read)", () => {
    const cb = vi.fn();
    const unsub = subscribeToRunningCommands(cb);
    setRunningCommand("tab-a", "pnpm dev");
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("setRunningCommand is a no-op when the command is unchanged", () => {
    setRunningCommand("tab-a", "pnpm dev");
    const cb = vi.fn();
    const unsub = subscribeToRunningCommands(cb);
    setRunningCommand("tab-a", "pnpm dev");
    expect(cb).not.toHaveBeenCalled();
    unsub();
  });
});
