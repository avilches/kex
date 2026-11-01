import { describe, expect, it } from "vitest";
import {
  planActionRun,
  planActionStop,
  planTabReveal,
  type LinkedTab,
  type RunContext,
} from "./actionRun";
import type { Action } from "./types";

const script = (o: Partial<Action> = {}): Action => ({
  id: "ac-1",
  name: "Dev",
  kind: "script",
  command: "npm run dev",
  runs: "workspace",
  ownButton: true,
  ...o,
});
const app = (o: Partial<Action> = {}): Action => script({ kind: "app", runs: undefined, command: "code {target}", name: "VS Code", ...o });

const ctx = (o: Partial<RunContext> = {}): RunContext => ({
  shell: "posix",
  vars: { target: "/w" },
  folders: { workspaceRoot: "/w", workspaceCwd: "/w" },
  link: null,
  scriptPaneExists: false,
  atPaneLimit: false,
  ...o,
});

const link = (o: Partial<LinkedTab> = {}): LinkedTab => ({
  tabId: "tab-9",
  exists: true,
  terminal: true,
  markRunning: false,
  foreignCommand: false,
  sleeping: null,
  cwd: "/w",
  ...o,
});

describe("planActionRun, scripts", () => {
  it("blocks a root-only or folder script while the workspace has no root, with the same words the bar uses", () => {
    const rootless = ctx({ vars: { target: "" }, folders: { workspaceRoot: null, workspaceCwd: "/w" } });
    expect(planActionRun(script(), rootless)).toMatchObject({ kind: "blocked", reason: "Dev not run: A workspace root is needed" });
    expect(planActionRun(script({ runs: "folder" }), rootless)).toMatchObject({ kind: "blocked" });
    expect(planActionRun(script({ runs: "folder" }), { ...rootless, startFolder: "/row" }).kind).toBe("new-tab");
    expect(planActionRun(script(), ctx())).toMatchObject({ kind: "new-tab" });
  });

  it("opens a split scripts pane the first time", () => {
    const plan = planActionRun(script(), ctx());
    expect(plan).toMatchObject({ kind: "new-tab", placement: "split-scripts-pane", cwd: "/w", title: "Dev" });
    expect(plan.kind === "new-tab" && plan.input).toBe("npm run dev\r");
  });

  it("adds the tab to the scripts pane once it exists", () => {
    expect(planActionRun(script(), ctx({ scriptPaneExists: true }))).toMatchObject({
      kind: "new-tab",
      placement: "scripts-pane",
    });
  });

  it("falls back to the active pane at the pane limit", () => {
    expect(planActionRun(script(), ctx({ atPaneLimit: true }))).toMatchObject({
      kind: "new-tab",
      placement: "active-pane",
    });
  });

  it("does not split at the limit when the scripts pane already exists", () => {
    expect(planActionRun(script(), ctx({ atPaneLimit: true, scriptPaneExists: true }))).toMatchObject({
      placement: "scripts-pane",
    });
  });

  it("reuses the idle terminal it ran in before", () => {
    const plan = planActionRun(script(), ctx({ link: link() }));
    expect(plan).toMatchObject({ kind: "reuse-tab", tabId: "tab-9" });
  });

  it("opens a new tab when the previous one is gone", () => {
    expect(planActionRun(script(), ctx({ link: link({ exists: false }) })).kind).toBe("new-tab");
  });

  it("opens a new tab when the previous one is not a terminal", () => {
    expect(planActionRun(script(), ctx({ link: link({ terminal: false }) })).kind).toBe("new-tab");
  });

  it("opens a new tab when the user is running something of their own there", () => {
    expect(planActionRun(script(), ctx({ link: link({ foreignCommand: true }) })).kind).toBe("new-tab");
  });

  it("reports an already running script instead of starting a second run", () => {
    expect(planActionRun(script(), ctx({ link: link({ markRunning: true }) }))).toEqual({
      kind: "already-running",
      tabId: "tab-9",
    });
  });

  it("ignores a running mark on a tab that no longer exists", () => {
    expect(planActionRun(script(), ctx({ link: link({ markRunning: true, exists: false }) })).kind).toBe("new-tab");
  });

  it("wakes and reuses a sleeping linked shell that would come back empty", () => {
    const plan = planActionRun(script(), ctx({ link: link({ sleeping: "empty" }) }));
    expect(plan).toMatchObject({ kind: "reuse-tab", tabId: "tab-9", wake: true });
  });

  it("does not wake a linked tab that would come back running a command: it opens a new one", () => {
    expect(planActionRun(script(), ctx({ link: link({ sleeping: "busy" }) })).kind).toBe("new-tab");
  });

  it("reuses an awake linked terminal without waking anything", () => {
    expect(planActionRun(script(), ctx({ link: link() }))).toMatchObject({ kind: "reuse-tab", wake: false });
  });

  it("refuses an empty command by name", () => {
    expect(planActionRun(script({ command: "  " }), ctx())).toEqual({
      kind: "blocked",
      reason: "Dev not run: it has no command",
    });
  });

  it("falls back to a generic label for a blank name", () => {
    expect(planActionRun(script({ name: " ", command: "" }), ctx())).toMatchObject({
      reason: "Action not run: it has no command",
    });
  });

  it("is blocked when the folder or file it needs has no value", () => {
    const plan = planActionRun(script({ runs: "file", command: "open {target}" }), ctx({ vars: { target: "" } }));
    expect(plan.kind).toBe("blocked");
  });

  it("is blocked by a value that is unsafe in a script", () => {
    const plan = planActionRun(script({ runs: "folder", command: "ls {target}" }), ctx({ vars: { target: "/w/$(id)" }, startFolder: "/w" }));
    expect(plan.kind).toBe("blocked");
    expect(plan.kind === "blocked" && plan.reason).toContain("{target} cannot be used in a script right now");
  });

  it("is blocked by a variable inside the user's own quotes", () => {
    const plan = planActionRun(script({ runs: "folder", command: 'echo "{target}"' }), ctx());
    expect(plan.kind).toBe("blocked");
  });

  it("quotes a value with spaces in the typed line", () => {
    const plan = planActionRun(script({ runs: "folder", command: "ls {target}" }), ctx({ vars: { target: "/w/my src" }, startFolder: "/w/my src" }));
    expect(plan.kind === "new-tab" && plan.input).toContain("ls '/w/my src'");
  });

  it("quotes a PowerShell value but keeps the line the shell types", () => {
    const plan = planActionRun(script({ runs: "folder", command: "agent {target}" }), ctx({ shell: "powershell", startFolder: "/w" }));
    expect(plan.kind === "new-tab" && plan.input).toBe("agent '/w'\r");
  });
});

