import { describe, expect, it } from "vitest";
import type { AppSuggestion } from "./appSuggestions";
import {
  actionProblems,
  commandVariableDocs,
  dropEmptyActions,
  withKind,
  withSuggestion,
} from "./actionForm";
import type { Action } from "./types";

const script: Action = {
  id: "ac-1",
  name: "Dev",
  runInTerminal: true,
  command: "pnpm dev",
  cwdMode: "fixed",
  cwd: "/work/kex",
  ownButton: true,
};
const app: Action = { id: "ac-2", name: "PyCharm", runInTerminal: false, command: "pycharm {cwd}", appId: "pycharm", ownButton: false };
const suggestion: AppSuggestion = {
  key: "zed",
  appId: "zed",
  name: "Zed",
  iconId: "zed",
  defaultCommand: "zed {path}",
};

describe("commandVariableDocs", () => {
  it("lists only the variables a command can have a value for, with their descriptions", () => {
    const docs = commandVariableDocs();
    expect(docs.map((d) => d.name)).toEqual(["cwd", "dir", "branch", "repo", "workspace", "file", "path", "host"]);
    expect(docs.every((d) => d.description.length > 0)).toBe(true);
  });
});

describe("withKind", () => {
  it("turning a script into an app drops the folder choice and keeps everything else", () => {
    const next = withKind(script, false);
    expect(next).toEqual({ id: "ac-1", name: "Dev", runInTerminal: false, command: "pnpm dev", ownButton: true });
  });

  it("turning an app into a script gives it the workspace folder and keeps its appId", () => {
    expect(withKind(app, true)).toEqual({ ...app, runInTerminal: true, cwdMode: "workspace" });
  });

  it("returns the same object when the kind does not change", () => {
    expect(withKind(script, true)).toBe(script);
  });
});

describe("withSuggestion", () => {
  it("fills the command and the app, and keeps a name the user typed", () => {
    expect(withSuggestion({ ...app, name: "Mine" }, suggestion)).toMatchObject({
      name: "Mine",
      command: "zed {path}",
      appId: "zed",
      runInTerminal: false,
    });
  });

  it("takes the suggestion name when the action has none", () => {
    expect(withSuggestion({ ...app, name: "  " }, suggestion).name).toBe("Zed");
  });

  it("turns a script into an app and forgets its folder", () => {
    const next = withSuggestion(script, suggestion);
    expect(next.runInTerminal).toBe(false);
    expect(next.cwdMode).toBeUndefined();
    expect(next.cwd).toBeUndefined();
  });

  it("the custom app clears the appId and leaves an empty command to fill in", () => {
    const next = withSuggestion(app, { key: "custom", name: "Custom app", iconId: null, defaultCommand: "" });
    expect(next.appId).toBeUndefined();
    expect(next.command).toBe("");
  });
});

describe("actionProblems", () => {
  const ctx = { vars: { cwd: "/p", workspace: "", path: "", branch: "", repo: "", dir: "p", file: "", host: "h" }, shell: "posix" as const };

  it("reports nothing for a plain command", () => {
    expect(actionProblems(script, ctx)).toEqual([]);
  });

  it("reports a command that cannot be split", () => {
    const problems = actionProblems({ ...app, command: "code 'unterminated" }, ctx);
    expect(problems.map((p) => p.kind)).toEqual(["command"]);
  });

  it("reports a relative fixed folder", () => {
    const problems = actionProblems({ ...script, cwd: "relative/dir" }, ctx);
    expect(problems.map((p) => p.kind)).toEqual(["cwd"]);
  });

  it("only checks the fixed folder of a script in fixed mode", () => {
    expect(actionProblems({ ...script, cwdMode: "workspace", cwd: "relative" }, ctx)).toEqual([]);
  });

  it("notes a variable with no value here without calling it an error in the command", () => {
    const problems = actionProblems({ ...app, command: "code {workspace}" }, ctx);
    expect(problems).toEqual([{ kind: "context", message: "{workspace} has no value in the current tab" }]);
  });

  it("notes an unsafe value for a script but not for an app", () => {
    const unsafe = { ...ctx, vars: { ...ctx.vars, cwd: "/p/it's" } };
    const asScript = actionProblems({ ...script, command: "make -C {cwd}", cwdMode: "workspace" }, unsafe);
    expect(asScript.map((p) => p.kind)).toEqual(["context"]);
    expect(actionProblems({ ...app, command: "code {cwd}" }, unsafe)).toEqual([]);
  });

  it("skips the context checks when there is no context, as in Settings", () => {
    expect(actionProblems({ ...app, command: "code {workspace}" }, null)).toEqual([]);
  });

  it("does not report a command problem for an empty command", () => {
    expect(actionProblems({ ...app, command: "  " }, ctx)).toEqual([]);
  });
});

describe("dropEmptyActions", () => {
  it("returns the ids of the rows with no command", () => {
    expect(dropEmptyActions([script, { ...app, command: " " }])).toEqual(["ac-2"]);
  });
});
