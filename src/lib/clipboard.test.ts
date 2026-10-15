import { beforeEach, describe, expect, it, vi } from "vitest";

const writeTextMock = vi.fn();
const readTextMock = vi.fn();
const warnMock = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: (...args: unknown[]) => writeTextMock(...args),
  readText: (...args: unknown[]) => readTextMock(...args),
}));
vi.mock("@tauri-apps/plugin-log", () => ({
  warn: (...args: unknown[]) => warnMock(...args),
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

import { writeClipboardText } from "./clipboard";

async function settle() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("writeClipboardText", () => {
  beforeEach(() => {
    for (const m of [writeTextMock, readTextMock, warnMock, toastSuccess, toastError]) m.mockReset();
    warnMock.mockResolvedValue(undefined);
  });

  it("writes through the native plugin and reports success", async () => {
    writeTextMock.mockResolvedValue(undefined);
    readTextMock.mockResolvedValue("tab-abc");
    await expect(writeClipboardText("tab-abc")).resolves.toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith("tab-abc");
  });

  it("succeeds on every consecutive call", async () => {
    writeTextMock.mockResolvedValue(undefined);
    for (let i = 0; i < 3; i++) {
      readTextMock.mockResolvedValue(`id-${i}`);
      await expect(writeClipboardText(`id-${i}`)).resolves.toBe(true);
    }
    expect(writeTextMock).toHaveBeenCalledTimes(3);
  });

  it("returns false, logs the cause and skips the check when the native write fails", async () => {
    writeTextMock.mockRejectedValue(new Error("pasteboard unavailable"));
    await expect(writeClipboardText("tab-abc")).resolves.toBe(false);
    await settle();
    expect(readTextMock).not.toHaveBeenCalled();
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

describe("clipboard read-back check", () => {
  beforeEach(() => {
    for (const m of [writeTextMock, readTextMock, warnMock, toastSuccess, toastError]) m.mockReset();
    warnMock.mockResolvedValue(undefined);
    writeTextMock.mockResolvedValue(undefined);
  });

  it("shows a success toast when the clipboard holds exactly what was copied", async () => {
    readTextMock.mockResolvedValue("hello");
    await writeClipboardText("hello");
    await settle();
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(String(toastSuccess.mock.calls[0][0])).toContain("5");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("shows an error toast with both values and logs it when the clipboard differs", async () => {
    readTextMock.mockResolvedValue("something else");
    await writeClipboardText("hello");
    await settle();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
    const description = String(toastError.mock.calls[0][1]?.description);
    expect(description).toContain("hello");
    expect(description).toContain("something else");
    expect(String(warnMock.mock.calls[0][0])).toContain("[clipboard] mismatch");
  });

  it("truncates long values in the toast but keeps their lengths", async () => {
    readTextMock.mockResolvedValue("y".repeat(500));
    await writeClipboardText("x".repeat(500));
    await settle();
    const description = String(toastError.mock.calls[0][1]?.description);
    expect(description.length).toBeLessThan(300);
    expect(description).toContain("500");
  });

  it("reports an error toast and a log when the clipboard cannot be read back", async () => {
    readTextMock.mockRejectedValue(new Error("read not allowed"));
    await expect(writeClipboardText("hello")).resolves.toBe(true);
    await settle();
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(String(toastError.mock.calls[0][1]?.description)).toContain("read not allowed");
    expect(String(warnMock.mock.calls[0][0])).toContain("[clipboard] read-back failed");
  });
});
