import { describe, expect, it } from "vitest";
import {
  actionAvailability,
  actionRowTitle,
  actionSubtitle,
  actionTarget,
  agentCommandProblem,
  byKind,
  barZoneId,
  buildActionsBarModel,
  BAR_GAP,
  COMPACT_WIDTH,
  CONTEXT_RESERVE,
  NO_CONTEXT_REASON,
  hasContextActions,
  onBar,
  describeMissing,
  DROP_MENU,
  DROP_MENU_GLOBAL,
  DROP_MENU_WORKSPACE,
  MENU_DRAG_PREFIX,
  isCompactBar,
  menuEntries,
  MENUS_RESERVE,
  needsRootFix,
  ownButtonsThatFit,
  ownButtonWidth,
  paletteActions,
  parseBarZone,
  resolveDrop,
  SETTINGS_LABELS,
  scriptSubtitle,
  soleIconButtons,
  WORKSPACE_UNSET,
} from "./actionsBar";
import { inCombo } from "./actionTargets";
import type { BarContext, BarItem } from "./actionsBar";
import type { Action } from "./types";

const script = (o: Partial<Action> = {}): Action => ({
  id: "s1",
  name: "dev",
  kind: "script",
  command: "pnpm dev",
  cwdMode: "workspace",
  ownButton: false,
  ...o,
});
const app = (o: Partial<Action> = {}): Action => ({
  id: "a1",
  name: "PyCharm",
  kind: "app",
  command: "pycharm {workspace}",
  ownButton: false,
  ...o,
});

const vars = { cwd: "/p", dir: "p", workspace: "/p", filename: "", filepath: "", branch: "", repo: "", host: "mac", target: "/p" };
const ctx = { vars, shell: "posix" as const };

describe("describeMissing", () => {
  it("names what a variable needs in plain words", () => {
    expect(describeMissing(["filepath"])).toBe("needs an open file");
    expect(describeMissing(["filename"])).toBe("needs an open file");
    expect(describeMissing(["workspace"])).toBe("needs a workspace root");
    expect(describeMissing(["cwd"])).toBe("needs a folder");
    expect(describeMissing(["branch"])).toBe("needs a git branch");
    expect(describeMissing(["repo"])).toBe("needs a git repository");
  });

  it("joins several needs and falls back to the variable name", () => {
    expect(describeMissing(["filepath", "workspace"])).toBe("needs an open file and a workspace root");
    expect(describeMissing(["host"])).toBe("{host} has no value here");
  });
});

describe("actionAvailability", () => {
  it("is available when every variable has a value", () => {
    expect(actionAvailability(app(), ctx)).toBeNull();
    expect(actionAvailability(script(), ctx)).toBeNull();
  });

  it("explains the missing variable of an app", () => {
    expect(actionAvailability(app({ command: "code {filepath}" }), ctx)).toBe("needs an open file");
    expect(actionAvailability(app({ command: "code {workspace}" }), { ...ctx, vars: { ...vars, workspace: "" } })).toBe(
      WORKSPACE_UNSET,
    );
  });

  it("blocks a command with no variables while the workspace has no root, never a folder-bound one", () => {
    const rootless = { ...ctx, vars: { ...vars, workspace: "" } };
    expect(actionAvailability(script({ command: "pnpm dev" }), rootless)).toBe(WORKSPACE_UNSET);
    expect(actionAvailability(app({ command: "make {cwd}" }), rootless)).toBeNull();
    expect(actionAvailability(script({ command: "notify {host}" }), rootless)).toBeNull();
    expect(actionAvailability(script({ command: "pnpm dev" }), ctx)).toBeNull();
  });

  it("never asks a script that runs in home, the tab's folder or a fixed folder for a workspace root", () => {
    const rootless = { ...ctx, vars: { ...vars, workspace: "" } };
    for (const cwdMode of [undefined, "home", "context", "fixed"] as const) {
      expect(actionAvailability(script({ command: "pnpm dev", cwdMode }), rootless)).toBeNull();
    }
  });

  it("explains the missing variable of a script", () => {
    expect(actionAvailability(script({ command: "make {branch}" }), ctx)).toBe("needs a git branch");
  });

  it("flags a script whose value cannot be typed safely, never an app", () => {
    const risky = { ...ctx, vars: { ...vars, cwd: "/p/it's" } };
    expect(actionAvailability(script({ command: "ls {cwd}" }), risky)).toMatch(/unsafe|quote/i);
    expect(actionAvailability(app({ command: "code {cwd}" }), risky)).toBeNull();
  });

  it("flags an empty command and an unreadable one", () => {
    expect(actionAvailability(app({ command: "  " }), ctx)).toBe("it has no command");
    expect(actionAvailability(app({ command: 'code "{cwd}' }), ctx)).toMatch(/quote/i);
  });

  it("has no context outside a workspace: everything with a variable waits", () => {
    expect(actionAvailability(app(), null)).toBe("needs a workspace");
    expect(actionAvailability(app({ command: "open ." }), null)).toBeNull();
  });
});

describe("isCompactBar", () => {
  it("collapses own buttons below the compact width only", () => {
    expect(isCompactBar(COMPACT_WIDTH - 1)).toBe(true);
    expect(isCompactBar(COMPACT_WIDTH)).toBe(false);
  });
});

describe("menuEntries", () => {
  const idle = (a: Action, over: Partial<BarItem> = {}): BarItem => ({
    id: a.id,
    global: false,
    name: a.name,
    action: a,
    state: "idle",
    active: false,
    stoppable: false,
    disabledReason: null,
    needsRoot: false,
    subtitle: null,
    subtitleTrim: false,
    subtitleLead: null,
    title: null,
    iconOnly: false,
    ...over,
  });

  it("keeps the row of an Action that only lacks the workspace root enabled, so the click can take the user to set it", () => {
    expect(menuEntries(idle(app(), { disabledReason: WORKSPACE_UNSET, needsRoot: true }))).toEqual([{ kind: "main", enabled: true }]);
  });

  it("gives an idle script one row that runs it", () => {
    expect(menuEntries(idle(script()))).toEqual([{ kind: "main", enabled: true }]);
  });

  it("keeps a running script's row enabled: clicking the name focuses its tab", () => {
    expect(menuEntries(idle(script(), { state: "running", stoppable: true }))).toEqual([{ kind: "main", enabled: true }]);
  });

  it("keeps a waiting script's row enabled: clicking the name focuses its tab", () => {
    expect(menuEntries(idle(script(), { state: "waiting" }))).toEqual([{ kind: "main", enabled: true }]);
  });

  it("disables the row of a script or an app that cannot run", () => {
    expect(menuEntries(idle(script(), { disabledReason: "needs a git branch" }))).toEqual([{ kind: "main", enabled: false }]);
    expect(menuEntries(idle(app(), { disabledReason: "needs an open file" }))).toEqual([{ kind: "main", enabled: false }]);
  });
});

