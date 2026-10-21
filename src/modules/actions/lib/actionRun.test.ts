import { describe, expect, it } from "vitest";
import {
  pickRunnableAction,
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
  runInTerminal: true,
  command: "npm run dev",
  ownButton: true,
  ...o,
});
const app = (o: Partial<Action> = {}): Action => script({ runInTerminal: false, command: "code {workspace}", name: "VS Code", ...o });

const ctx = (o: Partial<RunContext> = {}): RunContext => ({
  hibernated: false,
  shell: "posix",
  vars: { cwd: "/w/src", dir: "src", filename: "", filepath: "", workspace: "/w", branch: "main", repo: "w" },
  folders: { focusFolder: "/w/src", workspaceRoot: "/w", workspaceCwd: "/w" },
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
  cwd: "/w",
  ...o,
});

describe("planActionRun, scripts", () => {
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

  it("is silent while the workspace sleeps", () => {
    expect(planActionRun(script(), ctx({ hibernated: true }))).toEqual({ kind: "blocked", reason: "", silent: true });
  });

  it("is silent while the workspace sleeps even when the command is empty", () => {
    expect(planActionRun(script({ command: " " }), ctx({ hibernated: true }))).toEqual({
      kind: "blocked",
      reason: "",
      silent: true,
    });
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

  it("is blocked by a variable with no value", () => {
    const plan = planActionRun(script({ command: "open {filepath}" }), ctx());
    expect(plan).toEqual({ kind: "blocked", reason: "Dev not run: {filepath} has no value here" });
  });

  it("names every missing variable", () => {
    const plan = planActionRun(script({ command: "x {filepath} {filename}" }), ctx());
    expect(plan).toMatchObject({ reason: "Dev not run: {filepath}, {filename} have no value here" });
  });

  it("is blocked by a value that is unsafe in a script", () => {
    const plan = planActionRun(script({ command: "ls {cwd}" }), ctx({ vars: { ...ctx().vars, cwd: "/w/$(id)" } }));
    expect(plan.kind).toBe("blocked");
    expect(plan.kind === "blocked" && plan.reason).toContain("{cwd} cannot be used in a script right now");
  });

  it("is blocked by a variable inside the user's own quotes", () => {
    const plan = planActionRun(script({ command: 'echo "{cwd}"' }), ctx());
    expect(plan.kind).toBe("blocked");
  });

  it("quotes a value with spaces in the typed line", () => {
    const plan = planActionRun(
      script({ command: "ls {cwd}" }),
      ctx({ vars: { ...ctx().vars, cwd: "/w/my src" } }),
    );
    expect(plan.kind === "new-tab" && plan.input).toContain("ls '/w/my src'");
  });

  it("quotes a PowerShell value but keeps the line the shell types", () => {
    const plan = planActionRun(script({ command: "agent {cwd}" }), ctx({ shell: "powershell" }));
    expect(plan.kind === "new-tab" && plan.input).toBe("agent '/w/src'\r");
  });
});

describe("planActionRun, script folder", () => {
  it("defaults to the workspace root", () => {
    expect(planActionRun(script(), ctx())).toMatchObject({ cwd: "/w" });
  });

  it("follows the last folder in context mode", () => {
    expect(planActionRun(script({ cwdMode: "context" }), ctx())).toMatchObject({ cwd: "/w/src" });
  });

  it("falls back to the workspace in context mode without a last folder", () => {
    const plan = planActionRun(script({ cwdMode: "context" }), ctx({ folders: { workspaceRoot: "/w" } }));
    expect(plan).toMatchObject({ cwd: "/w" });
  });

  it("uses the fixed folder", () => {
    expect(planActionRun(script({ cwdMode: "fixed", cwd: "/elsewhere" }), ctx())).toMatchObject({ cwd: "/elsewhere" });
  });

  it("falls back to the workspace when the fixed folder is blank", () => {
    expect(planActionRun(script({ cwdMode: "fixed", cwd: " " }), ctx())).toMatchObject({ cwd: "/w" });
  });

  it("refuses a relative fixed folder", () => {
    const plan = planActionRun(script({ cwdMode: "fixed", cwd: "~/code" }), ctx());
    expect(plan.kind === "blocked" && plan.reason).toMatch(/^Dev not run: the folder must be an absolute path/);
  });

  it("opens a new tab when the folder differs from the reused tab's, without a cd line", () => {
    const plan = planActionRun(script({ cwdMode: "fixed", cwd: "/elsewhere" }), ctx({ link: link() }));
    expect(plan).toMatchObject({ kind: "new-tab", cwd: "/elsewhere", input: "npm run dev\r" });
  });

  it("reuses the tab only when its folder is the folder the command would get", () => {
    const elsewhere = planActionRun(script({ command: "agent {cwd}" }), ctx({ link: link({ cwd: "/elsewhere" }) }));
    expect(elsewhere.kind).toBe("new-tab");
    const same = planActionRun(script({ command: "agent {cwd}" }), ctx({ link: link() }));
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
    const plan = planActionRun(app({ command: "code {filepath}" }), ctx({ vars: { ...ctx().vars, filepath: "/w/my file.ts" } }));
    expect(plan).toEqual({ kind: "spawn-app", argv: ["code", "/w/my file.ts"] });
  });

  it("allows characters a script would refuse, as there is no shell", () => {
    const plan = planActionRun(app({ command: "code {filepath}" }), ctx({ vars: { ...ctx().vars, filepath: "/w/a$b'c.ts" } }));
    expect(plan).toEqual({ kind: "spawn-app", argv: ["code", "/w/a$b'c.ts"] });
  });

  it("is blocked by a variable with no value", () => {
    expect(planActionRun(app({ command: "code {filepath}" }), ctx())).toEqual({
      kind: "blocked",
      reason: "VS Code not run: {filepath} has no value here",
    });
  });

  it("is blocked by an unterminated quote", () => {
    const plan = planActionRun(app({ command: 'code "{workspace}' }), ctx());
    expect(plan.kind).toBe("blocked");
  });

  it("is silent while the workspace sleeps", () => {
    expect(planActionRun(app(), ctx({ hibernated: true }))).toMatchObject({ kind: "blocked", silent: true });
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

describe("pickRunnableAction", () => {
  const a = script({ id: "a" });
  const b = script({ id: "b" });
  const empty = script({ id: "e", command: " " });

  it("picks the active one", () => {
    expect(pickRunnableAction([a, b], "b")).toBe(b);
  });

  it("falls back to the first with a command when the active one is empty", () => {
    expect(pickRunnableAction([empty, a, b], "e")).toBe(a);
  });

  it("falls back to the first with a command when none is active or the id is stale", () => {
    expect(pickRunnableAction([empty, a], undefined)).toBe(a);
    expect(pickRunnableAction([a, b], "gone")).toBe(a);
  });

  it("returns nothing when no Action has a command", () => {
    expect(pickRunnableAction([empty], "e")).toBeUndefined();
    expect(pickRunnableAction([], undefined)).toBeUndefined();
  });
});
