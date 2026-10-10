import { describe, expect, it } from "vitest";
import { buildScriptInput, resolveScriptCwd } from "./scriptCwd";

const base = {
  fixedFolder: "/opt/fixed",
  focusFolder: "/Users/me/project/src",
  workspaceRoot: "/Users/me/project",
  workspaceCwd: "/Users/me/live",
};

describe("resolveScriptCwd", () => {
  it("workspace mode returns the workspace root", () => {
    expect(resolveScriptCwd({ ...base, mode: "workspace" })).toBe(
      "/Users/me/project",
    );
  });

  it("workspace mode falls back to the workspace cwd without a root", () => {
    expect(
      resolveScriptCwd({ ...base, mode: "workspace", workspaceRoot: null }),
    ).toBe("/Users/me/live");
  });

  it("workspace mode is undefined when nothing is known", () => {
    expect(
      resolveScriptCwd({
        mode: "workspace",
        workspaceRoot: null,
        workspaceCwd: null,
      }),
    ).toBeUndefined();
  });

  it("context mode returns the focused folder", () => {
    expect(resolveScriptCwd({ ...base, mode: "context" })).toBe(
      "/Users/me/project/src",
    );
  });

  it("context mode falls back to workspace mode without a focused folder", () => {
    expect(
      resolveScriptCwd({ ...base, mode: "context", focusFolder: null }),
    ).toBe("/Users/me/project");
    expect(
      resolveScriptCwd({
        ...base,
        mode: "context",
        focusFolder: null,
        workspaceRoot: null,
      }),
    ).toBe("/Users/me/live");
  });

  it("fixed mode returns the trimmed fixed folder", () => {
    expect(
      resolveScriptCwd({ ...base, mode: "fixed", fixedFolder: "  /opt/x " }),
    ).toBe("/opt/x");
  });

  it("fixed mode with an empty folder falls back to workspace mode", () => {
    expect(resolveScriptCwd({ ...base, mode: "fixed", fixedFolder: "" })).toBe(
      "/Users/me/project",
    );
    expect(
      resolveScriptCwd({ ...base, mode: "fixed", fixedFolder: "   " }),
    ).toBe("/Users/me/project");
    expect(
      resolveScriptCwd({ ...base, mode: "fixed", fixedFolder: undefined }),
    ).toBe("/Users/me/project");
  });

  it("an absent mode behaves as workspace and ignores the fixed folder", () => {
    expect(resolveScriptCwd({ ...base, mode: undefined })).toBe(
      "/Users/me/project",
    );
  });
});

describe("buildScriptInput", () => {
  it("only the command when there is no folder", () => {
    expect(buildScriptInput("pnpm dev", undefined, false)).toBe("pnpm dev\r");
  });

  it("chains cd and the command with && on posix, quoting the path", () => {
    expect(buildScriptInput("pnpm dev", "/a b/it's", false)).toBe(
      "cd '/a b/it'\\''s' && pnpm dev\r",
    );
  });

  it("sends cd and the command as separate lines on windows", () => {
    expect(buildScriptInput("pnpm dev", "C:/a b", true)).toBe(
      'cd "C:/a b"\rpnpm dev\r',
    );
  });
});
