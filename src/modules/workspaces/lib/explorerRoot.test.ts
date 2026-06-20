import { describe, expect, it } from "vitest";
import { resolveExplorerRoot } from "./explorerRoot";

describe("resolveExplorerRoot", () => {
  const base = {
    terminalCwd: "/proj/sub",
    gitRoot: "/proj",
    pinnedRoot: "/pinned",
    home: "/home/u",
  };

  it("terminal mode follows the terminal cwd", () => {
    expect(resolveExplorerRoot({ ...base, mode: "terminal" })).toBe("/proj/sub");
  });

  it("terminal mode falls back to home when no cwd", () => {
    expect(
      resolveExplorerRoot({ ...base, mode: "terminal", terminalCwd: null }),
    ).toBe("/home/u");
  });

  it("git mode uses the known git root", () => {
    expect(resolveExplorerRoot({ ...base, mode: "git" })).toBe("/proj");
  });

  it("git mode falls back to terminal cwd when no git root", () => {
    expect(resolveExplorerRoot({ ...base, mode: "git", gitRoot: null })).toBe(
      "/proj/sub",
    );
  });

  it("git mode falls back to home when no git root and no cwd", () => {
    expect(
      resolveExplorerRoot({
        ...base,
        mode: "git",
        gitRoot: null,
        terminalCwd: null,
      }),
    ).toBe("/home/u");
  });

  it("filesystem mode always returns home", () => {
    expect(resolveExplorerRoot({ ...base, mode: "filesystem" })).toBe("/home/u");
  });

  it("pinned mode returns the pinned path", () => {
    expect(resolveExplorerRoot({ ...base, mode: "pinned" })).toBe("/pinned");
  });

  it("pinned mode returns null when nothing is pinned", () => {
    expect(
      resolveExplorerRoot({ ...base, mode: "pinned", pinnedRoot: null }),
    ).toBeNull();
  });
});
