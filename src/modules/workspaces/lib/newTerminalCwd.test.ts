import { describe, expect, it } from "vitest";
import { resolveNewTerminalCwd } from "./newTerminalCwd";

const base = {
  home: "/Users/me",
  lastFolder: "/Users/me/project/src",
  workspaceRoot: "/Users/me/project",
};

describe("resolveNewTerminalCwd", () => {
  it("home mode always returns home, ignoring workspace and last folder", () => {
    expect(resolveNewTerminalCwd({ ...base, mode: "home" })).toBe("/Users/me");
  });

  it("workspace mode returns the static workspace root", () => {
    expect(resolveNewTerminalCwd({ ...base, mode: "workspace" })).toBe(
      "/Users/me/project",
    );
  });

  it("workspace mode falls back to last folder when there is no workspace root", () => {
    expect(
      resolveNewTerminalCwd({ ...base, mode: "workspace", workspaceRoot: null }),
    ).toBe("/Users/me/project/src");
  });

  it("context mode returns the last folder, ignoring the workspace root", () => {
    expect(resolveNewTerminalCwd({ ...base, mode: "context" })).toBe(
      "/Users/me/project/src",
    );
  });

  it("returns undefined when the chosen source is unavailable", () => {
    expect(
      resolveNewTerminalCwd({
        mode: "home",
        home: null,
        lastFolder: null,
        workspaceRoot: null,
      }),
    ).toBeUndefined();
    expect(
      resolveNewTerminalCwd({
        mode: "workspace",
        home: "/Users/me",
        lastFolder: null,
        workspaceRoot: null,
      }),
    ).toBeUndefined();
    expect(
      resolveNewTerminalCwd({
        mode: "context",
        home: "/Users/me",
        lastFolder: null,
        workspaceRoot: "/Users/me/project",
      }),
    ).toBeUndefined();
  });
});
