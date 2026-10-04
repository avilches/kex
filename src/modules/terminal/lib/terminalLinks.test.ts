import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn(async (_cmd: string, _args: unknown) => undefined);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args: unknown) => invokeMock(cmd, args),
}));

import { _clearPathExistsCacheForTests, pathExists } from "./terminalLinks";

describe("pathExists", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeMock.mockReset();
    _clearPathExistsCacheForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls fs_stat once and caches a positive result", async () => {
    invokeMock.mockResolvedValue(undefined);
    expect(await pathExists("/repo/a.ts")).toBe(true);
    expect(await pathExists("/repo/a.ts")).toBe(true);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("fs_stat", { path: "/repo/a.ts" });
  });

  it("calls fs_stat once and caches a negative result (no repeat IPC on repeated hovers)", async () => {
    invokeMock.mockRejectedValue(new Error("not found"));
    expect(await pathExists("/repo/missing.ts")).toBe(false);
    expect(await pathExists("/repo/missing.ts")).toBe(false);
    expect(await pathExists("/repo/missing.ts")).toBe(false);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("re-checks a positive result after the TTL expires", async () => {
    invokeMock.mockResolvedValue(undefined);
    expect(await pathExists("/repo/a.ts")).toBe(true);
    vi.advanceTimersByTime(5_001);
    expect(await pathExists("/repo/a.ts")).toBe(true);
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("re-checks a negative result after the TTL expires, so a file created later is detected", async () => {
    invokeMock.mockRejectedValue(new Error("not found"));
    expect(await pathExists("/repo/generated.ts")).toBe(false);
    vi.advanceTimersByTime(5_001);
    invokeMock.mockResolvedValue(undefined);
    expect(await pathExists("/repo/generated.ts")).toBe(true);
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("does not re-check within the TTL window", async () => {
    invokeMock.mockResolvedValue(undefined);
    expect(await pathExists("/repo/a.ts")).toBe(true);
    vi.advanceTimersByTime(4_999);
    expect(await pathExists("/repo/a.ts")).toBe(true);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("caches each distinct path independently", async () => {
    invokeMock.mockImplementation(async (_cmd, args) => {
      if ((args as { path: string }).path === "/repo/exists.ts") return undefined;
      throw new Error("not found");
    });
    expect(await pathExists("/repo/exists.ts")).toBe(true);
    expect(await pathExists("/repo/missing.ts")).toBe(false);
    expect(await pathExists("/repo/exists.ts")).toBe(true);
    expect(await pathExists("/repo/missing.ts")).toBe(false);
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});
