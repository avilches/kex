import { describe, expect, it } from "vitest";
import { agentAwareTabTitle, tabTitle } from "./tabTitle";

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

describe("agentAwareTabTitle - sessionTitle priority", () => {
  it("oscTitle wins over sessionTitle when both present", () => {
    expect(
      agentAwareTabTitle(
        terminal({ cwd: "/home/me" }),
        true,
        "claude",
        "live status",
        "initial session title",
        "claude",
      ),
    ).toBe("live status");
  });

  it("sessionTitle wins when oscTitle is absent", () => {
    expect(
      agentAwareTabTitle(
        terminal({ cwd: "/home/me" }),
        true,
        "claude",
        undefined,
        "initial session title",
        "claude",
      ),
    ).toBe("initial session title");
  });

  it("falls back to agentName and dirname when neither oscTitle nor sessionTitle are present", () => {
    expect(
      agentAwareTabTitle(terminal({ cwd: "/home/me" }), true, "claude", undefined, undefined, "claude"),
    ).toBe("claude · me");
  });

  it("tab.title (manual rename) still wins over oscTitle and sessionTitle", () => {
    expect(
      agentAwareTabTitle(
        terminal({ cwd: "/home/me", title: "renamed" }),
        true,
        "claude",
        "live status",
        "session title",
        "claude",
      ),
    ).toBe("renamed");
  });

  it("no agent: returns fallbackTitle unchanged", () => {
    expect(
      agentAwareTabTitle(terminal({ cwd: "/home/me" }), false, undefined, "live status", "session title", "claude"),
    ).toBe("claude");
  });
});
