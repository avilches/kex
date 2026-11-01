import { describe, expect, it } from "vitest";
import { COMMAND_VARIABLES } from "./actionForm";
import { actionAvailability, type BarContext } from "./actionsBar";
import { planActionRun, type RunContext } from "./actionRun";
import { buildCommandVars, inWorktree } from "./commandVars";
import type { Tab } from "@/modules/workspaces/lib/types";
import type { Action } from "./types";

const editor: Tab = { id: "e1", kind: "editor", path: "/Users/me/code/kex/src/index.ts", dirty: false, preview: false };
const ws = { cwd: "/Users/me/code/kex", workspaceRoot: "/Users/me/code/kex" };
const vars = buildCommandVars(ws);

const runCtx = (over: Partial<RunContext> = {}): RunContext => ({
  shell: "posix",
  vars,
  folders: { workspaceRoot: ws.workspaceRoot, workspaceCwd: ws.cwd },
  link: null,
  scriptPaneExists: true,
  atPaneLimit: false,
  ...over,
});

const barCtx = (over: Partial<BarContext> = {}): BarContext => ({
  vars,
  shell: "posix",
  folders: { workspaceRoot: ws.workspaceRoot, workspaceCwd: ws.cwd },
  ...over,
});

const app = (command: string): Action => ({ id: "a1", name: "app", kind: "app", command, ownButton: false });
const folderScript = (command: string): Action => ({ id: "s1", name: "script", kind: "script", command, runs: "folder", ownButton: false });

describe("buildCommandVars", () => {
  it("has exactly one variable, {target}, which is the workspace root", () => {
    expect([...COMMAND_VARIABLES]).toEqual(["target"]);
    expect(Object.keys(vars)).toEqual(["target"]);
    expect(vars.target).toBe("/Users/me/code/kex");
  });

  it("leaves it empty without a root, and for a root made of blanks", () => {
    expect(buildCommandVars({ workspaceRoot: undefined }).target).toBe("");
    expect(buildCommandVars({ workspaceRoot: "   " }).target).toBe("");
  });
});

describe("{target} is substituted when an Action runs", () => {
  it("reaches the argv of an app", () => {
    const plan = planActionRun(app("tool {target}"), runCtx());
    expect(plan.kind).toBe("spawn-app");
    if (plan.kind !== "spawn-app") return;
    expect(plan.argv).toEqual(["tool", vars.target]);
  });

  it("is typed, quoted, into a folder script", () => {
    const plan = planActionRun(folderScript("ls {target}"), runCtx({ vars: { target: "/p/my dir" }, startFolder: "/p/my dir" }));
    expect(plan.kind).toBe("new-tab");
    if (plan.kind !== "new-tab") return;
    expect(plan.input).toBe("ls '/p/my dir'\r");
  });

  it("agrees with the bar: an Action the bar offers is never blocked by the runner", () => {
    for (const action of [app("tool {target}"), folderScript("ls {target}"), folderScript("pnpm install")]) {
      const reason = actionAvailability(action, barCtx());
      const plan = planActionRun(action, runCtx());
      expect(reason === null, action.command).toBe(plan.kind !== "blocked");
    }
  });

  it("agrees with the bar when there is no root", () => {
    const rootless = { vars: buildCommandVars({ workspaceRoot: undefined }), folders: { workspaceRoot: null, workspaceCwd: null } };
    for (const action of [app("tool {target}"), folderScript("pnpm install")]) {
      const reason = actionAvailability(action, barCtx(rootless));
      const plan = planActionRun(action, runCtx(rootless));
      expect(reason, action.command).not.toBeNull();
      expect(plan.kind, action.command).toBe("blocked");
    }
  });
});

describe("inWorktree", () => {
  const term: Tab = { id: "t1", kind: "terminal", cwd: "/p" };

  it("moves a terminal tab to the agent worktree", () => {
    expect(inWorktree(term, "/p/.claude/worktrees/x")).toMatchObject({ kind: "terminal", cwd: "/p/.claude/worktrees/x" });
  });

  it("leaves the tab alone with no worktree, and any non-terminal tab", () => {
    expect(inWorktree(term, null)).toBe(term);
    expect(inWorktree(editor, "/w")).toBe(editor);
    expect(inWorktree(null, "/w")).toBeNull();
  });
});

describe("a root made of whitespace", () => {
  it("is no workspace for the bar and the runner alike", () => {
    const blank = buildCommandVars({ workspaceRoot: "   " });
    const agent: Action = { id: "g", name: "claude", kind: "agent", command: "claude", ownButton: false };
    const ctx = runCtx({ vars: blank, folders: { workspaceRoot: "   ", workspaceCwd: "/x" } });
    expect(actionAvailability(agent, barCtx({ vars: blank, folders: { workspaceRoot: "   ", workspaceCwd: "/x" } }))).not.toBeNull();
    expect(planActionRun(agent, ctx).kind).toBe("blocked");
  });
});
