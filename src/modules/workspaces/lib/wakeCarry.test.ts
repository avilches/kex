import { beforeEach, describe, expect, it } from "vitest";
import type { SleepingTab } from "./hibernate";
import { carryOnWake, dropWakeCarry, resetWakeCarry, wakeCarryOf } from "./wakeCarry";

const sleeping = (id: string, over: Partial<SleepingTab["hibernation"]> = {}): SleepingTab => ({
  id,
  kind: "terminal",
  title: "t",
  hibernation: { at: 1, ...over },
});

describe("wakeCarry", () => {
  beforeEach(resetWakeCarry);

  it("keeps the agent and the dot a tab slept with once it wakes", () => {
    carryOnWake([sleeping("a", { agent: "claude", indicator: "attention" })]);
    expect(wakeCarryOf("a")).toEqual({ agent: "claude", indicator: "attention" });
  });

  it("keeps nothing for a tab that slept with neither", () => {
    carryOnWake([sleeping("a")]);
    expect(wakeCarryOf("a")).toBeUndefined();
  });

  it("keeps the agent alone when there was no dot", () => {
    carryOnWake([sleeping("a", { agent: "claude" })]);
    expect(wakeCarryOf("a")).toEqual({ agent: "claude" });
  });

  it("forgets a tab once dropped", () => {
    carryOnWake([sleeping("a", { agent: "claude", indicator: "error" })]);
    dropWakeCarry("a");
    expect(wakeCarryOf("a")).toBeUndefined();
  });
});