describe("planActionRun, script folder", () => {
  it("runs from the workspace root when it runs only there", () => {
    expect(planActionRun(script(), ctx())).toMatchObject({ cwd: "/w" });
  });

  it("runs from the folder it was offered at, else from the root", () => {
    expect(planActionRun(script({ runs: "folder" }), ctx({ startFolder: "/w/src" }))).toMatchObject({ cwd: "/w/src" });
    expect(planActionRun(script({ runs: "folder" }), ctx())).toMatchObject({ cwd: "/w" });
  });

  it("runs a file script from the folder that holds the file", () => {
    const plan = planActionRun(script({ runs: "file", command: "wc {target}" }), ctx({ vars: { target: "/w/src/a.ts" }, startFolder: "/w/src" }));
    expect(plan).toMatchObject({ cwd: "/w/src" });
  });

  it("uses the fixed folder, and needs no workspace root for it", () => {
    expect(planActionRun(script({ runs: "fixed", cwd: "/elsewhere" }), ctx())).toMatchObject({ cwd: "/elsewhere" });
    const rootless = ctx({ vars: { target: "" }, folders: { workspaceRoot: null } });
    expect(planActionRun(script({ runs: "fixed", cwd: "/elsewhere" }), rootless)).toMatchObject({ kind: "new-tab", cwd: "/elsewhere" });
  });

  it("refuses a relative fixed folder", () => {
    const plan = planActionRun(script({ runs: "fixed", cwd: "~/code" }), ctx());
    expect(plan.kind === "blocked" && plan.reason).toMatch(/^Dev not run: the folder must be an absolute path/);
  });

  it("opens a new tab when the folder differs from the reused tab's, without a cd line", () => {
    const plan = planActionRun(script({ runs: "fixed", cwd: "/elsewhere" }), ctx({ link: link() }));
    expect(plan).toMatchObject({ kind: "new-tab", cwd: "/elsewhere", input: "npm run dev\r" });
  });

  it("reuses the tab only when its folder is the folder the command would get", () => {
    const elsewhere = planActionRun(script({ runs: "folder", command: "agent {target}" }), ctx({ link: link({ cwd: "/elsewhere" }) }));
    expect(elsewhere.kind).toBe("new-tab");
    const same = planActionRun(script({ runs: "folder", command: "agent {target}" }), ctx({ link: link() }));
    expect(same.kind).toBe("reuse-tab");
  });
});