describe("ownButtonWidth", () => {
  it("grows with the name up to the label cap and adds the run zone of a script", () => {
    const short = ownButtonWidth(app({ name: "Zed" }));
    const long = ownButtonWidth(app({ name: "x".repeat(60) }));
    const capped = ownButtonWidth(app({ name: "x".repeat(200) }));
    expect(long).toBeGreaterThan(short);
    expect(capped).toBe(long);
    expect(ownButtonWidth(script({ name: "Zed" }))).toBeGreaterThan(short);
  });
});

describe("ownButtonsThatFit", () => {
  const four = [script({ id: "a" }), app({ id: "b" }), script({ id: "c" }), app({ id: "d" })];
  const total = four.reduce((n, a) => n + ownButtonWidth(a) + BAR_GAP, 0);

  it("keeps every button when there is room", () => {
    expect(ownButtonsThatFit(four, total + MENUS_RESERVE)).toBe(4);
  });

  it("folds the last ones first as the room shrinks, keeping the order of the others", () => {
    const widths = four.map((a) => ownButtonWidth(a) + BAR_GAP);
    const room = (n: number) => widths.slice(0, n).reduce((a, b) => a + b, 0) + MENUS_RESERVE;
    expect(ownButtonsThatFit(four, room(3))).toBe(3);
    expect(ownButtonsThatFit(four, room(2))).toBe(2);
    expect(ownButtonsThatFit(four, room(1))).toBe(1);
    expect(ownButtonsThatFit(four, room(1) - 1)).toBe(0);
  });

  it("never reports a negative or fractional count", () => {
    expect(ownButtonsThatFit(four, -50)).toBe(0);
    expect(ownButtonsThatFit([], 500)).toBe(0);
    expect(Number.isInteger(ownButtonsThatFit(four, 333.7))).toBe(true);
  });

  it("leaves room for the context combo when there is one", () => {
    const total = four.reduce((n, a) => n + ownButtonWidth(a) + BAR_GAP, 0) + MENUS_RESERVE;
    expect(ownButtonsThatFit(four, total)).toBe(4);
    expect(ownButtonsThatFit(four, total, CONTEXT_RESERVE)).toBeLessThan(4);
    expect(ownButtonsThatFit(four, total + CONTEXT_RESERVE, CONTEXT_RESERVE)).toBe(4);
  });

  it("a folder button never takes a slot nor folds a workspace one out of the bar", () => {
    const folder = script({ id: "folder", command: "agent {cwd}", ownButton: true });
    const workspace = script({ id: "workspace", ownButton: true });
    const m = buildActionsBarModel({
      local: [folder, workspace],
      context: ctx,
      states: new Map(),
      activeId: undefined,
      ownButtonsShown: 1,
      place: { file: false, folder: true },
    });
    expect(m.buttons.map((b) => b.id)).toEqual(["workspace"]);
    expect(m.menu.workspace).toEqual([]);
  });
});

