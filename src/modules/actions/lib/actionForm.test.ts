import { describe, expect, it } from "vitest";
import {
  actionProblems,
  commandDraft,
  commandVariableDocs,
  commitCommand,
} from "./actionForm";
import type { Action } from "./types";

const script: Action = {
  id: "ac-1",
  name: "Dev",
  kind: "script",
  command: "pnpm dev",
  cwdMode: "fixed",
  cwd: "/work/kex",
  ownButton: true,
};
const app: Action = { id: "ac-2", name: "PyCharm", kind: "app", command: "pycharm {cwd}", appId: "pycharm", ownButton: false };

describe("commandVariableDocs", () => {
  it("lists only the variables a command can have a value for, with their descriptions", () => {
    const docs = commandVariableDocs();
    expect(docs.map((d) => d.name)).toEqual(["cwd", "dir", "branch", "repo", "workspace", "filename", "filepath", "host"]);
    expect(docs.every((d) => d.description.length > 0)).toBe(true);
  });
});

describe("actionProblems", () => {
  const ctx = { vars: { cwd: "/p", workspace: "", filefilepath: "", branch: "", repo: "", dir: "p", filename: "", host: "h" }, shell: "posix" as const };

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

describe("commandDraft", () => {
  it("shows what is being typed while the box has focus, even when the stored command changes", () => {
    expect(commandDraft({ draft: "pnpm de", stored: "pnpm dev", focused: true })).toEqual({ shown: "pnpm de", required: false });
  });

  it("follows the stored command when the box is not focused", () => {
    expect(commandDraft({ draft: "old", stored: "new", focused: false })).toEqual({ shown: "new", required: false });
  });

  it("flags an empty draft as required without touching the stored command", () => {
    expect(commandDraft({ draft: "  ", stored: "pnpm dev", focused: true })).toEqual({ shown: "  ", required: true });
  });

  it("an empty draft after losing focus goes back to the stored command", () => {
    expect(commandDraft({ draft: "", stored: "pnpm dev", focused: false })).toEqual({ shown: "pnpm dev", required: false });
  });

  it("a brand new row with no stored command keeps showing the empty box and asks for a command", () => {
    expect(commandDraft({ draft: "", stored: "", focused: false })).toEqual({ shown: "", required: true });
  });

  it("a row that is not saved yet keeps what was typed, since there is no earlier value to go back to", () => {
    expect(commandDraft({ draft: "pnpm build", stored: "pnpm test", focused: false, saved: false })).toEqual({
      shown: "pnpm build",
      required: false,
    });
  });

  it("an unsaved row still flags an empty command", () => {
    expect(commandDraft({ draft: " ", stored: "pnpm test", focused: false, saved: false })).toEqual({
      shown: " ",
      required: true,
    });
  });
});

describe("commitCommand", () => {
  it("saves a non-empty command, trimmed", () => {
    expect(commitCommand("pnpm dev", "  pnpm test ")).toEqual({ save: "pnpm test" });
  });

  it("saves nothing for an empty command, so the last valid one stays", () => {
    expect(commitCommand("pnpm dev", "   ")).toEqual({ save: null });
  });

  it("saves nothing when the command did not change", () => {
    expect(commitCommand("pnpm dev", "pnpm dev")).toEqual({ save: null });
  });
});