describe("planActionRun, apps", () => {
  it("spawns the expanded argv and ignores the link", () => {
    expect(planActionRun(app(), ctx({ link: link({ markRunning: true }) }))).toEqual({
      kind: "spawn-app",
      argv: ["code", "/w"],
    });
  });

  it("keeps a value with spaces as one argument", () => {
    const plan = planActionRun(app(), ctx({ vars: { target: "/w/my file.ts" } }));
    expect(plan).toEqual({ kind: "spawn-app", argv: ["code", "/w/my file.ts"] });
  });

  it("allows characters a script would refuse, as there is no shell", () => {
    const plan = planActionRun(app(), ctx({ vars: { target: "/w/a$b'c.ts" } }));
    expect(plan).toEqual({ kind: "spawn-app", argv: ["code", "/w/a$b'c.ts"] });
  });

  it("is blocked when its target has no value", () => {
    expect(planActionRun(app(), ctx({ vars: { target: "" } }))).toEqual({
      kind: "blocked",
      reason: "VS Code not run: A workspace root is needed",
    });
  });

  it("is blocked by an unterminated quote", () => {
    const plan = planActionRun(app({ command: 'code "{target}' }), ctx());
    expect(plan.kind).toBe("blocked");
  });

  describe("{target}, which is whatever the place it is offered at stands for", () => {
    const zed = app({ name: "Zed", command: "zed {target}", accepts: "both" });
    const withTarget = (target: string) => ctx({ vars: { target } });

    it("opens the workspace root from the Header, where the base value is the root", () => {
      expect(planActionRun(zed, ctx())).toEqual({ kind: "spawn-app", argv: ["zed", "/w"] });
    });

    it("opens the folder of a menu or the combo when that is what {target} is", () => {
      expect(planActionRun(zed, withTarget("/w/src/api"))).toEqual({ kind: "spawn-app", argv: ["zed", "/w/src/api"] });
    });

    it("opens a file when {target} is a file, keeping a path with spaces as one argument", () => {
      expect(planActionRun(zed, withTarget("/w/my file.ts"))).toEqual({ kind: "spawn-app", argv: ["zed", "/w/my file.ts"] });
    });

    it("runs the same app on a different thing each time, only by changing {target}", () => {
      const run = (target: string) => (planActionRun(zed, withTarget(target)) as { argv: string[] }).argv[1];
      expect([run("/a"), run("/b/c.ts"), run("/d")]).toEqual(["/a", "/b/c.ts", "/d"]);
    });

    it("says a root is needed, as the bar does, when it is the Header and there is none", () => {
      const rootless = ctx({ vars: { target: "" }, folders: { workspaceRoot: null } });
      expect(planActionRun(zed, rootless)).toEqual({ kind: "blocked", reason: "Zed not run: A workspace root is needed" });
    });

    it("still runs from a row folder when the workspace has no root: the row is the target", () => {
      const rootless = ctx({ vars: { target: "/elsewhere" }, folders: { workspaceRoot: null } });
      expect(planActionRun(zed, rootless)).toEqual({ kind: "spawn-app", argv: ["zed", "/elsewhere"] });
    });
  });
});

describe("planActionStop", () => {
  const live = { tabId: "t", exists: true, mark: "running" as const, commandSeen: true };

  it("does nothing without a tab to stop", () => {
    expect(planActionStop(null)).toEqual({ kind: "none" });
    expect(planActionStop({ ...live, exists: false })).toEqual({ kind: "none" });
  });

  it("does nothing when the Action is not running, so a tab reused by something else is left alone", () => {
    expect(planActionStop({ ...live, mark: undefined })).toEqual({ kind: "none" });
    expect(planActionStop({ ...live, mark: undefined, commandSeen: false })).toEqual({ kind: "none" });
  });

  it("types Ctrl+C on a running script and waits for the shell to confirm", () => {
    expect(planActionStop(live)).toEqual({ kind: "stop", tabId: "t", mark: "waiting", stage: "type" });
    expect(planActionStop({ ...live, commandSeen: false })).toEqual({ kind: "stop", tabId: "t", mark: false, stage: "type" });
  });

  it("signals the tree when a waiting script shows the mark again, whatever the shell reports", () => {
    expect(planActionStop({ ...live, mark: "waiting" })).toEqual({ kind: "stop", tabId: "t", mark: "waiting", stage: "signal" });
  });

  it("clears and signals a waiting script whose command was never seen", () => {
    expect(planActionStop({ ...live, mark: "waiting", commandSeen: false })).toEqual({ kind: "stop", tabId: "t", mark: false, stage: "signal" });
  });
});