describe("buildActionsBarModel", () => {
  const actions = [
    script({ id: "s1", name: "dev", ownButton: true }),
    app({ id: "a1", name: "PyCharm", ownButton: true }),
    script({ id: "s2", name: "test", command: "pnpm test" }),
    app({ id: "a2", name: "Zed", command: "zed {workspace}" }),
    script({ id: "s3", name: "build", command: "pnpm build", ownButton: true }),
  ];


  it("puts scripts before apps, each kind in user order", () => {
    const m = buildActionsBarModel({ local: actions, context: ctx, states: new Map(), activeId: undefined });
    expect(m.buttons.map((b) => b.id)).toEqual(["s1", "s3", "a1"]);
    expect(m.menu.workspace.map((b) => b.id)).toEqual(["s2", "a2"]);
    expect(m.empty).toBe(false);
  });

  it("moves every own button into its menu when none fits", () => {
    const m = buildActionsBarModel({ local: actions, context: ctx, states: new Map(), activeId: undefined, ownButtonsShown: 0 });
    expect(m.buttons).toEqual([]);
    expect(m.menu.workspace.map((b) => b.id)).toEqual(["s1", "s2", "s3", "a1", "a2"]);
  });

  it("folds only the own buttons beyond the count that fits, keeping user order in the menus", () => {
    const m = buildActionsBarModel({ local: actions, context: ctx, states: new Map(), activeId: undefined, ownButtonsShown: 2 });
    expect(m.buttons.map((b) => b.id)).toEqual(["s1", "s3"]);
    expect(m.menu.workspace.map((b) => b.id)).toEqual(["s2", "a1", "a2"]);
  });

  it("carries the run state, the active mark and the disabled reason", () => {
    const m = buildActionsBarModel({
      local: [script({ id: "s1", ownButton: true }), app({ id: "a1", command: "code {workspace}", ownButton: true })],
      context: { ...ctx, vars: { ...vars, workspace: "" } },
      states: new Map([["s1", "running"]]),
      activeId: "s1",
    });
    const [s, a] = m.buttons;
    expect(s).toMatchObject({ state: "running", active: true, disabledReason: null, stoppable: true });
    expect(a).toMatchObject({ state: "idle", active: false, disabledReason: WORKSPACE_UNSET, stoppable: false });
  });

  it("never lets a running script be disabled: it must stay stoppable", () => {
    const m = buildActionsBarModel({
      local: [script({ id: "s1", command: "make {branch}", ownButton: true })],
      context: ctx,
      states: new Map([["s1", "running"]]),
      activeId: undefined,
    });
    expect(m.buttons[0]).toMatchObject({ state: "running", disabledReason: null, stoppable: true });
  });

  it("reports empty only when there are no Actions at all", () => {
    expect(buildActionsBarModel({ local: [], context: ctx, states: new Map(), activeId: undefined }).empty).toBe(true);
  });

  it("pools non-own Actions into one menu, workspace scope first and then global", () => {
    const m = buildActionsBarModel({
      local: [script({ id: "s1", name: "dev" }), app({ id: "a0", name: "Zed", ownButton: true })],
      global: [script({ id: "s2", name: "top", command: "pnpm top" }), app({ id: "a1", name: "Code", command: "code {workspace}" })],
      context: ctx,
      states: new Map(),
      activeId: undefined,
    });
    expect(m.menu.workspace.map((b) => b.id)).toEqual(["s1"]);
    expect(m.menu.global.map((b) => b.id)).toEqual(["s2", "a1"]);
    expect(m.empty).toBe(false);
  });

  it("draws a button as its icon alone only when it is the sole button of its app", () => {
    const zedWs = app({ id: "z1", appId: "zed", name: "Zed {workspace}", ownButton: true });
    const zedFile = app({ id: "z2", appId: "zed", name: "Zed docs {workspace}", command: "zed {workspace}/docs", ownButton: true });
    const code = app({ id: "c1", appId: "code", name: "Code {workspace}", ownButton: true });
    const custom = app({ id: "u1", name: "Mine", ownButton: true });
    const dev = script({ id: "s1", ownButton: true });
    const m = buildActionsBarModel({ local: [zedWs, zedFile, code], global: [custom, dev], context: ctx, states: new Map(), activeId: undefined });
    expect(m.buttons.map((b) => [b.id, b.iconOnly])).toEqual([
      ["z1", false],
      ["z2", false],
      ["c1", true],
      ["s1", false],
      ["u1", false],
    ]);
    expect(soleIconButtons([zedWs, zedFile, code])).toEqual(new Set(["c1"]));
  });

  it("never draws a button with a picked icon as its icon alone, because the icon no longer says which app it is", () => {
    const claude: Action = { id: "g1", name: "Claude Code", kind: "agent", command: "claude", appId: "claude", cwdMode: "workspace", ownButton: true };
    expect(soleIconButtons([claude])).toEqual(new Set(["g1"]));
    expect(soleIconButtons([{ ...claude, icon: "glyph:star" }])).toEqual(new Set());
    const picked = { ...claude, id: "g2", icon: "glyph:star" };
    const plain = { ...claude, id: "g3", appId: "claude" };
    expect(soleIconButtons([picked, plain])).toEqual(new Set(["g3"]));
  });

  it("an own button of either scope still competes for the same bar room", () => {
    const m = buildActionsBarModel({
      local: [script({ id: "s1", ownButton: true })],
      global: [app({ id: "a1", ownButton: true })],
      context: ctx,
      states: new Map(),
      activeId: undefined,
      ownButtonsShown: 1,
    });
    expect(m.buttons.map((b) => b.id)).toEqual(["s1"]);
    expect(m.menu.global.map((b) => b.id)).toEqual(["a1"]);
  });

  it("labels an unnamed Action", () => {
    const m = buildActionsBarModel({
      local: [app({ name: "  ", ownButton: true })],
      context: ctx,
      states: new Map(),
      activeId: undefined,
    });
    expect(m.buttons[0]?.name).toBe("Action");
  });
});

describe("actionTarget", () => {
  it("reads the target from the variables the command uses, file first", () => {
    expect(actionTarget("code {filepath}")).toBe("file");
    expect(actionTarget("zip {filename}")).toBe("file");
    expect(actionTarget("code {filepath} {workspace}")).toBe("file");
    expect(actionTarget("agent {cwd}")).toBe("folder");
    expect(actionTarget("make {branch}")).toBe("folder");
    expect(actionTarget("pycharm {workspace}")).toBe("workspace");
    expect(actionTarget("notify {host}")).toBe("workspace");
    expect(actionTarget("pnpm dev")).toBe("workspace");
  });
});

describe("actionSubtitle", () => {
  it("shows the root for the workspace variable, Workspace in Settings, and the file name alone for the file", () => {
    expect(actionSubtitle("PyCharm {workspace}", ctx)).toEqual({ text: vars.workspace, startTrim: true, lead: "root" });
    expect(actionSubtitle("PyCharm {workspace}", SETTINGS_LABELS)).toEqual({ text: "Workspace root", startTrim: false, lead: "root" });
    expect(actionSubtitle("Code {filepath}", { ...ctx, vars: { ...vars, filepath: "/p/a.ts" } })).toEqual({
      text: "a.ts",
      startTrim: false,
      lead: "file",
    });
  });

  it("keeps the path of a folder Action and marks it for a start cut", () => {
    expect(actionSubtitle("Agent {cwd}", ctx)).toEqual({ text: "/p", startTrim: true, lead: "tab" });
    expect(actionSubtitle("Math {branch}", ctx)).toEqual({ text: "{branch}", startTrim: false });
  });

  it("says when the workspace root is missing and keeps the template for other empty values", () => {
    const empty = { ...ctx, vars: { ...vars, workspace: "" } };
    expect(actionSubtitle("PyCharm {workspace}", empty)).toEqual({ text: WORKSPACE_UNSET, startTrim: false });
    expect(actionSubtitle("Make {branch}", empty).text).toBe("{branch}");
  });

  it("keeps the template for unknown variables and skips actions without a suffix", () => {
    expect(actionSubtitle("X {stage}", ctx)).toEqual({ text: "{stage}", startTrim: false });
    expect(actionSubtitle("dev", ctx)).toEqual({ text: null, startTrim: false });
    expect(actionSubtitle("PyCharm {workspace}", null)).toEqual({ text: WORKSPACE_UNSET, startTrim: false });
  });
});

