import { describe, expect, it } from "vitest";
import {
  buildScriptInput,
  planReusedTabInput,
  resolveScriptCwd,
} from "./scriptCwd";

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

  it("an empty or blank focus folder counts as absent", () => {
    expect(resolveScriptCwd({ ...base, mode: "context", focusFolder: "" })).toBe(
      "/Users/me/project",
    );
    expect(
      resolveScriptCwd({ ...base, mode: "context", focusFolder: "  " }),
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
    expect(buildScriptInput("pnpm dev", undefined, "posix")).toBe("pnpm dev\r");
  });

  it("chains cd and the command with && on posix, quoting the path", () => {
    expect(buildScriptInput("pnpm dev", "/a b/it's", "posix")).toBe(
      "cd '/a b/it'\\''s' && pnpm dev\r",
    );
  });

  it("keeps $, backtick, double quote and % literal on posix", () => {
    for (const p of ["/a/$HOME", "/a/`x`", '/a/"q"', "/a/%PATH%"]) {
      expect(buildScriptInput("ls", p, "posix")).toBe(`cd '${p}' && ls\r`);
    }
  });

  it("does not cd when the path has a line break", () => {
    expect(buildScriptInput("ls", "/a\nrm -rf x", "posix")).toBe("ls\r");
    expect(buildScriptInput("ls", "/a\rb", "powershell")).toBe("ls\r");
  });

  it("uses a literal Set-Location guarded by $? on powershell", () => {
    expect(buildScriptInput("pnpm dev", "C:/it's [x] $a", "powershell")).toBe(
      "Set-Location -LiteralPath 'C:/it''s [x] $a'; if ($?) { pnpm dev }\r",
    );
  });
});

describe("planReusedTabInput", () => {
  it("writes nothing when the tab is busy", () => {
    expect(planReusedTabInput(true, "ls", "/a", "posix")).toBeNull();
  });

  it("cds first on an idle tab whenever a folder resolves", () => {
    expect(planReusedTabInput(false, "ls", "/a", "posix")).toBe(
      "cd '/a' && ls\r",
    );
  });

  it("only runs the command on an idle tab without a folder", () => {
    expect(planReusedTabInput(false, "ls", undefined, "posix")).toBe("ls\r");
  });
});
