import { describe, expect, it } from "vitest";
import type { AgentSession } from "@/modules/agents/lib/types";
import { formatTabTooltip, tabTooltipDir } from "./tabTooltip";
import type { Tab } from "./types";

const terminal = { id: "tab-1", kind: "terminal", cwd: "/work/app" } as Tab;
const editor = { id: "tab-2", kind: "editor", path: "/work/app/a.ts" } as Tab;
const agent = (worktreeCwd?: string) => ({ meta: { worktreeCwd } }) as unknown as AgentSession;

describe("tabTooltipDir", () => {
  it("uses the terminal cwd", () => {
    expect(tabTooltipDir(terminal, undefined)).toBe("/work/app");
  });
  it("prefers the agent worktree", () => {
    expect(tabTooltipDir(terminal, agent("/work/app/.claude/worktrees/x"))).toBe(
      "/work/app/.claude/worktrees/x",
    );
  });
  it("falls back to the cwd when the agent has no worktree", () => {
    expect(tabTooltipDir(terminal, agent())).toBe("/work/app");
  });
  it("has no directory for non-terminal tabs", () => {
    expect(tabTooltipDir(editor, undefined)).toBeUndefined();
  });
});

describe("formatTabTooltip", () => {
  it("joins directory and branch with a bullet", () => {
    expect(formatTabTooltip("/work/app", "main")).toBe("/work/app • main");
  });
  it("shows only the directory without a branch", () => {
    expect(formatTabTooltip("/work/app", null)).toBe("/work/app");
  });
  it("shows nothing without a directory", () => {
    expect(formatTabTooltip(undefined, "main")).toBeUndefined();
  });
});