describe("scriptSubtitle", () => {
  const script = (over: Partial<Action> = {}) => ({ name: "dev", kind: "script" as const, ...over });

  it("says where a script runs when its name has no variable", () => {
    expect(scriptSubtitle(script(), ctx)).toEqual({ text: "Home", startTrim: false, lead: "home" });
    expect(scriptSubtitle(script({ cwdMode: "workspace" }), ctx)).toEqual({ text: vars.workspace, startTrim: true, lead: "root" });
    expect(scriptSubtitle(script({ cwdMode: "context" }), ctx)).toEqual({ text: "/p", startTrim: true, lead: "tab" });
    expect(scriptSubtitle(script({ cwdMode: "fixed", cwd: "/srv/app" }), ctx)).toEqual({ text: "/srv/app", startTrim: true });
  });

  it("uses the generic words in Settings, which has no folder to show", () => {
    expect(scriptSubtitle(script({ cwdMode: "context" }), SETTINGS_LABELS).text).toBe("Current folder");
    expect(scriptSubtitle(script({ cwdMode: "workspace" }), SETTINGS_LABELS)).toEqual({ text: "Workspace root", startTrim: false, lead: "root" });
  });

  it("falls back to the generic words with no folder, and says when the root is missing", () => {
    expect(scriptSubtitle(script({ cwdMode: "context" }), { ...ctx, vars: { ...vars, cwd: "" } }).text).toBe("Current folder");
    expect(scriptSubtitle(script({ cwdMode: "workspace" }), { ...ctx, vars: { ...vars, workspace: "" } }).text).toBe(WORKSPACE_UNSET);
    expect(scriptSubtitle(script({ cwdMode: "fixed" }), ctx).text).toBeNull();
  });

  it("keeps the subtitle of the variable in the name of a script", () => {
    expect(scriptSubtitle(script({ name: "Agent {cwd}", cwdMode: "fixed", cwd: "/x" }), ctx).text).toBe("/p");
  });

  it("gives an app no line under its name, wherever it is offered", () => {
    const zed = { name: "Zed", kind: "app" as const, command: "zed {target}" };
    const onFile = { ...ctx, vars: { ...vars, target: "/p/src/a.ts" }, targetKind: "file" as const };
    for (const where of [ctx, SETTINGS_LABELS, null, onFile]) {
      expect(scriptSubtitle(zed, where)).toEqual({ text: null, startTrim: false });
    }
  });
});

describe("actionRowTitle", () => {
  it("opens apps with the full place and files with the file name", () => {
    expect(actionRowTitle("PyCharm {workspace}", false, null, { ...ctx, vars: { ...vars, workspace: "/p/root" } })).toBe(
      "Open PyCharm in /p/root",
    );
    expect(actionRowTitle("Code {filepath}", false, null, { ...ctx, vars: { ...vars, filepath: "/p/a.ts" } })).toBe(
      "Open a.ts with Code",
    );
  });

  it("runs scripts instead of opening them", () => {
    expect(actionRowTitle("Agent {cwd}", true, null, ctx)).toBe("Run Agent in /p");
  });

  it("keeps the reason for a blocked row and stays quiet with nothing to say", () => {
    expect(actionRowTitle("dev", false, "needs a git branch", ctx)).toBe("dev: needs a git branch");
    expect(actionRowTitle("dev", false, null, ctx)).toBeNull();
  });
});

describe("where an Action is offered", () => {
  const withAccepts = (id: string, accepts: "file" | "folder" | "both"): Action =>
    app({ id, name: id, command: "zed {target}", accepts });
  const folderScript = script({ id: "sc", command: "agent {cwd}", name: "Agent {cwd}" });
  const fileScript = script({ id: "sf", command: "lint {filepath}", name: "Lint {filepath}" });
  const plainScript = script({ id: "sp", command: "pnpm dev" });
  const claude: Action = { id: "ag", name: "Claude", kind: "agent", command: "claude", ownButton: false };
  const all = [
    withAccepts("folder", "folder"),
    withAccepts("file", "file"),
    withAccepts("both", "both"),
    folderScript,
    fileScript,
    plainScript,
    claude,
  ];
  const onFileCtx = { ...ctx, vars: { ...vars, filepath: "/p/a.ts", filename: "a.ts" } };
  const build = (context: BarContext, place: { file: boolean; folder: boolean } | undefined, states = new Map<string, "running">()) =>
    buildActionsBarModel({ local: all, context, states, activeId: undefined, place });
  const barIds = (m: ReturnType<typeof build>) => [...m.buttons, ...m.menu.workspace].map((i) => i.id).sort();
  const comboIds = (m: ReturnType<typeof build>) => m.contextCombo.workspace.map((i) => i.id).sort();

  it("puts in the bar the agent, the plain script and every app that takes a folder, and nothing that needs a tab", () => {
    expect(barIds(build(ctx, { file: false, folder: true }))).toEqual(["ag", "both", "folder", "sp"]);
  });

  it("keeps the bar the same whatever tab is focused", () => {
    const onFolder = barIds(build(ctx, { file: false, folder: true }));
    expect(barIds(build(onFileCtx, { file: true, folder: false }))).toEqual(onFolder);
    expect(barIds(build(ctx, { file: false, folder: false }))).toEqual(onFolder);
    expect(barIds(build(ctx, undefined))).toEqual(onFolder);
  });

  it("lists in the combo, on a terminal, only the folder scripts and no app", () => {
    const m = build(ctx, { file: false, folder: true });
    expect(comboIds(m)).toEqual(["sc"]);
    expect(m.contextCombo).toMatchObject({ exists: true, kind: "folder", path: "/p", reason: null });
  });

  it("lists in the combo, on a file, the apps that take a file and the file scripts", () => {
    const m = build(onFileCtx, { file: true, folder: false });
    expect(comboIds(m)).toEqual(["both", "file", "sf"]);
    expect(m.contextCombo).toMatchObject({ exists: true, kind: "file", label: "a.ts", path: "/p/a.ts", reason: null });
  });

  it("lists an app that takes both once on a terminal (the bar) and once on a file (the combo), never twice", () => {
    const onFolder = build(ctx, { file: false, folder: true });
    expect(barIds(onFolder)).toContain("both");
    expect(comboIds(onFolder)).not.toContain("both");
    const onFile = build(onFileCtx, { file: true, folder: false });
    expect(comboIds(onFile)).toContain("both");
    expect(comboIds(onFile)).not.toContain("ag");
    expect(comboIds(onFile)).not.toContain("sp");
  });

  it("leaves the combo empty, with its reason, when the focused tab gives neither a folder nor a file", () => {
    const m = build(ctx, { file: false, folder: false });
    expect(comboIds(m)).toEqual([]);
    expect(m.contextCombo).toMatchObject({ exists: true, kind: null, reason: NO_CONTEXT_REASON });
  });

  it("opens the workspace root from the bar and the focused file from the combo", () => {
    const folder = build(ctx, { file: false, folder: true });
    const inBar = [...folder.buttons, ...folder.menu.workspace].find((i) => i.id === "both")!;
    expect(inBar.runTarget).toBeUndefined();
    const file = build(onFileCtx, { file: true, folder: false });
    expect(file.contextCombo.workspace.find((i) => i.id === "both")).toMatchObject({ runTarget: "/p/a.ts", runTargetKind: "file" });
  });

  it("has no combo at all while nothing could ever be listed in it", () => {
    const m = buildActionsBarModel({ local: [plainScript, claude], context: ctx, states: new Map(), activeId: undefined, place: { file: false, folder: true } });
    expect(m.contextCombo.exists).toBe(false);
    expect(hasContextActions([plainScript, claude], [])).toBe(false);
    expect(hasContextActions([plainScript], [withAccepts("a", "file")])).toBe(true);
  });

  it("keeps a running folder script in the bar menu so it can be stopped, and out of the combo", () => {
    const m = build(onFileCtx, { file: true, folder: false }, new Map([["sc", "running"]]));
    expect([...m.menu.workspace].map((i) => i.id)).toContain("sc");
    expect(m.menu.workspace.find((i) => i.id === "sc")).toMatchObject({ stoppable: true, disabledReason: null });
    expect(comboIds(m)).not.toContain("sc");
  });

  it("onBar holds agents, workspace scripts, apps that take a folder and anything not idle", () => {
    expect(onBar(claude, "idle")).toBe(true);
    expect(onBar(plainScript, "idle")).toBe(true);
    expect(onBar(withAccepts("a", "folder"), "idle")).toBe(true);
    expect(onBar(withAccepts("a", "both"), "idle")).toBe(true);
    expect(onBar(withAccepts("a", "file"), "idle")).toBe(false);
    expect(onBar(folderScript, "idle")).toBe(false);
    expect(onBar(fileScript, "idle")).toBe(false);
    expect(onBar(folderScript, "running")).toBe(true);
  });

  it("treats an app that never said what it accepts as a folder app: in the bar, never in the combo", () => {
    const bare = app({ id: "b", command: "zed {target}" });
    expect(onBar(bare, "idle")).toBe(true);
    expect(inCombo(bare, { file: true, folder: false })).toBe(false);
    expect(inCombo(bare, { file: false, folder: true })).toBe(false);
  });

  it("resolves the second line to what the place says and adds an Open row title", () => {
    const m = build(onFileCtx, { file: true, folder: false });
    expect(m.contextCombo.workspace.find((i) => i.id === "sf")?.subtitle).toBe("a.ts");
    const app = m.contextCombo.workspace.find((i) => i.id === "file")!;
    expect(app.disabledReason).toBeNull();
  });
});

