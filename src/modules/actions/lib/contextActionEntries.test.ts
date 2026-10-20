import { describe, expect, it } from "vitest";
import { contextActionEntries } from "./contextActionEntries";
import type { Action } from "./types";

const action = (command: string, runInTerminal = false): Action => ({
  id: "a",
  name: "A",
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
  it("a folder row does not list Actions that need a file, and lists the rest", () => {
    const entries = contextActionEntries([action("pycharm {workspace}"), action("code {filepath}")], "folder", {
      vars: vars(),
      shell: "posix",
    });
    expect(entries.map((e) => e.action.command)).toEqual(["pycharm {workspace}"]);
    expect(entries[0]).toMatchObject({ enabled: true, reason: null });
  });

  it("a file row lists every Action; one with a missing value is muted with why", () => {
    const entries = contextActionEntries(
      [action("code {filepath}"), action("gh pr d {branch}")],
      "file",
      { vars: vars({ branch: "", filepath: "/w/a.ts", filename: "a.ts" }), shell: "posix" },
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ enabled: true, reason: null });
    expect(entries[1]).toMatchObject({ enabled: false, reason: "needs a git branch" });
  });

  it("a folder whose git info is missing mutes the branch Actions instead of hiding them", () => {
    const entries = contextActionEntries([action("gh pr d {branch}")], "folder", {
      vars: vars({ branch: "", repo: "" }),
      shell: "posix",
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ enabled: false, reason: "needs a git branch" });
  });

  it("a file folder context outside a workspace mutes the workspace Actions", () => {
    const entries = contextActionEntries([action("pycharm {workspace}"), action("code {filepath}")], "file", {
      vars: vars({ workspace: "", filepath: "/a.ts", filename: "a.ts" }),
      shell: "posix",
    });
    expect(entries.map((e) => e.enabled)).toEqual([false, true]);
    expect(entries[0]?.reason).toBe("needs a workspace root");
  });

  it("a hibernated workspace mutes everything", () => {
    const entries = contextActionEntries([action("pycharm {workspace}")], "folder", {
      vars: vars(),
      shell: "posix",
      hibernated: true,
    });
    expect(entries[0]).toMatchObject({ enabled: false, reason: "workspace is hibernated" });
  });

  it("Actions with no command are skipped and no context mutes every row by command alone", () => {
    expect(contextActionEntries([action("  "), action("pycharm {workspace}")], "folder", null)).toHaveLength(1);
  });
});
