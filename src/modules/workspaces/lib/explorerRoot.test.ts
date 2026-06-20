import { describe, expect, it } from "vitest";
import {
  isFilesystemRoot,
  parentRoot,
  resolveExplorerRoot,
} from "./explorerRoot";

describe("resolveExplorerRoot", () => {
  const base = {
    terminalCwd: "/proj/sub",
    gitRoot: "/proj",
    pinnedRoot: "/pinned",
    fsRoot: null as string | null,
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

  it("filesystem mode returns fsRoot when set", () => {
    expect(
      resolveExplorerRoot({ ...base, mode: "filesystem", fsRoot: "/proj/sub" }),
    ).toBe("/proj/sub");
  });

  it("filesystem mode falls back to home when fsRoot is null", () => {
    expect(resolveExplorerRoot({ ...base, mode: "filesystem" })).toBe(
      "/home/u",
    );
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

describe("isFilesystemRoot", () => {
  it("treats unix root as top", () => {
    expect(isFilesystemRoot("/")).toBe(true);
  });
  it("treats a windows drive root as top", () => {
    expect(isFilesystemRoot("C:/")).toBe(true);
    expect(isFilesystemRoot("C:")).toBe(true);
  });
  it("a normal path is not a root", () => {
    expect(isFilesystemRoot("/home/u")).toBe(false);
    expect(isFilesystemRoot("C:/Users")).toBe(false);
  });
});

describe("parentRoot", () => {
  it("climbs a unix path", () => {
    expect(parentRoot("/home/u")).toBe("/home");
    expect(parentRoot("/home")).toBe("/");
  });
  it("normalizes a windows drive parent back to drive root", () => {
    expect(parentRoot("C:/Users")).toBe("C:/");
  });
});
