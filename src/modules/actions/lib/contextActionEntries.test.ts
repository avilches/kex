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
    expect(groups.workspace.map((e) => e.subtitle)).toEqual(["/w/src", "A workspace root is needed"]);
  });

  describe("agents", () => {
    const agent: Action = { id: "g1", name: "Claude", kind: "agent", command: "claude {cwd}", ownButton: false };

    it("are left out without a folder, which is every file row", () => {
      const groups = contextActionEntries([agent, action("code {cwd}")], [agent], ctx());
      expect(groups.workspace.map((e) => e.action.kind)).toEqual(["app"]);
      expect(groups.global).toEqual([]);
    });

    it("are offered on a folder row, started in that folder, which the line under the name says", () => {
      const groups = contextActionEntries([agent, action("code {cwd}")], [agent], ctx(), { agentFolder: "/w/src" });
      expect(groups.workspace.map((e) => e.action.kind)).toEqual(["agent", "app"]);
      expect(groups.workspace[0]).toMatchObject({ enabled: true, reason: null, subtitle: "/w/src", subtitleTrim: true, subtitleLead: "tab" });
      expect(groups.global.map((e) => e.action.kind)).toEqual(["agent"]);
    });

    it("are not blocked by a workspace with no root: the row brings its own folder", () => {
      const groups = contextActionEntries([agent], [], ctx({ workspace: "" }), { agentFolder: "/elsewhere" });
      expect(groups.workspace[0]).toMatchObject({ enabled: true, reason: null, subtitle: "/elsewhere" });
    });

    it("are muted with why when the command cannot be typed", () => {
      const bad: Action = { ...agent, command: "claude\nrm -rf" };
      const groups = contextActionEntries([bad], [], ctx(), { agentFolder: "/w" });
      expect(groups.workspace[0]).toMatchObject({ enabled: false });
      expect(groups.workspace[0]?.reason).toContain("control character");
    });
  });
});

describe("newTabActionEntries", () => {
  const agent = (command: string, name = "Agent"): Action => ({
    id: `g${n++}`,
    name,
    kind: "agent",
    command,
    ownButton: false,
  });
  const at = (folder: string, root = "/w") => ({
    ...ctx({ cwd: folder }),
    folders: { focusFolder: folder, workspaceRoot: root, workspaceCwd: root },
  });
  const script = (command: string): Action => action(command, true);
  const commands = (entries: { action: Action }[]) => entries.map((e) => e.action.command);

  it("offers every agent on any folder, started there, whatever the workspace root is", () => {
    for (const folder of ["/w", "/w/src", "/elsewhere"]) {
      const groups = newTabActionEntries([agent("claude"), agent("codex")], [agent("aider")], at(folder));
      expect(commands(groups.workspace)).toEqual(["claude", "codex"]);
      expect(commands(groups.global)).toEqual(["aider"]);
      expect(groups.workspace[0]).toMatchObject({ subtitle: folder, subtitleLead: "tab" });
    }
  });

  it("offers two agents of the same binary as two entries: nothing is a twin any more", () => {
    const groups = newTabActionEntries([agent("claude"), agent("claude --resume")], [], at("/w"));
    expect(commands(groups.workspace)).toEqual(["claude", "claude --resume"]);
  });

  it("never offers an app or a script", () => {
    const groups = newTabActionEntries([action("code {cwd}"), action("code {workspace}"), script("echo {cwd}")], [action("zed {cwd}"), script("make")], at("/w"));
    expect(groups).toEqual({ workspace: [], global: [] });
  });

  it("still offers an agent when the workspace has no root", () => {
    const groups = newTabActionEntries([agent("claude")], [], at("/w/src", ""));
    expect(commands(groups.workspace)).toEqual(["claude"]);
  });

  it("leaves out an agent whose command cannot be typed, and an Action with no command", () => {
    const groups = newTabActionEntries([agent("claude\nrm -rf"), agent("  "), agent("codex")], [], at("/w"));
    expect(commands(groups.workspace)).toEqual(["codex"]);
  });

  it("offers nothing without a folder", () => {
    expect(newTabActionEntries([agent("claude")], [], ctx())).toEqual({ workspace: [], global: [] });
  });
});
