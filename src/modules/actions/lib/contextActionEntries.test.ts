import { describe, expect, it } from "vitest";
import { contextActionEntries, newTabActionEntries } from "./contextActionEntries";
import type { Action } from "./types";

let n = 0;
const action = (command: string, script = false, name = "A"): Action => ({
  id: `a${n++}`,
  name,
  kind: script ? "script" : "app",
  command,
  ownButton: false,
  ...(script ? { cwdMode: "workspace" as const } : {}),
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

const ctx = (over: Record<string, string> = {}) => ({ vars: vars(over), shell: "posix" as const });

describe("contextActionEntries", () => {
  it("lists every Action of any target, grouped by scope", () => {
    const groups = contextActionEntries(
      [action("pycharm {workspace}"), action("agent {cwd}")],
      [action("code {filepath}"), action("pnpm dev", true)],
      ctx(),
    );
    expect(groups.workspace.map((e) => e.action.command)).toEqual(["pycharm {workspace}", "agent {cwd}"]);
    expect(groups.global.map((e) => e.action.command)).toEqual(["pnpm dev", "code {filepath}"]);
  });

  it("puts scripts before apps inside a scope, each keeping its order", () => {
    const groups = contextActionEntries(
      [action("make", true), action("code {cwd}"), action("pnpm test", true), action("zed {cwd}")],
      [],
      ctx(),
    );
    expect(groups.workspace.map((e) => e.action.command)).toEqual(["make", "pnpm test", "code {cwd}", "zed {cwd}"]);
  });

  it("an Action that needs a file the row lacks is muted with why, not hidden", () => {
    const groups = contextActionEntries([action("code {filepath}", false, "Code {filepath}")], [], ctx());
    expect(groups.workspace).toHaveLength(1);
    expect(groups.workspace[0]).toMatchObject({ enabled: false, reason: "needs an open file" });
  });

  it("a file row fills the file Actions", () => {
    const groups = contextActionEntries(
      [action("code {filepath}", false, "Code {filepath}")],
      [],
      ctx({ filepath: "/w/a.ts", filename: "a.ts" }),
    );
    expect(groups.workspace[0]).toMatchObject({ enabled: true, reason: null, subtitle: "a.ts" });
  });

  it("a folder whose git info is missing mutes the branch Actions instead of hiding them", () => {
    const groups = contextActionEntries([action("gh pr d {branch}")], [], ctx({ branch: "", repo: "" }));
    expect(groups.workspace[0]).toMatchObject({ enabled: false, reason: "needs a git branch" });
  });

  it("Actions with no command are skipped", () => {
    const groups = contextActionEntries([action("  "), action("agent {cwd}")], [], ctx());
    expect(groups.workspace).toHaveLength(1);
  });

  it("the subtitle resolves the name variable and falls back to the workspace message", () => {
    const groups = contextActionEntries(
      [action("agent {cwd}", false, "Agent {cwd}"), action("deploy {workspace} {cwd}", false, "Deploy {workspace}")],
      [],
      ctx({ workspace: "" }),
    );
    expect(groups.workspace.map((e) => e.subtitle)).toEqual(["/w/src", "Set a root to this workspace"]);
  });

  it("never offers an agent, whatever its command reads like", () => {
    const agent: Action = { id: "g1", name: "Claude", kind: "agent", command: "claude {cwd}", cwdMode: "context", ownButton: false };
    const groups = contextActionEntries([agent, action("code {cwd}")], [agent], ctx());
    expect(groups.workspace.map((e) => e.action.kind)).toEqual(["app"]);
    expect(groups.global).toEqual([]);
  });
});

describe("newTabActionEntries", () => {
  const agent = (command: string, cwdMode: "context" | "workspace", name = "Agent"): Action => ({
    id: `g${n++}`,
    name,
    kind: "agent",
    command,
    cwdMode,
    ownButton: false,
  });
  const at = (folder: string) => ({
    ...ctx({ cwd: folder }),
    folders: { focusFolder: folder, workspaceRoot: "/w", workspaceCwd: "/w" },
  });
  const none = new Map();
  const commands = (entries: { action: Action }[]) => entries.map((e) => e.action.command);

  it("in a subfolder offers the folder Actions and the current-directory scripts and agents, not the workspace ones", () => {
    const groups = newTabActionEntries(
      [action("code {cwd}"), action("pycharm {workspace}"), action("code {filepath}"), agent("claude", "context"), agent("codex", "workspace")],
      [{ ...action("make", true), cwdMode: "context" }, action("pnpm dev", true)],
      at("/w/src"),
      none,
    );
    expect(commands(groups.workspace)).toEqual(["claude", "code {cwd}"]);
    expect(commands(groups.global)).toEqual(["make"]);
  });

  it("at the workspace folder adds the workspace Actions and hides the twin that does the same", () => {
    const groups = newTabActionEntries(
      [action("code {cwd}"), action("code {workspace}"), agent("claude", "context"), agent("claude", "workspace")],
      [],
      at("/w"),
      none,
    );
    expect(commands(groups.workspace)).toEqual(["claude", "code {workspace}"]);
  });

  it("leaves out the ones that cannot run here", () => {
    const groups = newTabActionEntries([action("gh pr d {branch}")], [], { ...at("/w/src"), vars: vars({ branch: "" }) }, none);
    expect(groups.workspace).toEqual([]);
  });
});
