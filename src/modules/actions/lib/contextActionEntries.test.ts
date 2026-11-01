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
  ...(script ? { cwdMode: "workspace" as const } : { accepts: "folder" as const }),
});

const zed = (accepts: "file" | "folder" | "both", name = "Zed"): Action => ({
  id: `a${n++}`,
  name,
  kind: "app",
  command: "zed {target}",
  accepts,
  ownButton: false,
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
  target: "/w",
  ...over,
});

const ctx = (over: Record<string, string> = {}) => ({ vars: vars(over), shell: "posix" as const });

// What a menu on a row builds: {target} is the row itself, and the context says what kind it is.
const rowCtx = (kind: "file" | "folder", over: Record<string, string> = {}) => {
  const path = kind === "file" ? "/w/a.ts" : "/w/src";
  const base = ctx(kind === "file" ? { filepath: path, filename: "a.ts", ...over } : { cwd: path, ...over });
  return { ...base, vars: { ...base.vars, target: path }, targetKind: kind };
};

describe("contextActionEntries", () => {
  it("lists every Action of any target, grouped by scope", () => {
    const groups = contextActionEntries(
      [zed("both"), action("agent {cwd}", true)],
      [action("lint {filepath}", true), action("pnpm dev", true)],
      rowCtx("folder"),
      { rowKind: "folder" },
    );
    expect(groups.workspace.map((e) => e.action.command)).toEqual(["agent {cwd}", "zed {target}"]);
    expect(groups.global.map((e) => e.action.command)).toEqual(["lint {filepath}", "pnpm dev"]);
  });

  it("puts scripts before apps inside a scope, each keeping its order", () => {
    const groups = contextActionEntries(
      [action("make", true), zed("both", "Code"), action("pnpm test", true), zed("both", "Zed")],
      [],
      rowCtx("folder"),
      { rowKind: "folder" },
    );
    expect(groups.workspace.map((e) => e.action.kind)).toEqual(["script", "script", "app", "app"]);
    expect(groups.workspace.map((e) => e.action.command)).toEqual(["make", "pnpm test", "zed {target}", "zed {target}"]);
    expect(groups.workspace.slice(2).map((e) => e.action.name)).toEqual(["Code", "Zed"]);
  });

  describe("an app by what it accepts", () => {
    const entry = (accepts: "file" | "folder" | "both", kind: "file" | "folder") =>
      contextActionEntries([zed(accepts)], [], rowCtx(kind), { rowKind: kind }).workspace[0]!;

    it("is enabled on a row of a kind it takes", () => {
      for (const [accepts, kind] of [
        ["folder", "folder"],
        ["file", "file"],
        ["both", "folder"],
        ["both", "file"],
      ] as const) {
        expect(entry(accepts, kind), `${accepts} on ${kind}`).toMatchObject({ enabled: true, reason: null });
      }
    });

    it("is muted with why on a row of a kind it does not take, never hidden", () => {
      expect(entry("folder", "file")).toMatchObject({ enabled: false, reason: "takes folders only" });
      expect(entry("file", "folder")).toMatchObject({ enabled: false, reason: "takes files only" });
    });

    it("has no line under its name, the row already says where it is", () => {
      expect(entry("both", "folder")).toMatchObject({ subtitle: null, subtitleLead: null });
      expect(entry("both", "file")).toMatchObject({ subtitle: null, subtitleLead: null });
    });

    it("says on its hover what it opens: the folder of the row, or its file", () => {
      expect(entry("both", "folder").title).toBe("Open Zed in /w/src");
      expect(entry("both", "file").title).toBe("Open a.ts with Zed");
    });

    it("treats an app that never said what it accepts as one that takes folders", () => {
      const bare: Action = { id: "b", name: "Zed", kind: "app", command: "zed {target}", ownButton: false };
      expect(contextActionEntries([bare], [], rowCtx("folder"), { rowKind: "folder" }).workspace[0]).toMatchObject({ enabled: true });
      expect(contextActionEntries([bare], [], rowCtx("file"), { rowKind: "file" }).workspace[0]).toMatchObject({
        enabled: false,
        reason: "takes folders only",
      });
    });
  });

  it("a script that needs a file the row lacks is muted with why, not hidden", () => {
    const groups = contextActionEntries([action("lint {filepath}", true, "Lint {filepath}")], [], ctx());
    expect(groups.workspace).toHaveLength(1);
    expect(groups.workspace[0]).toMatchObject({ enabled: false, reason: "needs an open file" });
  });

  it("a file row fills the file scripts", () => {
    const groups = contextActionEntries(
      [action("lint {filepath}", true, "Lint {filepath}")],
      [],
      ctx({ filepath: "/w/a.ts", filename: "a.ts" }),
    );
    expect(groups.workspace[0]).toMatchObject({ enabled: true, reason: null, subtitle: "a.ts" });
  });

  it("a folder without repository information mutes the branch scripts instead of hiding them", () => {
    const groups = contextActionEntries([action("gh pr d {branch}", true)], [], ctx({ branch: "", repo: "" }));
    expect(groups.workspace[0]).toMatchObject({ enabled: false, reason: "needs a git branch" });
  });

  it("Actions with no command are skipped", () => {
    const groups = contextActionEntries([action("  ", true), action("agent {cwd}", true)], [], ctx());
    expect(groups.workspace).toHaveLength(1);
  });

  it("the subtitle of a script resolves the name variable and falls back to the workspace message", () => {
    const groups = contextActionEntries(
      [action("agent {cwd}", true, "Agent {cwd}"), action("deploy {workspace} {cwd}", true, "Deploy {workspace}")],
      [],
      ctx({ workspace: "" }),
    );
    expect(groups.workspace.map((e) => e.subtitle)).toEqual(["/w/src", "A workspace root is needed"]);
  });

  describe("agents", () => {
    const agent: Action = { id: "g1", name: "Claude", kind: "agent", command: "claude {cwd}", ownButton: false };

    it("are left out without a folder, which is every file row", () => {
      const groups = contextActionEntries([agent, zed("both")], [agent], rowCtx("file"), { rowKind: "file" });
      expect(groups.workspace.map((e) => e.action.kind)).toEqual(["app"]);
      expect(groups.global).toEqual([]);
    });

    it("are offered on a folder row, started in that folder, which the line under the name says", () => {
      const groups = contextActionEntries([agent, zed("both")], [agent], rowCtx("folder"), { agentFolder: "/w/src", rowKind: "folder" });
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
    const groups = newTabActionEntries([zed("both"), zed("folder"), script("echo {cwd}")], [zed("both"), script("make")], at("/w"));
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
