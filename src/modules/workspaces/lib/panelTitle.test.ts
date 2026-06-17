import { describe, expect, it } from "vitest";
import { panelTitle } from "./panelTitle";

const terminal = (overrides: Partial<{ cwd: string; title: string }> = {}) =>
  ({ id: "p1", kind: "terminal" as const, ...overrides });

describe("panelTitle - terminal oscTitle precedence", () => {
  it("shows oscTitle when no runningCommand and no panel.title", () => {
    expect(panelTitle(terminal({ cwd: "/home/me" }), null, "vim")).toBe("vim");
  });

  it("panel.title overrides oscTitle", () => {
    expect(panelTitle(terminal({ cwd: "/home/me", title: "custom" }), null, "vim")).toBe("custom");
  });

  it("runningCommand overrides oscTitle", () => {
    expect(panelTitle(terminal({ cwd: "/home/me" }), "cargo build", "vim")).toBe("cargo");
  });

  it("falls back to cwd when oscTitle is empty string", () => {
    expect(panelTitle(terminal({ cwd: "/home/me" }), null, "")).toBe("/home/me");
  });

  it("falls back to cwd when oscTitle is undefined", () => {
    expect(panelTitle(terminal({ cwd: "/home/me" }), null, undefined)).toBe("/home/me");
  });
});

describe("panelTitle - non-terminal panels unaffected by oscTitle", () => {
  it("editor title ignores oscTitle", () => {
    const editor = { id: "p2", kind: "editor" as const, path: "/src/foo.ts", dirty: false, preview: false };
    expect(panelTitle(editor, null, "some osc title")).toBe("foo.ts");
  });
});
