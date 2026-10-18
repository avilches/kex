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

  it("writes the message when the stack holds only frames (WebKit)", () => {
    const err = new TypeError("Cannot read properties of undefined");
    err.stack = "Bc@tauri://localhost/assets/main.js:2:16233\nwl@x:2:28750";
    const out = formatError("src", err);
    expect(out).toContain("TypeError: Cannot read properties of undefined");
    expect(out).toContain("Bc@tauri://localhost/assets/main.js:2:16233");
  });

  it("does not repeat the message when the stack already starts with it", () => {
    const err = new Error("boom");
    err.stack = "Error: boom\n    at a (x.js:1:1)";
    expect(formatError("src", err).match(/boom/g)).toHaveLength(1);
  });

  it("keeps the component stack even when the error stack is huge", () => {
    const err = new Error("boom");
    err.stack = Array.from({ length: 80 }, (_, i) => `f${i}@x:1:1`).join("\n");
    const out = formatError("src", err, "\n    at Group\n    at Sidebar");
    expect(out).toContain("... 68 more");
    expect(out).toContain("at Group");
    expect(out).toContain("at Sidebar");
  });

  it("includes the cause chain and survives a cyclic cause", () => {
    const inner = new Error("inner");
    const outer = new Error("outer");
    (outer as { cause?: unknown }).cause = inner;
    expect(formatError("src", outer)).toContain("caused by: Error: inner");
    const a = new Error("a");
    (a as { cause?: unknown }).cause = a;
    expect(() => formatError("src", a)).not.toThrow();
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
