import { describe, expect, it } from "vitest";
import { tabTitle } from "./tabTitle";

const terminal = (overrides: Partial<{ cwd: string; title: string }> = {}) =>
  ({ id: "p1", kind: "terminal" as const, ...overrides });

describe("tabTitle - terminal oscTitle precedence", () => {
  it("shows oscTitle when no runningCommand and no tab.title", () => {
    expect(tabTitle(terminal({ cwd: "/home/me" }), null, "vim")).toBe("vim");
  });

  it("tab.title overrides oscTitle", () => {
    expect(tabTitle(terminal({ cwd: "/home/me", title: "custom" }), null, "vim")).toBe("custom");
  });

  it("runningCommand overrides oscTitle", () => {
    expect(tabTitle(terminal({ cwd: "/home/me" }), "cargo build", "vim")).toBe("cargo");
  });

  it("falls back to cwd when oscTitle is empty string", () => {
    expect(tabTitle(terminal({ cwd: "/home/me" }), null, "")).toBe("/home/me");
  });

  it("falls back to cwd when oscTitle is undefined", () => {
    expect(tabTitle(terminal({ cwd: "/home/me" }), null, undefined)).toBe("/home/me");
  });
});

describe("tabTitle - non-terminal tabs unaffected by oscTitle", () => {
  it("editor title ignores oscTitle", () => {
    const editor = { id: "p2", kind: "editor" as const, path: "/src/foo.ts", dirty: false, preview: false };
    expect(tabTitle(editor, null, "some osc title")).toBe("foo.ts");
  });
});
