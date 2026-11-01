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
  runs: "fixed",
  cwd: "/work/kex",
  ownButton: true,
};
const folderScript: Action = { ...script, runs: "folder", cwd: undefined };
const app: Action = { id: "ac-2", name: "PyCharm", kind: "app", command: "pycharm {target}", icon: "app:pycharm", ownButton: false };
const agent: Action = { id: "ac-g", name: "Claude", kind: "agent", command: "claude {x} 'y", ownButton: true };

describe("commandVariableDocs", () => {
  it("lists {target} for an app and for a script on any folder or any file, and nothing else", () => {
    expect(commandVariableDocs(app).map((d) => d.name)).toEqual(["target"]);
    expect(commandVariableDocs(folderScript).map((d) => d.name)).toEqual(["target"]);
    expect(commandVariableDocs({ ...script, runs: "file" }).map((d) => d.name)).toEqual(["target"]);
    expect(commandVariableDocs(app)[0]!.description.length).toBeGreaterThan(0);
  });

  it("lists none for a script in the workspace root or one folder, nor for an agent", () => {
    expect(commandVariableDocs({ ...script, runs: "workspace" })).toEqual([]);
    expect(commandVariableDocs(script)).toEqual([]);
    expect(commandVariableDocs(agent)).toEqual([]);
  });
});

describe("actionProblems", () => {
  const ctx = { vars: { target: "/p" }, shell: "posix" as const };

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

  it("only checks the folder of a script that runs in one fixed folder", () => {
    expect(actionProblems({ ...folderScript, cwd: "relative" }, ctx)).toEqual([]);
  });

  it("refuses a variable that no longer exists", () => {
    const problems = actionProblems({ ...folderScript, command: "make -C {cwd}" }, ctx);
    expect(problems.map((p) => p.kind)).toEqual(["command"]);
    expect(problems[0]!.message).toMatch(/\{cwd\} no longer exists/);
  });

  it("notes an unsafe value for a script but not for an app", () => {
    const unsafe = { ...ctx, vars: { target: "/p/it's" } };
    const asScript = actionProblems({ ...folderScript, command: "make -C {target}" }, unsafe);
    expect(asScript.map((p) => p.kind)).toEqual(["context"]);
    expect(actionProblems(app, unsafe)).toEqual([]);
  });

  it("skips the context checks when there is no context, as in Settings", () => {
    expect(actionProblems(app, null)).toEqual([]);
  });

  it("does not report a command problem for an empty command", () => {
    expect(actionProblems({ ...app, command: "  " }, ctx)).toEqual([]);
  });

  it("reads an agent command as literal text: no variables, no quotes, and no folder to check", () => {
    expect(actionProblems(agent, ctx)).toEqual([]);
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
