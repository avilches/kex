import { describe, expect, it } from "vitest";
import { withoutKeptWorktree } from "./usePruneSleepingWorktree";
import type { Tab } from "./types";

describe("withoutKeptWorktree", () => {
  const asleep: Tab = {
    id: "t",
    kind: "terminal",
    cwd: "/repo",
    hibernation: { at: 1, agent: "claude", command: "claude --resume x", worktreeCwd: "/repo/.claude/worktrees/x" },
  };

  it("drops only the worktree and keeps the rest of the sleep", () => {
    expect(withoutKeptWorktree(asleep)).toEqual({
      id: "t",
      kind: "terminal",
      cwd: "/repo",
      hibernation: { at: 1, agent: "claude", command: "claude --resume x" },
    });
  });

  it("returns the same tab when there is nothing to drop", () => {
    const bare: Tab = { ...asleep, hibernation: { at: 1 } };
    expect(withoutKeptWorktree(bare)).toBe(bare);
    const awake: Tab = { id: "t", kind: "terminal", cwd: "/repo" };
    expect(withoutKeptWorktree(awake)).toBe(awake);
  });
});
