import { describe, expect, it } from "vitest";
import { planActionRun, scriptStartFolder, type RunContext } from "./actionRun";
import { actionProblems } from "./actionForm";
import { normalizeAction, normalizeActions } from "./actions";
import { commandProblem } from "./commandTemplate";
import { takes } from "./actionTargets";
import type { Action } from "./types";

const script = (o: Partial<Action> = {}): Action => ({
  id: "s1",
  name: "Dev",
  kind: "script",
  command: "pnpm dev",
  runs: "workspace",
  ownButton: false,
  ...o,
});

const ctx = (o: Partial<RunContext> = {}): RunContext => ({
  shell: "posix",
  vars: { target: "/w" },
  folders: { workspaceRoot: "/w", workspaceCwd: "/w" },
  link: null,
  scriptPaneExists: false,
  atPaneLimit: false,
  ...o,
});

describe("normalizeActions, where a script runs", () => {
  it("keeps the four places and the fixed folder", () => {
    const list = normalizeActions([
      script({ id: "a", runs: "folder" }),
      script({ id: "b", runs: "file", command: "open {target}" }),
      script({ id: "c", runs: "workspace" }),
      script({ id: "d", runs: "fixed", cwd: "/srv" }),
    ]);
    expect(list.map((a) => [a.id, a.runs, a.cwd])).toEqual([
      ["a", "folder", undefined],
      ["b", "file", undefined],
      ["c", "workspace", undefined],
      ["d", "fixed", "/srv"],
    ]);
  });

  it("drops a script saved with the old model, and a fixed one with no folder, without touching the rest", () => {
    const list = normalizeActions([
      { id: "old", name: "Old", kind: "script", command: "ls {cwd}", cwdMode: "context", ownButton: false },
      script({ id: "nofolder", runs: "fixed" }),
      script({ id: "keep" }),
    ]);
    expect(list.map((a) => a.id)).toEqual(["keep"]);
  });

  it("gives agents and apps neither a place nor a folder", () => {
    const agent = normalizeAction({ id: "g", name: "Claude", kind: "agent", command: "claude", runs: "fixed", cwd: "/x", ownButton: true });
    const app = normalizeAction({ id: "p", name: "Zed", kind: "app", command: "zed {target}", runs: "folder", cwd: "/x", ownButton: false });
    for (const a of [agent, app]) {
      expect(a).not.toHaveProperty("runs");
      expect(a).not.toHaveProperty("cwd");
    }
  });
});

describe("commandProblem, the one variable", () => {
  it("refuses every variable that no longer exists, but not a brace the shell owns", () => {
    for (const v of ["cwd", "dir", "branch", "repo", "workspace", "filename", "filepath", "host"]) {
      expect(commandProblem(`echo {${v}}`, "posix", undefined, "folder")).toMatch(new RegExp(`\\{${v}\\}`));
    }
    expect(commandProblem("awk '{print $1}'", "posix", undefined, "folder")).toBeNull();
  });

  it("allows {target} on a folder script and requires it on a file script", () => {
    expect(commandProblem("ls {target}", "posix", undefined, "folder")).toBeNull();
    expect(commandProblem("pnpm install", "posix", undefined, "folder")).toBeNull();
    expect(commandProblem("open {target}", "posix", undefined, "file")).toBeNull();
    expect(commandProblem("echo hi", "posix", undefined, "file")).toMatch(/must use \{target\}/);
  });

  it("refuses {target} where the script has no folder or file to name", () => {
    expect(commandProblem("ls {target}", "posix", undefined, "workspace")).toMatch(/any folder or any file/);
    expect(commandProblem("ls {target}", "posix", undefined, "fixed")).toMatch(/any folder or any file/);
  });
});

describe("actionProblems, the edit modal", () => {
  it("reports the missing {target} of a file script and a bad fixed folder", () => {
    const file = actionProblems(script({ runs: "file", command: "echo hi" }), null);
    expect(file.map((p) => p.kind)).toEqual(["command"]);
    const fixed = actionProblems(script({ runs: "fixed", cwd: "relative/path" }), null);
    expect(fixed.map((p) => p.kind)).toEqual(["cwd"]);
  });
});

