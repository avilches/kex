import { describe, expect, it } from "vitest";
import { contextActionEntries } from "./contextActionEntries";
import type { Action } from "./types";

const action = (command: string, runInTerminal = false, name = "A"): Action => ({
  id: "a",
  name,
  runInTerminal,
  command,
  ownButton: false,
  ...(runInTerminal ? { cwdMode: "workspace" as const } : {}),
});

const vars = (over: Record<string, string> = {}) => ({
  cwd: "/w/src",
  dir: "src",
  branch: "main",
  repo: "w",
  workspace: "/w",
  filepath: "",
  filename: "",
  host: "mac",
  ...over,
});

describe("contextActionEntries", () => {
  it("a folder row lists only folder Actions: the workspace and file ones stay out", () => {
    const entries = contextActionEntries(
      [action("pycharm {workspace}"), action("code {filepath}"), action("agent {cwd}"), action("pnpm dev")],
      "folder",
      { vars: vars(), shell: "posix" },
    );
    expect(entries.map((e) => e.action.command)).toEqual(["agent {cwd}"]);
    expect(entries[0]).toMatchObject({ enabled: true, reason: null });
  });

  it("a file row lists only file Actions; one with a missing value is muted with why", () => {
    const entries = contextActionEntries(
      [action("code {filepath}", false, "Code {filepath}"), action("gh pr d {branch}"), action("agent {cwd}")],
      "file",
      { vars: vars({ branch: "", filepath: "/w/a.ts", filename: "a.ts" }), shell: "posix" },
    );
    expect(entries.map((e) => e.action.command)).toEqual(["code {filepath}"]);
    expect(entries[0]).toMatchObject({ enabled: true, reason: null, subtitle: "a.ts" });
  });

  it("a folder whose git info is missing mutes the branch Actions instead of hiding them", () => {
    const entries = contextActionEntries([action("gh pr d {branch}")], "folder", {
      vars: vars({ branch: "", repo: "" }),
      shell: "posix",
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ enabled: false, reason: "needs a git branch" });
  });

  it("a hibernated workspace mutes everything", () => {
    const entries = contextActionEntries([action("agent {cwd}")], "folder", {
      vars: vars(),
      shell: "posix",
      hibernated: true,
    });
    expect(entries[0]).toMatchObject({ enabled: false, reason: "workspace is hibernated" });
  });

  it("Actions with no command are skipped", () => {
    expect(contextActionEntries([action("  "), action("agent {cwd}")], "folder", { vars: vars(), shell: "posix" })).toHaveLength(1);
  });

  it("the subtitle resolves the name variable and falls back to the workspace message", () => {
    const entries = contextActionEntries(
      [action("agent {cwd}", false, "Agent {cwd}"), action("deploy {workspace} {cwd}", false, "Deploy {workspace}")],
      "folder",
      { vars: vars({ workspace: "" }), shell: "posix" },
    );
    expect(entries.map((e) => e.subtitle)).toEqual(["/w/src", "Set a root to this workspace"]);
  });
});