describe("byKind", () => {
  const mixed = [script({ id: "s1" }), app({ id: "a1" }), script({ id: "s2" }), app({ id: "a2" })];

  it("partition by kind and keep the order inside each kind", () => {
    expect(byKind(mixed).map((a) => a.id)).toEqual(["s1", "s2", "a1", "a2"]);
  });
});

describe("Settings labels", () => {
  it("say what the variable stands for in the subtitle and the hover, never the raw template", () => {
    expect(actionSubtitle("Rust {cwd}", SETTINGS_LABELS)).toEqual({ text: "Current folder", startTrim: true, lead: "tab" });
    expect(actionSubtitle("Code {filepath}", SETTINGS_LABELS).text).toBe("Current file");
    expect(actionRowTitle("Rust {cwd}", false, null, SETTINGS_LABELS)).toBe("Open Rust in Current folder");
    expect(actionRowTitle("Code {filepath}", false, null, SETTINGS_LABELS)).toBe("Open Current file with Code");
  });

  it("a blocked row names the app without its variable", () => {
    expect(actionRowTitle("Rust {cwd}", false, "needs a folder", ctx)).toBe("Rust: needs a folder");
  });
});

describe("buildActionsBarModel without a limit", () => {
  it("draws every own button the room allows, however many", () => {
    const own = (id: string) => app({ id, name: id, ownButton: true });
    const m = buildActionsBarModel({
      local: ["a", "b", "c", "d", "e"].map(own),
      global: ["g1", "g2", "g3", "g4"].map(own),
      context: ctx,
      states: new Map(),
      activeId: undefined,
    });
    expect(m.buttons).toHaveLength(9);
    expect(m.menu.workspace).toEqual([]);
  });
});

