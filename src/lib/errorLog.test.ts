import { beforeEach, describe, expect, it, vi } from "vitest";

const errorMock = vi.fn();
vi.mock("@tauri-apps/plugin-log", () => ({
  error: (...args: unknown[]) => errorMock(...args),
}));

import { formatError, reactRootErrorOptions } from "./errorLog";

describe("formatError", () => {
  it("uses the stack of an Error", () => {
    const err = new Error("boom");
    expect(formatError("src", err)).toContain("boom");
    expect(formatError("src", err).startsWith("[webview] src: ")).toBe(true);
  });

  it("serializes non-Error values", () => {
    expect(formatError("src", "plain")).toBe("[webview] src: plain");
    expect(formatError("src", { a: 1 })).toBe('[webview] src: {"a":1}');
  });

  it("does not throw on circular values", () => {
    const o: Record<string, unknown> = {};
    o.self = o;
    expect(() => formatError("src", o)).not.toThrow();
  });

  it("appends the component stack and truncates long messages", () => {
    expect(formatError("src", "x", "\n  at A")).toContain("\n  at A");
    expect(formatError("src", "x".repeat(10000)).length).toBeLessThan(4100);
  });
});

describe("reactRootErrorOptions", () => {
  beforeEach(() => {
    errorMock.mockReset();
    errorMock.mockResolvedValue(undefined);
  });

  it("writes an uncaught render error to the log with its component stack", () => {
    reactRootErrorOptions.onUncaughtError?.(new Error("render failed"), {
      componentStack: "\n  at WorkspaceBar",
    });
    const line = String(errorMock.mock.calls[0][0]);
    expect(line).toContain("render failed");
    expect(line).toContain("at WorkspaceBar");
  });
});
