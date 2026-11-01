// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./agentIntegration", () => ({
  AgentNotDetectedError: class extends Error {},
  agentStatus: () => Promise.resolve("missing"),
  installAgent: () => Promise.resolve(),
  removeAgent: () => Promise.resolve(),
}));

import { useIntegration } from "./useIntegration";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function busyFor(press: (s: ReturnType<typeof useIntegration>) => Promise<boolean>): Promise<number> {
  const { result } = renderHook(() => useIntegration("claude", { minBusyMs: 500, busyJitterMs: 400 }));
  let done = false;
  await act(async () => {
    void press(result.current).then(() => {
      done = true;
    });
  });
  let elapsed = 0;
  while (!done) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    elapsed += 50;
  }
  return elapsed;
}

describe("useIntegration busy time", () => {
  it("a single Install keeps the plain minimum", async () => {
    expect(await busyFor((s) => s.install())).toBe(500);
  });

  it("an Install from Install all adds the row's own extra", async () => {
    expect(await busyFor((s) => s.install({ staggered: true }))).toBe(700);
  });

  it("an Uninstall from Uninstall all adds it too", async () => {
    expect(await busyFor((s) => s.remove({ staggered: true }))).toBe(700);
  });
});