describe("resolveDrop", () => {
  const b = (id: string, over: { global?: boolean; script?: boolean } = {}) => ({
    id,
    global: over.global ?? false,
    action: over.script ? script({ id }) : app({ id }),
  });
  const bar = [b("w1"), b("w2"), b("ws", { script: true }), b("g1", { global: true }), b("g2", { global: true })];
  const menu = [
    b("m1"),
    b("m2"),
    b("ms", { script: true }),
    b("mg", { global: true }),
    b("mg2", { global: true }),
    b("mgs", { global: true, script: true }),
  ];
  const row = (id: string) => `${MENU_DRAG_PREFIX}${id}`;
  const drop = (active: string, over: string, after = false) => resolveDrop(bar, menu, active, over, after);
  const base = { wasButton: true, button: true };

  it("reorders a button over another of its scope and kind, never over the other kind", () => {
    expect(drop("w1", "w2")).toEqual({ id: "w1", from: "workspace", to: "workspace", ...base, reorderOver: "w2" });
    expect(drop("w1", "ws")).toBeNull();
  });

  it("moves a button to the other scope before the button it lands on, or after it past the middle", () => {
    expect(drop("w1", "g1")).toEqual({ id: "w1", from: "workspace", to: "global", ...base, placeBefore: "g1" });
    expect(drop("w1", "g1", true)).toEqual({ id: "w1", from: "workspace", to: "global", ...base, placeBefore: "g2" });
    expect(drop("w1", "g2", true)).toEqual({ id: "w1", from: "workspace", to: "global", ...base, placeBefore: null });
    expect(drop("w1", barZoneId("global", "app"))).toEqual({ id: "w1", from: "workspace", to: "global", ...base });
    expect(drop("g1", barZoneId("workspace", "app"))).toEqual({ id: "g1", from: "global", to: "workspace", ...base });
    expect(drop("w1", barZoneId("workspace", "app"))).toBeNull();
  });

  it("takes a bar zone only for its own kind", () => {
    expect(drop("w1", barZoneId("global", "script"))).toBeNull();
    expect(drop("ws", barZoneId("global", "app"))).toBeNull();
    expect(drop("ws", barZoneId("global", "script"))).toEqual({ id: "ws", from: "workspace", to: "global", ...base });
    expect(drop(row("ms"), barZoneId("workspace", "app"))).toBeNull();
    expect(drop(row("ms"), barZoneId("workspace", "script"))).toEqual({ id: "ms", from: "workspace", to: "workspace", wasButton: false, button: true });
    expect(parseBarZone("zone:menu")).toBeNull();
    expect(parseBarZone(barZoneId("global", "script"))).toEqual({ scope: "global", kind: "script" });
  });

  it("refuses a button of the other kind in a bar scope that has some of its own kind", () => {
    const withScript = [...bar, b("gs", { global: true, script: true })];
    expect(resolveDrop(withScript, menu, "w1", "gs")).toBeNull();
    expect(resolveDrop(withScript, menu, "ws", "g1")).toBeNull();
    expect(resolveDrop(bar, menu, "ws", "g1")).toEqual({ id: "ws", from: "workspace", to: "global", ...base });
  });

  it("hides a button on the trigger, a section or a row, placing it among its kind in the menu", () => {
    const hid = { wasButton: true, button: false };
    expect(drop("w1", DROP_MENU)).toEqual({ id: "w1", from: "workspace", to: "workspace", ...hid });
    expect(drop("w1", DROP_MENU_WORKSPACE)).toEqual({ id: "w1", from: "workspace", to: "workspace", ...hid });
    expect(drop("w1", DROP_MENU_GLOBAL)).toEqual({ id: "w1", from: "workspace", to: "global", ...hid });
    expect(drop("w1", row("m1"))).toEqual({ id: "w1", from: "workspace", to: "workspace", ...hid, placeBefore: "m1" });
    expect(drop("w1", row("m2"), true)).toEqual({ id: "w1", from: "workspace", to: "workspace", ...hid, placeBefore: null });
    expect(drop("w1", row("mg"))).toEqual({ id: "w1", from: "workspace", to: "global", ...hid, placeBefore: "mg" });
    expect(drop("w1", row("mg"), true)).toEqual({ id: "w1", from: "workspace", to: "global", ...hid, placeBefore: "mg2" });
  });

  it("refuses a row of the other kind in a menu section that has some of its own kind", () => {
    expect(drop("w1", row("ms"))).toBeNull();
    expect(drop("w1", row("mgs"))).toBeNull();
  });

  it("lets a section with none of its kind take the Action on any of its rows", () => {
    const noScripts = menu.filter((i) => i.id !== "mgs");
    expect(resolveDrop(bar, noScripts, "ws", row("mg"))).toEqual({
      id: "ws",
      from: "workspace",
      to: "global",
      wasButton: true,
      button: false,
    });
  });

  it("reorders a menu row over another of its scope and kind and moves it across scopes in place", () => {
    const own = { wasButton: false, button: false };
    expect(drop(row("m1"), row("m2"))).toEqual({ id: "m1", from: "workspace", to: "workspace", ...own, reorderOver: "m2" });
    expect(drop(row("m1"), row("ms"))).toBeNull();
    expect(drop(row("m1"), row("mg"))).toEqual({ id: "m1", from: "workspace", to: "global", ...own, placeBefore: "mg" });
    expect(drop(row("m1"), row("mg"), true)).toEqual({ id: "m1", from: "workspace", to: "global", ...own, placeBefore: "mg2" });
    expect(drop(row("mg"), DROP_MENU_WORKSPACE)).toEqual({ id: "mg", from: "global", to: "workspace", ...own });
    expect(drop(row("m1"), DROP_MENU_WORKSPACE)).toBeNull();
  });

  it("shows a menu row as a button over a button or a frame of the bar, in any scope", () => {
    const show = { wasButton: false, button: true };
    expect(drop(row("m1"), "w2")).toEqual({ id: "m1", from: "workspace", to: "workspace", ...show, placeBefore: "w2" });
    expect(drop(row("m1"), "w1", true)).toEqual({ id: "m1", from: "workspace", to: "workspace", ...show, placeBefore: "w2" });
    expect(drop(row("m1"), "ws")).toBeNull();
    expect(drop(row("m1"), "g1")).toEqual({ id: "m1", from: "workspace", to: "global", ...show, placeBefore: "g1" });
    expect(drop(row("m1"), barZoneId("workspace", "app"))).toEqual({ id: "m1", from: "workspace", to: "workspace", ...show });
    expect(drop(row("m1"), barZoneId("global", "app"))).toEqual({ id: "m1", from: "workspace", to: "global", ...show });
  });

  it("makes the menu trigger no target for a row, and ignores itself and the unknown", () => {
    expect(drop(row("m1"), DROP_MENU)).toBeNull();
    expect(drop("w1", "w1")).toBeNull();
    expect(drop("w1", "ghost")).toBeNull();
    expect(drop("ghost", "w1")).toBeNull();
    expect(drop(row("ghost"), "w1")).toBeNull();
  });
});

