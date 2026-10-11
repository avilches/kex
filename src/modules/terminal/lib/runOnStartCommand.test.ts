import { describe, expect, it } from "vitest";
import {
  commitRunOnStartEdit,
  effectiveRunOnStartCommand,
  syncFollowedCommand,
} from "./runOnStartCommand";

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
