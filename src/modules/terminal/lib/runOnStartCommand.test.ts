import { describe, expect, it } from "vitest";
import {
  commandOnEnable,
  commandOnUndoClose,
  commitRunOnStartEdit,
  effectiveRunOnStartCommand,
  followableCommand,
  syncFollowedCommand,
} from "./runOnStartCommand";

describe("commandOnUndoClose", () => {
  it("is null when Run on Start is off", () => {
    expect(commandOnUndoClose({ persistentCommand: "pnpm dev" }, null, null, false)).toBeNull();
    expect(commandOnUndoClose({ restoreOnRestart: false }, null, "claude --resume x", true)).toBeNull();
  });
  it("returns the saved command for a plain terminal", () => {
    expect(commandOnUndoClose({ restoreOnRestart: true, persistentCommand: "pnpm dev" }, null, null, false)).toBe("pnpm dev");
  });
  it("follows the running command unless it was typed manually", () => {
    expect(commandOnUndoClose({ restoreOnRestart: true, persistentCommand: "a" }, "b", null, false)).toBe("b");
    expect(
      commandOnUndoClose({ restoreOnRestart: true, persistentCommand: "a", persistentCommandManual: true }, "b", null, false),
    ).toBe("a");
  });
  it("uses the resume command for an agent, on by default", () => {
    expect(commandOnUndoClose({}, null, "claude --resume x", true)).toBe("claude --resume x");
  });
});

describe("effectiveRunOnStartCommand", () => {
  it("follows the running command when not manual", () => {
    expect(effectiveRunOnStartCommand({ persistentCommand: "old" }, "lazygit")).toBe("lazygit");
  });
  it("falls back to the stored command when nothing runs", () => {
    expect(effectiveRunOnStartCommand({ persistentCommand: "old" }, null)).toBe("old");
    expect(effectiveRunOnStartCommand({}, null)).toBe("");
  });
  it("keeps the manual command over the running one", () => {
    const tab = { persistentCommand: "mine", persistentCommandManual: true };
    expect(effectiveRunOnStartCommand(tab, "lazygit")).toBe("mine");
  });
});

describe("commitRunOnStartEdit", () => {
  it("marks a non-empty edit as manual", () => {
    expect(commitRunOnStartEdit("  htop ", "x")).toEqual({
      persistentCommand: "htop",
      persistentCommandManual: true,
    });
  });
  it("returns to following the terminal when cleared", () => {
    expect(commitRunOnStartEdit("  ", "lazygit")).toEqual({
      persistentCommand: "lazygit",
      persistentCommandManual: false,
    });
    expect(commitRunOnStartEdit("", null)).toEqual({
      persistentCommand: undefined,
      persistentCommandManual: false,
    });
  });
});

describe("syncFollowedCommand", () => {
  it("writes a new running command", () => {
    expect(syncFollowedCommand({ persistentCommand: "a" }, "b")).toEqual({
      persistentCommand: "b",
      persistentCommandManual: false,
    });
  });
  it("does nothing when manual, idle or equal", () => {
    expect(syncFollowedCommand({ persistentCommandManual: true }, "b")).toBeNull();
    expect(syncFollowedCommand({}, null)).toBeNull();
    expect(syncFollowedCommand({ persistentCommand: "b" }, "b")).toBeNull();
  });
});

describe("followableCommand", () => {
  it("passes a plain running command through", () => {
    expect(followableCommand("lazygit", null)).toBe("lazygit");
    expect(followableCommand(null, null)).toBeNull();
  });

  it("replaces the typed wrapper of a running script with the script command", () => {
    expect(followableCommand("cd '/a' && { pnpm dev }", "pnpm dev")).toBe("pnpm dev");
  });

  it("never follows a report as long as the hook limit", () => {
    expect(followableCommand("x".repeat(256), null)).toBeNull();
    expect(followableCommand("x".repeat(255), null)).toBe("x".repeat(255));
  });

  it("keeps a long script command whole", () => {
    const long = `echo ${"y".repeat(400)}`;
    expect(followableCommand("cd '/a' && { echo yyyy", long)).toBe(long);
  });
});

describe("commandOnEnable", () => {
  it("keeps a stored command", () => {
    expect(commandOnEnable({ persistentCommand: "make" }, "other", false)).toBe("make");
  });
  it("copies the followable command into a plain terminal", () => {
    expect(commandOnEnable({}, "npm run dev", false)).toBe("npm run dev");
  });
  it("never copies it into an agent tab", () => {
    expect(commandOnEnable({}, "claude", true)).toBeUndefined();
  });
});