describe("agents", () => {
  const agent = (o: Partial<Action> = {}): Action => ({
    id: "g1",
    name: "Claude Code",
    kind: "agent",
    command: "claude",
    appId: "claude",
    ownButton: true,
    ...o,
  });

  it("orders the Header agents, scripts, apps", () => {
    const mixed = [agent({ id: "g1" }), script({ id: "s1" }), app({ id: "a1" }), agent({ id: "g2" }), script({ id: "s2" })];
    expect(byKind(mixed).map((a) => a.id)).toEqual(["g1", "g2", "s1", "s2", "a1"]);
  });

  it("folds apps first, then scripts, then agents when the bar narrows", () => {
    const mixed = [
      app({ id: "a1", ownButton: true }),
      script({ id: "s1", ownButton: true }),
      agent({ id: "g1" }),
      app({ id: "a2", ownButton: true }),
    ];
    const at = (n: number) => buildActionsBarModel({ local: mixed, context: ctx, states: new Map(), activeId: undefined, ownButtonsShown: n });
    expect(at(2).buttons.map((b) => b.id)).toEqual(["g1", "s1"]);
    expect(at(2).menu.workspace.map((b) => b.id)).toEqual(["a1", "a2"]);
    expect(at(1).buttons.map((b) => b.id)).toEqual(["g1"]);
    expect(at(1).menu.workspace.map((b) => b.id)).toEqual(["s1", "a1", "a2"]);
  });

  it("never reports a state other than idle, even with a mark under its id", () => {
    const m = buildActionsBarModel({ local: [agent()], context: ctx, states: new Map([["g1", "running"]]), activeId: undefined });
    expect(m.buttons[0]).toMatchObject({ state: "idle", stoppable: false });
  });

  it("is always shown in the Header, whatever its command reads like", () => {
    const m = buildActionsBarModel({
      local: [agent({ command: "claude {filepath}" })],
      context: ctx,
      states: new Map(),
      activeId: undefined,
      place: { file: false, folder: false },
    });
    expect(m.buttons.map((b) => b.id)).toEqual(["g1"]);
    expect(m.buttons[0]?.disabledReason).toBeNull();
  });

  it("says on its second line that it starts in the workspace root, the real one or the words for it", () => {
    expect(scriptSubtitle(agent(), ctx)).toEqual({ text: "/p", startTrim: true, lead: "root" });
    expect(scriptSubtitle(agent(), SETTINGS_LABELS)).toEqual({ text: "Workspace root", startTrim: false, lead: "root" });
  });

  it("ignores any leftover folder mode: it never says Home, a fixed folder or the current folder", () => {
    for (const o of [{ cwdMode: "home" as const }, { cwdMode: "context" as const }, { cwdMode: "fixed" as const, cwd: "/srv" }]) {
      expect(scriptSubtitle(agent(o), ctx)).toEqual({ text: "/p", startTrim: true, lead: "root" });
      expect(scriptSubtitle(agent(o), SETTINGS_LABELS).text).toBe("Workspace root");
    }
  });

  it("is grey with the root message when the workspace has no root, whatever else it says", () => {
    const rootless = { ...ctx, vars: { ...vars, workspace: "" } };
    const m = buildActionsBarModel({ local: [agent()], context: rootless, states: new Map(), activeId: undefined });
    expect(m.buttons[0]).toMatchObject({ disabledReason: WORKSPACE_UNSET, subtitle: WORKSPACE_UNSET });
    expect(actionAvailability(agent(), rootless)).toBe(WORKSPACE_UNSET);
  });

  it("says it in a short sentence", () => {
    expect(WORKSPACE_UNSET).toBe("A workspace root is needed");
  });

  it("marks the lack of a root as fixable, and nothing else", () => {
    const rootless = { ...ctx, vars: { ...vars, workspace: "" } };
    const m = buildActionsBarModel({
      local: [agent(), agent({ id: "g2", command: "claude\nrm" }), app({ id: "a1", command: "code {filepath}", ownButton: true })],
      context: rootless,
      states: new Map(),
      activeId: undefined,
    });
    const byId = (id: string) =>
      [...m.buttons, ...m.menu.workspace, ...m.contextCombo.workspace].find((b) => b.id === id);
    expect(byId("g1")).toMatchObject({ disabledReason: WORKSPACE_UNSET, needsRoot: true });
    expect(byId("g2")?.needsRoot).toBe(false);
    expect(byId("g2")?.disabledReason).toMatch(/control character/);
    expect(needsRootFix(null)).toBe(false);
    expect(needsRootFix("needs a git branch")).toBe(false);
  });

  it("is not fixable once the workspace has a root", () => {
    const m = buildActionsBarModel({ local: [agent()], context: ctx, states: new Map(), activeId: undefined });
    expect(m.buttons[0]).toMatchObject({ disabledReason: null, needsRoot: false });
  });

  it("reads braces and quotes literally, and refuses a control character", () => {
    expect(actionAvailability(agent({ command: "claude {x} 'a" }), ctx)).toBeNull();
    expect(actionAvailability(agent({ command: "claude\nrm" }), ctx)).toMatch(/control character/);
  });

  it("refuses bidi marks, overrides and isolates, and nothing just outside those ranges", () => {
    for (const cp of [0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]) {
      const command = `claude ${String.fromCodePoint(cp)}x`;
      expect(agentCommandProblem(command), cp.toString(16)).toMatch(/text direction/);
    }
    for (const cp of [0x200d, 0x2030, 0x202f, 0x2065, 0x206a]) {
      expect(agentCommandProblem(`claude ${String.fromCodePoint(cp)}`), cp.toString(16)).toBeNull();
    }
  });

  it("is titled Run with its name", () => {
    const m = buildActionsBarModel({ local: [agent()], context: ctx, states: new Map(), activeId: undefined });
    expect(m.buttons[0]?.title).toBe("Run Claude Code");
  });

  it("is drawn as its icon alone when it is the sole one of its agent, apart from apps", () => {
    const m = buildActionsBarModel({
      local: [agent({ id: "g1" }), agent({ id: "g2", appId: "codex", command: "codex" }), agent({ id: "g3", appId: "codex", command: "codex" })],
      global: [app({ id: "c1", appId: "claude", ownButton: true })],
      context: ctx,
      states: new Map(),
      activeId: undefined,
    });
    expect(m.buttons.map((b) => [b.id, b.iconOnly])).toEqual([
      ["g1", true],
      ["g2", false],
      ["g3", false],
      ["c1", true],
    ]);
  });

  it("has a bar zone of its own per scope that takes no app and no script", () => {
    const bar = [
      { id: "a", global: false, action: app({ id: "a" }) },
      { id: "s", global: false, action: script({ id: "s" }) },
      { id: "g", global: false, action: agent({ id: "g" }) },
      { id: "gg", global: true, action: agent({ id: "gg" }) },
    ];
    expect(parseBarZone(barZoneId("global", "agent"))).toEqual({ scope: "global", kind: "agent" });
    expect(resolveDrop(bar, [], "a", barZoneId("global", "agent"))).toBeNull();
    expect(resolveDrop(bar, [], "s", barZoneId("global", "agent"))).toBeNull();
    expect(resolveDrop(bar, [], "g", barZoneId("global", "script"))).toBeNull();
    expect(resolveDrop(bar, [], "g", barZoneId("global", "app"))).toBeNull();
    expect(resolveDrop(bar, [], "g", barZoneId("global", "agent"))).toMatchObject({ id: "g", to: "global", button: true });
    expect(resolveDrop(bar, [], "a", "g")).toBeNull();
    expect(resolveDrop(bar, [], "g", "s")).toBeNull();
    expect(resolveDrop([...bar, { id: "ga", global: true, action: app({ id: "ga" }) }], [], "a", "gg")).toBeNull();
    expect(resolveDrop(bar, [], "a", "gg")).toEqual({ id: "a", from: "workspace", to: "global", wasButton: true, button: true });
  });
});

