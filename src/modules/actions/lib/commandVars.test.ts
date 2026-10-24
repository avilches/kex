import { describe, expect, it } from "vitest";
import { COMMAND_VARIABLES } from "./actionForm";
import { actionAvailability } from "./actionsBar";
import { planActionRun, type RunContext } from "./actionRun";
import { buildCommandVars, inWorktree } from "./commandVars";
import type { Tab } from "@/modules/workspaces/lib/types";
import type { Action } from "./types";

const editor: Tab = { id: "e1", kind: "editor", path: "/Users/me/code/kex/src/index.ts", dirty: false, preview: false };
const ws = { cwd: "/Users/me/code/kex", workspaceRoot: "/Users/me/code/kex" };
const git = { branch: "main", repoRoot: "/Users/me/code/kex" };

const vars = buildCommandVars(editor, ws, git, "MacBook");

const runCtx = (over: Partial<RunContext> = {}): RunContext => ({
  hibernated: false,
  shell: "posix",
  vars,
  folders: { workspaceRoot: ws.workspaceRoot, workspaceCwd: ws.cwd },
  link: null,
  scriptPaneExists: true,
  atPaneLimit: false,
  ...over,
});

const app = (command: string): Action => ({ id: "a1", name: "app", runInTerminal: false, command, ownButton: false });
const script = (command: string): Action => ({ id: "s1", name: "script", runInTerminal: true, command, ownButton: false });

describe("buildCommandVars", () => {
  it("gives a value to every variable a command can use", () => {
    for (const name of COMMAND_VARIABLES) {
      expect(vars[name], name).not.toBe("");
    }
    expect(Object.keys(vars).sort()).toEqual([...COMMAND_VARIABLES].sort());
  });

  it("keeps raw values: no home abbreviation and no trimming", () => {
    expect(vars.cwd).toBe("/Users/me/code/kex/src");
    expect(vars.filepath).toBe("/Users/me/code/kex/src/index.ts");
    expect(vars.filename).toBe("index.ts");
    expect(vars.workspace).toBe("/Users/me/code/kex");
    expect(vars.repo).toBe("kex");
  });

  it("leaves empty what has no value", () => {
    const none = buildCommandVars(null, {}, { branch: "", repoRoot: "" }, "");
    for (const name of COMMAND_VARIABLES) expect(none[name], name).toBe("");
  });
});

describe("every offered variable is substituted when an Action runs", () => {
  it.each(COMMAND_VARIABLES)("{%s} reaches the argv of an app", (name) => {
    const plan = planActionRun(app(`tool {${name}}`), runCtx());
    expect(plan.kind).toBe("spawn-app");
    if (plan.kind !== "spawn-app") return;
    expect(plan.argv).toEqual(["tool", vars[name]]);
    expect(plan.argv.join(" ")).not.toContain("{");
  });

  it.each(COMMAND_VARIABLES.filter((n) => !["host"].includes(n)))("{%s} is typed into a script", (name) => {
    const plan = planActionRun(script(`echo {${name}}`), runCtx());
    expect(plan.kind).toBe("new-tab");
    if (plan.kind !== "new-tab") return;
    expect(plan.input).toContain(vars[name]);
    expect(plan.input).not.toContain(`{${name}}`);
  });

  it("agrees with the bar: an Action the bar offers is never blocked by the runner for a missing value", () => {
    for (const name of COMMAND_VARIABLES) {
      for (const make of [app, script]) {
        const action = make(`tool {${name}}`);
        const reason = actionAvailability(action, { vars, shell: "posix" });
        const plan = planActionRun(action, runCtx());
        expect(reason === null, `${name} ${action.runInTerminal ? "script" : "app"}`).toBe(plan.kind !== "blocked");
      }
    }
  });

  it("agrees with the bar when a value is missing", () => {
    const noFile = buildCommandVars({ id: "t1", kind: "terminal", cwd: "/p" }, { workspaceRoot: "/p" }, { branch: "", repoRoot: "" }, "MacBook");
    for (const name of ["filename", "filepath", "branch", "repo"] as const) {
      const action = app(`tool {${name}}`);
      const reason = actionAvailability(action, { vars: noFile, shell: "posix" });
      const plan = planActionRun(action, runCtx({ vars: noFile }));
      expect(reason, name).not.toBeNull();
      expect(plan.kind, name).toBe("blocked");
    }
  });
});

describe("inWorktree", () => {
  const term: Tab = { id: "t1", kind: "terminal", cwd: "/p" };

  it("moves a terminal tab to the agent worktree, so {cwd} and {dir} read it", () => {
    const v = buildCommandVars(inWorktree(term, "/p/.claude/worktrees/x"), { workspaceRoot: "/p" }, { branch: "", repoRoot: "" }, "h");
    expect(v.cwd).toBe("/p/.claude/worktrees/x");
    expect(v.dir).toBe("x");
  });

  it("leaves the tab alone with no worktree, and any non-terminal tab", () => {
    expect(inWorktree(term, null)).toBe(term);
    expect(inWorktree(editor, "/w")).toBe(editor);
    expect(inWorktree(null, "/w")).toBeNull();
  });
});