describe("scriptStartFolder", () => {
  const folders = { workspaceRoot: "/w", workspaceCwd: "/w/sub" };

  it("starts a folder script where it was offered, else in the workspace root", () => {
    expect(scriptStartFolder(script({ runs: "folder" }), { startFolder: "/w/src", folders })).toBe("/w/src");
    expect(scriptStartFolder(script({ runs: "folder" }), { folders })).toBe("/w");
  });

  it("starts a file script in the folder that holds the file", () => {
    expect(scriptStartFolder(script({ runs: "file" }), { startFolder: "/w/src", folders })).toBe("/w/src");
  });

  it("starts a workspace script in the root and a fixed one in its folder", () => {
    expect(scriptStartFolder(script({ runs: "workspace" }), { startFolder: "/elsewhere", folders })).toBe("/w");
    expect(scriptStartFolder(script({ runs: "fixed", cwd: "/srv" }), { startFolder: "/elsewhere", folders })).toBe("/srv");
  });
});

describe("planActionRun, scripts by place", () => {
  it("runs a file script in the folder of the file with the path quoted", () => {
    const plan = planActionRun(
      script({ runs: "file", command: "wc -l {target}" }),
      ctx({ vars: { target: "/p/a b.txt" }, startFolder: "/p" }),
    );
    expect(plan).toMatchObject({ kind: "new-tab", cwd: "/p" });
    expect(plan.kind === "new-tab" && plan.input).toBe("wc -l '/p/a b.txt'\r");
  });

  it("blocks a file whose path a shell could not take safely, instead of typing it", () => {
    const plan = planActionRun(script({ runs: "file", command: "wc -l {target}" }), ctx({ vars: { target: "/p/a$b.txt" }, startFolder: "/p" }));
    expect(plan).toMatchObject({ kind: "blocked" });
    expect(plan.kind === "blocked" && plan.reason).toMatch(/cannot be used in a script/);
  });

  it("blocks a file script saved without {target}, even though the editor warned first", () => {
    expect(planActionRun(script({ runs: "file", command: "echo hi" }), ctx({ vars: { target: "/p/a.txt" }, startFolder: "/p" }))).toMatchObject({
      kind: "blocked",
    });
  });

  it("needs the root for a folder or workspace script, never for a fixed one", () => {
    const rootless = ctx({ vars: { target: "" }, folders: { workspaceRoot: null, workspaceCwd: null } });
    for (const runs of ["folder", "workspace"] as const) {
      expect(planActionRun(script({ runs }), rootless)).toMatchObject({ kind: "blocked", reason: "Dev not run: A workspace root is needed" });
    }
    expect(planActionRun(script({ runs: "fixed", cwd: "/srv" }), rootless)).toMatchObject({ kind: "new-tab", cwd: "/srv" });
  });

  it("refuses a fixed folder that is not absolute", () => {
    expect(planActionRun(script({ runs: "fixed", cwd: "~/x" }), ctx())).toMatchObject({ kind: "blocked" });
  });
});

describe("takes, what each kind acts on", () => {
  it("answers from the kind, the accepts switches and the place of a script", () => {
    expect(takes(script({ kind: "agent", runs: undefined }))).toEqual({ folder: true, file: false });
    expect(takes(script({ kind: "app", runs: undefined, accepts: "file" }))).toEqual({ folder: false, file: true });
    expect(takes(script({ kind: "app", runs: undefined, accepts: "both" }))).toEqual({ folder: true, file: true });
    expect(takes(script({ runs: "folder" }))).toEqual({ folder: true, file: false });
    expect(takes(script({ runs: "file" }))).toEqual({ folder: false, file: true });
    expect(takes(script({ runs: "workspace" }))).toEqual({ folder: false, file: false });
    expect(takes(script({ runs: "fixed", cwd: "/srv" }))).toEqual({ folder: false, file: false });
  });
});