describe("paletteActions", () => {
  const build = (states = new Map<string, "running">()) =>
    buildActionsBarModel({
      local: [script({ id: "s1", name: "dev" }), app({ id: "a1", command: "code {filepath}" })],
      global: [script({ id: "g1", name: "lint" })],
      context: ctx,
      states,
      activeId: undefined,
    });

  it("lists the Actions that can run, workspace ones before global ones", () => {
    expect(paletteActions(build()).map((i) => i.id)).toEqual(["s1", "g1"]);
  });

  it("lists an app that is in the bar and in the combo once, so its id is never repeated", () => {
    const both = app({ id: "both", name: "Zed", command: "zed {target}", accepts: "both" });
    const model = buildActionsBarModel({
      local: [both, script({ id: "s1" })],
      context: { ...ctx, vars: { ...vars, filepath: "/p/a.ts", filename: "a.ts" } },
      states: new Map(),
      activeId: undefined,
      place: { file: true, folder: false },
    });
    expect(model.contextCombo.workspace.map((i) => i.id)).toContain("both");
    expect([...model.buttons, ...model.menu.workspace].map((i) => i.id)).toContain("both");
    const ids = paletteActions(model).map((i) => i.id);
    expect(ids.filter((id) => id === "both")).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the target of a file-only app, which is only in the combo, so the palette opens that file", () => {
    const sublime = app({ id: "sub", name: "Sublime", command: "subl {target}", accepts: "file" });
    const model = buildActionsBarModel({
      local: [sublime],
      context: { ...ctx, vars: { ...vars, filepath: "/p/src/a.ts", filename: "a.ts" } },
      states: new Map(),
      activeId: undefined,
      place: { file: true, folder: false },
    });
    const [item] = paletteActions(model);
    expect(item).toMatchObject({ id: "sub", runTarget: "/p/src/a.ts", runTargetKind: "file" });
  });

  it("lists the bar's copy, which opens the workspace root, not the combo's", () => {
    const both = app({ id: "both", name: "Zed", command: "zed {target}", accepts: "both" });
    const model = buildActionsBarModel({
      local: [both],
      context: ctx,
      states: new Map(),
      activeId: undefined,
      place: { file: false, folder: true },
    });
    expect(paletteActions(model)[0]?.runTarget).toBeUndefined();
  });

  it("leaves out the ones that cannot run now", () => {
    expect(paletteActions(build()).map((i) => i.id)).not.toContain("a1");
  });

  it("keeps a running script so it can be shown or stopped", () => {
    const model = buildActionsBarModel({
      local: [script({ id: "s1", command: "pnpm dev {filepath}" })],
      context: ctx,
      states: new Map([["s1", "running" as const]]),
      activeId: undefined,
    });
    expect(paletteActions(model).map((i) => i.id)).toEqual(["s1"]);
  });
});

describe("buildActionsBarModel arranging", () => {
  const rows = [
    script({ id: "w1", name: "Build {workspace}", command: "make {workspace}", cwdMode: "workspace", ownButton: true }),
    script({ id: "c1", name: "Test {cwd}", command: "pnpm test {cwd}", ownButton: true }),
    script({ id: "f1", name: "Lint {filepath}", command: "lint {filepath}", ownButton: true }),
    app({ id: "a1", name: "Zed", command: "zed {target}", accepts: "both", ownButton: true }),
  ];
  const build = (arranging: boolean, context = ctx, place?: { file: boolean; folder: boolean }) =>
    buildActionsBarModel({ local: rows, context, states: new Map(), activeId: undefined, arranging, place });
  const lines = (items: BarItem[]) => items.map((b) => [b.subtitle, b.subtitleLead]);
  const onFile = { ...ctx, vars: { ...vars, filepath: "/p/src/a.ts", filename: "a.ts" } };

  it("names what each variable stands for instead of today's value", () => {
    const m = build(true, ctx, { file: false, folder: true });
    expect(lines(m.buttons)).toEqual([
      ["Workspace root", "root"],
      [null, null],
    ]);
    expect(lines(m.contextCombo.workspace)).toEqual([["Current folder", "tab"]]);
    expect(lines(build(true, onFile, { file: true, folder: false }).contextCombo.workspace)).toEqual([
      ["Current file", "file"],
      [null, null],
    ]);
    expect(m.buttons[0]?.title).toBe("Run Build in Workspace root");
  });

  it("shows the real values otherwise: the root in the bar, the focused folder or file in the combo", () => {
    const m = build(false, ctx, { file: false, folder: true });
    expect(lines(m.buttons)).toEqual([
      [vars.workspace, "root"],
      [null, null],
    ]);
    expect(lines(m.contextCombo.workspace)).toEqual([["/p", "tab"]]);
    const file = build(false, onFile, { file: true, folder: false });
    expect(lines(file.contextCombo.workspace)).toEqual([
      ["a.ts", "file"],
      [null, null],
    ]);
  });

  it("gives an app no line under its name, in the bar or in the combo, and opens a different thing in each", () => {
    const m = build(false, onFile, { file: true, folder: false });
    const inBar = [...m.buttons, ...m.menu.workspace].find((i) => i.id === "a1")!;
    const inCombo = m.contextCombo.workspace.find((i) => i.id === "a1")!;
    expect([inBar.subtitle, inCombo.subtitle]).toEqual([null, null]);
    expect(inBar.title).toBe("Open Zed in the workspace root");
    expect(inCombo.title).toBe("Open a.ts with Zed");
  });

  it("words the hover of an app by place while arranging, never with an empty name", () => {
    const file = build(true, onFile, { file: true, folder: false });
    expect(file.contextCombo.workspace.find((i) => i.id === "a1")?.title).toBe("Open the current file with Zed");
  });

  it("keeps the real availability while arranging", () => {
    const rootless = { ...ctx, vars: { ...vars, workspace: "" } };
    expect(build(true, rootless).buttons[0]?.disabledReason).toBe(WORKSPACE_UNSET);
  });
});