describe("planTabReveal", () => {
  const at = { tabWorkspaceId: "w1", tabPaneId: "p2", activeWorkspaceId: "w1", userPaneId: "p1" };

  it("reveals a tab in another pane of this workspace without moving focus", () => {
    expect(planTabReveal(at)).toEqual({ switchWorkspace: false, mode: "reveal" });
  });

  it("activates a tab in the user's own pane", () => {
    expect(planTabReveal({ ...at, tabPaneId: "p1" })).toEqual({ switchWorkspace: false, mode: "activate" });
  });

  it("switches to the workspace that holds the tab", () => {
    expect(planTabReveal({ ...at, tabWorkspaceId: "w2" })).toEqual({ switchWorkspace: true, mode: "activate" });
  });
});

describe("planActionRun, agents", () => {
  const agent = (o: Partial<Action> = {}): Action => script({ kind: "agent", command: "claude {x}", name: "Claude", ...o });

  it("opens a new tab even when the Action has a live running tab", () => {
    const plan = planActionRun(agent(), ctx({ link: link({ markRunning: true }) }));
    expect(plan.kind).toBe("new-agent-tab");
    expect(plan.kind).not.toBe("blocked");
  });

  it("types the command verbatim with a carriage return, braces included", () => {
    const plan = planActionRun(agent(), ctx());
    expect(plan).toEqual({ kind: "new-agent-tab", input: "claude {x}\r", cwd: "/w", title: "Claude" });
  });

  it("starts in the workspace root, whatever tab is focused: an agent has no folder of its own", () => {
    expect(planActionRun(agent(), ctx())).toMatchObject({ cwd: "/w" });
    const elsewhere = ctx({ folders: { workspaceRoot: "/w", workspaceCwd: "/w/other" } });
    expect(planActionRun(agent(), elsewhere)).toMatchObject({ cwd: "/w" });
  });

  it("starts in the folder of the row it was launched from, over the workspace root", () => {
    expect(planActionRun(agent(), ctx({ startFolder: "/elsewhere/repo" }))).toMatchObject({ cwd: "/elsewhere/repo" });
    expect(planActionRun(agent(), ctx({ startFolder: "  " }))).toMatchObject({ cwd: "/w" });
  });

  it("ignores any leftover place or folder, so a stale value cannot move it", () => {
    expect(planActionRun(agent({ runs: "fixed", cwd: "/fixed" }), ctx({ folders: { workspaceRoot: "/w" } }))).toMatchObject({ cwd: "/w" });
  });

  it("blocks when there is neither a row folder nor a workspace root", () => {
    const rootless = ctx({ folders: { workspaceRoot: null, workspaceCwd: "/w" } });
    expect(planActionRun(agent(), rootless)).toMatchObject({ kind: "blocked", reason: "Claude not run: A workspace root is needed" });
  });

  it("runs from a row folder even when the workspace has no root", () => {
    const rootless = ctx({ startFolder: "/row", folders: { workspaceRoot: null, workspaceCwd: "/w" } });
    expect(planActionRun(agent(), rootless)).toMatchObject({ kind: "new-agent-tab", cwd: "/row" });
  });

  it("blocks an empty command and one with a newline", () => {
    expect(planActionRun(agent({ command: "  " }), ctx()).kind).toBe("blocked");
    expect(planActionRun(agent({ command: "claude\nrm -rf /" }), ctx()).kind).toBe("blocked");
  });

  it("refuses a tab and an escape in the command", () => {
    for (const command of ["claude\t--x", "claude \u001b[31m"]) {
      expect(planActionRun(agent({ command }), ctx())).toMatchObject({ kind: "blocked", reason: expect.stringMatching(/control character/) });
    }
  });

  it("refuses a bidi override in the command", () => {
    expect(planActionRun(agent({ command: "claude \u202e--x" }), ctx())).toMatchObject({
      kind: "blocked",
      reason: expect.stringMatching(/text direction/),
    });
  });
});
