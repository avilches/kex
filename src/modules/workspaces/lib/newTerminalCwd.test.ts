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

  describe("when the chosen source is unavailable", () => {
    const none = { home: null, lastFolder: null, workspaceRoot: null, launchDir: null };

    it("falls back to where Kex was launched, then to home, as the shell would", () => {
      for (const mode of ["workspace", "context"] as const) {
        expect(resolveNewTerminalCwd({ ...none, mode, launchDir: "/launch", home: "/Users/me" })).toBe(
          "/launch",
        );
        expect(resolveNewTerminalCwd({ ...none, mode, home: "/Users/me" })).toBe("/Users/me");
      }
    });

    it("home mode uses the launch folder only while home is not known yet", () => {
      expect(resolveNewTerminalCwd({ ...none, mode: "home", launchDir: "/launch" })).toBe("/launch");
    });

    it("home mode prefers home over the launch folder", () => {
      expect(
        resolveNewTerminalCwd({ ...none, mode: "home", home: "/Users/me", launchDir: "/launch" }),
      ).toBe("/Users/me");
    });

    it("keeps the chosen source when it is available", () => {
      expect(
        resolveNewTerminalCwd({
          ...base,
          mode: "context",
          launchDir: "/launch",
        }),
      ).toBe("/Users/me/project/src");
    });

    it("returns undefined only when nothing at all is known", () => {
      for (const mode of ["home", "workspace", "context"] as const) {
        expect(resolveNewTerminalCwd({ ...none, mode })).toBeUndefined();
      }
    });
  });
});
