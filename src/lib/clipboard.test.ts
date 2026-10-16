import { beforeEach, describe, expect, it, vi } from "vitest";

const writeTextMock = vi.fn();
const warnMock = vi.fn();
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: (...args: unknown[]) => writeTextMock(...args),
}));
vi.mock("@tauri-apps/plugin-log", () => ({
  warn: (...args: unknown[]) => warnMock(...args),
}));

import { writeClipboardText } from "./clipboard";

describe("writeClipboardText", () => {
  beforeEach(() => {
    for (const m of [writeTextMock, warnMock]) m.mockReset();
    warnMock.mockResolvedValue(undefined);
  });

  it("writes through the native plugin and reports success", async () => {
    writeTextMock.mockResolvedValue(undefined);
    await expect(writeClipboardText("tab-abc")).resolves.toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith("tab-abc");
  });

  it("succeeds on every consecutive call", async () => {
    writeTextMock.mockResolvedValue(undefined);
    for (let i = 0; i < 3; i++) {
      await expect(writeClipboardText(`id-${i}`)).resolves.toBe(true);
    }
    expect(writeTextMock).toHaveBeenCalledTimes(3);
  });

  it("returns false and logs the cause when the native write fails", async () => {
    writeTextMock.mockRejectedValue(new Error("pasteboard unavailable"));
    await expect(writeClipboardText("tab-abc")).resolves.toBe(false);
    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(String(warnMock.mock.calls[0][0])).toContain("[clipboard]");
    expect(String(warnMock.mock.calls[0][0])).toContain("pasteboard unavailable");
  });

  it("does not throw when logging the failure also fails", async () => {
    writeTextMock.mockRejectedValue(new Error("boom"));
    warnMock.mockRejectedValue(new Error("log down"));
    await expect(writeClipboardText("x")).resolves.toBe(false);
  });
});
