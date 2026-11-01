import { describe, expect, it } from "vitest";
import {
  actionAvailability,
  actionRowTitle,
  actionTarget,
  agentCommandProblem,
  byKind,
  barZoneId,
  buildActionsBarModel,
  BAR_GAP,
  COMPACT_WIDTH,
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
import { offeredAt } from "./actionTargets";
import type { BarContext, BarItem } from "./actionsBar";
import type { Action } from "./types";

const script = (o: Partial<Action> = {}): Action => ({
  id: "s1",
  name: "dev",
  kind: "script",
  command: "pnpm dev",
  runs: "workspace",
  ownButton: false,
  ...o,
});
const app = (o: Partial<Action> = {}): Action => ({
  id: "a1",
  name: "PyCharm",
  kind: "app",
  command: "pycharm {target}",
  ownButton: false,
  ...o,
});

const claude = (o: Partial<Action> = {}): Action => ({
  id: "g1",
  name: "Claude Code",
  kind: "agent",
  command: "claude",
  icon: "agent:claude",
  ownButton: true,
  ...o,
});

const vars = { target: "/p" };
const folders = { workspaceRoot: "/p", workspaceCwd: "/p" };
const ctx = { vars, shell: "posix" as const, folders };
const rootless = { vars: { target: "" }, shell: "posix" as const, folders: { workspaceRoot: null, workspaceCwd: null } };

describe("describeMissing", () => {
  it("names what {target} needs in plain words", () => {
    expect(describeMissing(["target"])).toBe("needs a folder or file to act on");
  });

  it("falls back to the variable name for anything else", () => {
    expect(describeMissing(["host"])).toBe("{host} has no value here");
  });
});

describe("actionAvailability", () => {
  it("is available when everything it needs is there", () => {
    expect(actionAvailability(app(), ctx)).toBeNull();
    expect(actionAvailability(script(), ctx)).toBeNull();
    expect(actionAvailability(script({ runs: "folder" }), ctx)).toBeNull();
    expect(actionAvailability(claude(), ctx)).toBeNull();
  });

  it("asks for the workspace root of what is offered on it, and of nothing else", () => {
    for (const action of [app(), script({ runs: "workspace" }), script({ runs: "folder", command: "ls" }), claude()]) {
      expect(actionAvailability(action, rootless), action.kind + (action.runs ?? "")).toBe(WORKSPACE_UNSET);
    }
    expect(actionAvailability(script({ runs: "fixed", cwd: "/srv" }), rootless)).toBeNull();
  });

  it("never asks a script on any file for a root: a file is not the root", () => {
    expect(actionAvailability(script({ runs: "file", command: "wc {target}" }), { ...rootless, vars: { target: "/p/a.ts" } })).toBeNull();
  });

  it("asks a file script for its file, in words", () => {
    expect(actionAvailability(script({ runs: "file", command: "wc {target}" }), { ...ctx, vars: { target: "" } })).toBe(
      "needs a folder or file to act on",
    );
  });

  it("refuses a fixed script with no folder or a relative one", () => {
    expect(actionAvailability(script({ runs: "fixed" }), ctx)).toBe("it has no folder");
    expect(actionAvailability(script({ runs: "fixed", cwd: "rel" }), ctx)).toMatch(/absolute path/);
  });

  it("flags a script whose value cannot be typed safely, never an app", () => {
    const risky = { ...ctx, vars: { target: "/p/it's" } };
    expect(actionAvailability(script({ runs: "folder", command: "ls {target}" }), risky)).toMatch(/unsafe|quote/i);
    expect(actionAvailability(app(), risky)).toBeNull();
  });

  it("flags an empty command, an unreadable one and a variable that no longer exists", () => {
    expect(actionAvailability(app({ command: "  " }), ctx)).toBe("it has no command");
    expect(actionAvailability(app({ command: 'code "{target}' }), ctx)).toMatch(/quote/i);
    expect(actionAvailability(script({ command: "ls {cwd}" }), ctx)).toMatch(/\{cwd\} no longer exists/);
  });

  it("with no context at all, only a command problem is known", () => {
    expect(actionAvailability(app(), null)).toBeNull();
    expect(actionAvailability(app({ command: "code 'x" }), null)).toMatch(/unterminated/);
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

describe("ownButtonWidth and the icon size", () => {
  it("grows with a bigger icon and shrinks with a smaller one", () => {
    const base = ownButtonWidth(app({ name: "Zed" }));
    expect(ownButtonWidth(app({ name: "Zed" }), false, 32)).toBe(base + 12);
    expect(ownButtonWidth(app({ name: "Zed" }), false, 14)).toBe(base - 6);
    expect(ownButtonWidth(app({ name: "Zed" }), true, 32)).toBeGreaterThan(ownButtonWidth(app({ name: "Zed" }), true));
  });

  it("fits fewer buttons when the icons are big", () => {
    const list = Array.from({ length: 6 }, (_, i) => app({ id: `a${i}`, name: "Zed" }));
    expect(ownButtonsThatFit(list, 420, 32)).toBeLessThan(ownButtonsThatFit(list, 420, 14));
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

  it("fits every button when the room is the buttons plus the menu", () => {
    const total = four.reduce((n, a) => n + ownButtonWidth(a) + BAR_GAP, 0) + MENUS_RESERVE;
    expect(ownButtonsThatFit(four, total)).toBe(4);
    expect(ownButtonsThatFit(four, total - 1)).toBeLessThan(4);
  });

  it("a folder script takes a slot of the Header like any other, and a file script never does", () => {
    const folder = script({ id: "folder", command: "agent {target}", runs: "folder", ownButton: true });
    const workspace = script({ id: "workspace", runs: "workspace", ownButton: true });
    const file = script({ id: "file", command: "wc {target}", runs: "file", ownButton: true });
    const m = buildActionsBarModel({
      local: [folder, workspace, file],
      context: ctx,
      states: new Map(),
      ownButtonsShown: 1,
      place: { file: false, folder: true },
    });
    expect(m.buttons.map((b) => b.id)).toEqual(["folder"]);
    expect(m.menu.workspace.map((b) => b.id)).toEqual(["workspace"]);
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


  it("puts scripts before apps, each kind in user order, and never makes an app a button", () => {
    const m = buildActionsBarModel({ local: actions, context: ctx, states: new Map() });
    expect(m.buttons.map((b) => b.id)).toEqual(["s1", "s3"]);
    expect(m.menu.workspace.map((b) => b.id)).toEqual(["s2", "a1", "a2"]);
    expect(m.empty).toBe(false);
  });

  it("moves every own button into its menu when none fits", () => {
    const m = buildActionsBarModel({ local: actions, context: ctx, states: new Map(), ownButtonsShown: 0 });
    expect(m.buttons).toEqual([]);
    expect(m.menu.workspace.map((b) => b.id)).toEqual(["s1", "s2", "s3", "a1", "a2"]);
  });

  it("folds only the own buttons beyond the count that fits, keeping user order in the menus", () => {
    const m = buildActionsBarModel({ local: actions, context: ctx, states: new Map(), ownButtonsShown: 2 });
    expect(m.buttons.map((b) => b.id)).toEqual(["s1", "s3"]);
    expect(m.menu.workspace.map((b) => b.id)).toEqual(["s2", "a1", "a2"]);
  });

  it("carries the run state and the disabled reason", () => {
    const m = buildActionsBarModel({
      local: [script({ id: "s1", ownButton: true }), script({ id: "a1", command: "code", ownButton: true })],
      context: rootless,
      states: new Map([["s1", "running"]]),
    });
    const [s, a] = m.buttons;
    expect(s).toMatchObject({ state: "running", disabledReason: null, stoppable: true });
    expect(a).toMatchObject({ state: "idle", disabledReason: WORKSPACE_UNSET, stoppable: false });
  });

  it("never lets a running script be disabled: it must stay stoppable", () => {
    const m = buildActionsBarModel({
      local: [script({ id: "s1", command: "make {branch}", ownButton: true })],
      context: ctx,
      states: new Map([["s1", "running"]]),
    });
    expect(m.buttons[0]).toMatchObject({ state: "running", disabledReason: null, stoppable: true });
  });

  it("reports empty only when there are no Actions at all", () => {
    expect(buildActionsBarModel({ local: [], context: ctx, states: new Map() }).empty).toBe(true);
  });

  it("pools non-own Actions into one menu, workspace scope first and then global", () => {
    const m = buildActionsBarModel({
      local: [script({ id: "s1", name: "dev" }), app({ id: "a0", name: "Zed", ownButton: true })],
      global: [script({ id: "s2", name: "top", command: "pnpm top" }), app({ id: "a1", name: "Code", command: "code {workspace}" })],
      context: ctx,
      states: new Map(),
    });
    expect(m.menu.workspace.map((b) => b.id)).toEqual(["s1", "a0"]);
    expect(m.menu.global.map((b) => b.id)).toEqual(["s2", "a1"]);
    expect(m.empty).toBe(false);
  });

  it("draws a button as its icon alone only when it is the sole button of its app", () => {
    const zedWs = claude({ id: "z1", icon: "agent:zed", name: "Zed {workspace}" });
    const zedFile = claude({ id: "z2", icon: "agent:zed", name: "Zed docs {workspace}", command: "zed {workspace}/docs" });
    const code = claude({ id: "c1", icon: "agent:code", name: "Code {workspace}" });
    const custom = claude({ id: "u1", icon: undefined, name: "Mine" });
    const dev = script({ id: "s1", ownButton: true });
    const m = buildActionsBarModel({ local: [zedWs, zedFile, code], global: [custom, dev], context: ctx, states: new Map() });
    expect(m.buttons.map((b) => [b.id, b.iconOnly])).toEqual([
      ["z1", false],
      ["z2", false],
      ["c1", true],
      ["u1", false],
      ["s1", false],
    ]);
    expect(soleIconButtons([zedWs, zedFile, code])).toEqual(new Set(["c1"]));
  });

  it("never draws a button with a picked icon as its icon alone, because the icon no longer says which app it is", () => {
    const claude: Action = { id: "g1", name: "Claude Code", kind: "agent", command: "claude", icon: "agent:claude", ownButton: true };
    expect(soleIconButtons([claude])).toEqual(new Set(["g1"]));
    expect(soleIconButtons([{ ...claude, icon: "glyph:star" }])).toEqual(new Set());
    const picked = { ...claude, id: "g2", icon: "glyph:star" };
    const plain = { ...claude, id: "g3" };
    expect(soleIconButtons([picked, plain])).toEqual(new Set(["g3"]));
  });

  it("an own button of either scope still competes for the same bar room", () => {
    const m = buildActionsBarModel({
      local: [script({ id: "s1", ownButton: true })],
      global: [claude({ id: "a1" })],
      context: ctx,
      states: new Map(),
      ownButtonsShown: 1,
    });
    expect(m.buttons.map((b) => b.id)).toEqual(["s1"]);
    expect(m.menu.global.map((b) => b.id)).toEqual(["a1"]);
  });

  it("labels an unnamed Action", () => {
    const m = buildActionsBarModel({
      local: [script({ name: "  ", ownButton: true })],
      context: ctx,
      states: new Map(),
    });
    expect(m.buttons[0]?.name).toBe("Action");
  });
});

describe("actionTarget", () => {
  it("reads the place of a script from where it was told to run", () => {
    expect(actionTarget({ runs: "file" })).toBe("file");
    expect(actionTarget({ runs: "folder" })).toBe("folder");
    expect(actionTarget({ runs: "workspace" })).toBe("workspace");
    expect(actionTarget({ runs: "fixed" })).toBe("workspace");
    expect(actionTarget({})).toBe("workspace");
  });
});

describe("scriptSubtitle", () => {
  const sc = (over: Partial<Action> = {}) => ({ kind: "script" as const, runs: "workspace" as const, ...over });

  it("says where a script runs only when the menu does not already say it", () => {
    expect(scriptSubtitle(sc({ runs: "workspace" }), ctx)).toEqual({ text: "/p", startTrim: true, lead: "root" });
    expect(scriptSubtitle(sc({ runs: "fixed", cwd: "/srv/app" }), ctx)).toEqual({ text: "/srv/app", startTrim: true });
  });

  it("says nothing for a script that runs where it is offered", () => {
    expect(scriptSubtitle(sc({ runs: "folder" }), ctx)).toEqual({ text: null, startTrim: false });
    expect(scriptSubtitle(sc({ runs: "file" }), ctx)).toEqual({ text: null, startTrim: false });
  });

  it("uses the generic words in Settings, which has no root to show", () => {
    expect(scriptSubtitle(sc({ runs: "workspace" }), SETTINGS_LABELS)).toEqual({ text: "Workspace root", startTrim: false, lead: "root" });
  });

  it("says when the root is missing, and has no line for a fixed script without a folder", () => {
    expect(scriptSubtitle(sc({ runs: "workspace" }), rootless).text).toBe(WORKSPACE_UNSET);
    expect(scriptSubtitle(sc({ runs: "fixed" }), ctx).text).toBeNull();
  });

  it("gives an app or an agent no line under its name, wherever it is offered", () => {
    for (const kind of ["app", "agent"] as const) {
      for (const where of [ctx, SETTINGS_LABELS, null]) {
        expect(scriptSubtitle({ kind }, where)).toEqual({ text: null, startTrim: false });
      }
    }
  });
});

describe("actionRowTitle", () => {
  it("says where a script always runs", () => {
    expect(actionRowTitle("Build", { runs: "fixed", cwd: "/srv/app" }, null, ctx)).toBe("Run Build in /srv/app");
    expect(actionRowTitle("Build", { runs: "workspace" }, null, ctx)).toBe("Run Build in /p");
  });

  it("stays quiet for a script that runs where it is offered", () => {
    expect(actionRowTitle("Build", { runs: "folder" }, null, ctx)).toBeNull();
    expect(actionRowTitle("Build", { runs: "file" }, null, ctx)).toBeNull();
  });

  it("uses the words for the root in Settings, which has no root to show", () => {
    expect(actionRowTitle("Build", { runs: "workspace" }, null, SETTINGS_LABELS)).toBe("Run Build in Workspace root");
  });

  it("keeps the reason for a blocked row", () => {
    expect(actionRowTitle("dev", { runs: "file" }, "needs a folder or file to act on", ctx)).toBe("dev: needs a folder or file to act on");
  });
});

describe("where an Action is offered", () => {
  const withAccepts = (id: string, accepts: "file" | "folder" | "both"): Action =>
    app({ id, name: id, command: "zed {target}", accepts });
  const folderScript = script({ id: "sc", command: "ls {target}", name: "Folder", runs: "folder" });
  const fileScript = script({ id: "sf", command: "lint {target}", name: "Lint", runs: "file" });
  const rootScript = script({ id: "sp", command: "pnpm dev", runs: "workspace" });
  const fixedScript = script({ id: "sx", command: "make", runs: "fixed", cwd: "/srv" });
  const agentAction: Action = { id: "ag", name: "Claude", kind: "agent", command: "claude", ownButton: false };
  const all = [withAccepts("folder", "folder"), withAccepts("file", "file"), withAccepts("both", "both"), folderScript, fileScript, rootScript, fixedScript, agentAction];
  const onFileCtx = { ...ctx, vars: { target: "/p/a.ts" }, focus: { folder: "", file: "/p/a.ts" } };
  const onFolderCtx = { ...ctx, focus: { folder: "/p/src", file: "" } };
  const build = (context: BarContext, place: { file: boolean; folder: boolean } | undefined, states = new Map<string, "running">()) =>
    buildActionsBarModel({ local: all, context, states, place });
  const barIds = (m: ReturnType<typeof build>) => [...m.buttons, ...m.menu.workspace].map((i) => i.id).sort();
  const comboIds = (m: ReturnType<typeof build>) => m.contextCombo.workspace.map((i) => i.id).sort();

  it("puts in the Header what acts on the workspace root: the agent, the apps that take a folder and every script but the file ones", () => {
    expect(barIds(build(onFolderCtx, { file: false, folder: true }))).toEqual(["ag", "both", "folder", "sc", "sp", "sx"]);
  });

  it("keeps the Header the same whatever tab is focused", () => {
    const onFolder = barIds(build(onFolderCtx, { file: false, folder: true }));
    expect(barIds(build(onFileCtx, { file: true, folder: false }))).toEqual(onFolder);
    expect(barIds(build(ctx, { file: false, folder: false }))).toEqual(onFolder);
    expect(barIds(build(ctx, undefined))).toEqual(onFolder);
  });

  it("offers on a focused terminal everything that acts on a folder, the agent and the apps included", () => {
    const m = build(onFolderCtx, { file: false, folder: true });
    expect(comboIds(m)).toEqual(["ag", "both", "folder", "sc"]);
    expect(m.contextCombo).toMatchObject({ exists: true, kind: "folder", path: "/p/src", reason: null });
  });

  it("offers on a focused file the apps that take a file and the file scripts, never the agent", () => {
    const m = build(onFileCtx, { file: true, folder: false });
    expect(comboIds(m)).toEqual(["both", "file", "sf"]);
    expect(m.contextCombo).toMatchObject({ exists: true, kind: "file", label: "a.ts", path: "/p/a.ts", reason: null });
  });

  it("lists what acts on a folder in the Header and in the terminal's submenu, with a different target in each", () => {
    const m = build(onFolderCtx, { file: false, folder: true });
    for (const id of ["ag", "both", "sc"]) {
      expect(barIds(m), id).toContain(id);
      expect(comboIds(m), id).toContain(id);
    }
    const inBar = [...m.buttons, ...m.menu.workspace].find((i) => i.id === "sc")!;
    expect(inBar.runTarget).toBeUndefined();
    expect(m.contextCombo.workspace.find((i) => i.id === "sc")).toMatchObject({ runTarget: "/p/src", runTargetKind: "folder" });
  });

  it("leaves the submenu empty, with its reason, when the focused tab gives neither a folder nor a file", () => {
    const m = build(ctx, { file: false, folder: false });
    expect(comboIds(m)).toEqual([]);
    expect(m.contextCombo).toMatchObject({ exists: true, kind: null, reason: NO_CONTEXT_REASON });
  });

  it("starts an agent offered from the submenu in the focused folder, not in the root", () => {
    const m = build(onFolderCtx, { file: false, folder: true });
    expect(m.contextCombo.workspace.find((i) => i.id === "ag")).toMatchObject({ runTarget: "/p/src", runTargetKind: "folder" });
    expect([...m.buttons, ...m.menu.workspace].find((i) => i.id === "ag")!.runTarget).toBeUndefined();
  });

  it("opens the workspace root from the Header and the focused file from the submenu", () => {
    const folder = build(onFolderCtx, { file: false, folder: true });
    const inBar = [...folder.buttons, ...folder.menu.workspace].find((i) => i.id === "both")!;
    expect(inBar.runTarget).toBeUndefined();
    const file = build(onFileCtx, { file: true, folder: false });
    expect(file.contextCombo.workspace.find((i) => i.id === "both")).toMatchObject({ runTarget: "/p/a.ts", runTargetKind: "file" });
  });

  it("has no submenu at all while nothing could ever be offered on a folder or a file", () => {
    const m = buildActionsBarModel({ local: [rootScript, fixedScript], context: ctx, states: new Map(), place: { file: false, folder: true } });
    expect(m.contextCombo.exists).toBe(false);
    expect(hasContextActions([rootScript, fixedScript], [])).toBe(false);
    expect(hasContextActions([agentAction], [])).toBe(true);
    expect(hasContextActions([rootScript], [withAccepts("a", "file")])).toBe(true);
  });

  it("keeps a running folder script in the Header menu so it can be stopped, and out of the submenu", () => {
    const m = build(onFileCtx, { file: true, folder: false }, new Map([["sc", "running"]]));
    expect([...m.menu.workspace].map((i) => i.id)).toContain("sc");
    expect(m.menu.workspace.find((i) => i.id === "sc")).toMatchObject({ stoppable: true, disabledReason: null });
    expect(comboIds(m)).not.toContain("sc");
  });

  it("onBar holds agents, every script but the file ones, apps that take a folder and anything not idle", () => {
    expect(onBar(agentAction, "idle")).toBe(true);
    expect(onBar(rootScript, "idle")).toBe(true);
    expect(onBar(fixedScript, "idle")).toBe(true);
    expect(onBar(folderScript, "idle")).toBe(true);
    expect(onBar(withAccepts("a", "folder"), "idle")).toBe(true);
    expect(onBar(withAccepts("a", "both"), "idle")).toBe(true);
    expect(onBar(withAccepts("a", "file"), "idle")).toBe(false);
    expect(onBar(fileScript, "idle")).toBe(false);
    expect(onBar(fileScript, "running")).toBe(true);
  });

  it("treats an app that never said what it accepts as a folder app: in the Header and on a folder, never on a file", () => {
    const bare = app({ id: "b", command: "zed {target}" });
    expect(onBar(bare, "idle")).toBe(true);
    expect(offeredAt(bare, "folder")).toBe(true);
    expect(offeredAt(bare, "file")).toBe(false);
  });

  it("gives a file script in the submenu no line, and leaves the app free to run", () => {
    const m = build(onFileCtx, { file: true, folder: false });
    expect(m.contextCombo.workspace.find((i) => i.id === "sf")?.subtitle).toBeNull();
    expect(m.contextCombo.workspace.find((i) => i.id === "file")!.disabledReason).toBeNull();
  });
});

describe("byKind", () => {
  const mixed = [script({ id: "s1" }), app({ id: "a1" }), script({ id: "s2" }), app({ id: "a2" })];

  it("partition by kind and keep the order inside each kind", () => {
    expect(byKind(mixed).map((a) => a.id)).toEqual(["s1", "s2", "a1", "a2"]);
  });
});

describe("Settings labels", () => {
  it("say where the root script runs in the subtitle and the hover, never a path", () => {
    expect(scriptSubtitle({ kind: "script", runs: "workspace" }, SETTINGS_LABELS)).toEqual({ text: "Workspace root", startTrim: false, lead: "root" });
    expect(actionRowTitle("Build", { runs: "workspace" }, null, SETTINGS_LABELS)).toBe("Run Build in Workspace root");
  });
});

describe("buildActionsBarModel without a limit", () => {
  it("draws every own button the room allows, however many", () => {
    const own = (id: string) => script({ id, name: id, ownButton: true });
    const m = buildActionsBarModel({
      local: ["a", "b", "c", "d", "e"].map(own),
      global: ["g1", "g2", "g3", "g4"].map(own),
      context: ctx,
      states: new Map(),
    });
    expect(m.buttons).toHaveLength(9);
    expect(m.menu.workspace).toEqual([]);
  });
});

describe("resolveDrop", () => {
  const b = (id: string, over: { global?: boolean; script?: boolean } = {}) => ({
    id,
    global: over.global ?? false,
    action: over.script ? script({ id }) : claude({ id }),
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
    expect(drop("w1", barZoneId("global", "agent"))).toEqual({ id: "w1", from: "workspace", to: "global", ...base });
    expect(drop("g1", barZoneId("workspace", "agent"))).toEqual({ id: "g1", from: "global", to: "workspace", ...base });
    expect(drop("w1", barZoneId("workspace", "agent"))).toBeNull();
  });

  it("takes a bar zone only for its own kind", () => {
    expect(drop("w1", barZoneId("global", "script"))).toBeNull();
    expect(drop("ws", barZoneId("global", "agent"))).toBeNull();
    expect(drop("ws", barZoneId("global", "script"))).toEqual({ id: "ws", from: "workspace", to: "global", ...base });
    expect(drop(row("ms"), barZoneId("workspace", "agent"))).toBeNull();
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
    expect(drop(row("m1"), barZoneId("workspace", "agent"))).toEqual({ id: "m1", from: "workspace", to: "workspace", ...show });
    expect(drop(row("m1"), barZoneId("global", "agent"))).toEqual({ id: "m1", from: "workspace", to: "global", ...show });
  });

  it("never makes an app a button: not on a bar button, not on the menu trigger of a row", () => {
    const apps = [...bar, { id: "app1", global: false, action: app({ id: "app1" }) }];
    const appRows = [...menu, { id: "mapp", global: false, action: app({ id: "mapp" }) }];
    expect(resolveDrop(apps, appRows, row("mapp"), "w1")).toBeNull();
    expect(resolveDrop(apps, appRows, row("mapp"), barZoneId("workspace", "agent"))).toBeNull();
    expect(resolveDrop(apps, appRows, row("mapp"), DROP_MENU_GLOBAL)).toEqual({
      id: "mapp",
      from: "workspace",
      to: "global",
      wasButton: false,
      button: false,
    });
    expect(parseBarZone("zone:workspace:apps")).toBeNull();
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
    icon: "agent:claude",
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
    const at = (n: number) => buildActionsBarModel({ local: mixed, context: ctx, states: new Map(), ownButtonsShown: n });
    expect(at(2).buttons.map((b) => b.id)).toEqual(["g1", "s1"]);
    expect(at(2).menu.workspace.map((b) => b.id)).toEqual(["a1", "a2"]);
    expect(at(1).buttons.map((b) => b.id)).toEqual(["g1"]);
    expect(at(1).menu.workspace.map((b) => b.id)).toEqual(["s1", "a1", "a2"]);
  });

  it("never reports a state other than idle, even with a mark under its id", () => {
    const m = buildActionsBarModel({ local: [agent()], context: ctx, states: new Map([["g1", "running"]]) });
    expect(m.buttons[0]).toMatchObject({ state: "idle", stoppable: false });
  });

  it("is always shown in the Header, whatever its command reads like", () => {
    const m = buildActionsBarModel({
      local: [agent({ command: "claude {filepath}" })],
      context: ctx,
      states: new Map(),
      place: { file: false, folder: false },
    });
    expect(m.buttons.map((b) => b.id)).toEqual(["g1"]);
    expect(m.buttons[0]?.disabledReason).toBeNull();
  });

  it("has no second line anywhere: it always starts in the workspace root, whatever folder mode it carries", () => {
    for (const o of [{}, { cwdMode: "home" as const }, { cwdMode: "context" as const }, { cwdMode: "fixed" as const, cwd: "/srv" }]) {
      expect(scriptSubtitle(agent(o), ctx).text).toBeNull();
      expect(scriptSubtitle(agent(o), SETTINGS_LABELS).text).toBeNull();
    }
  });

  it("is grey with the root message when the workspace has no root, whatever else it says", () => {
    const m = buildActionsBarModel({ local: [agent()], context: rootless, states: new Map() });
    expect(m.buttons[0]).toMatchObject({ disabledReason: WORKSPACE_UNSET, subtitle: null });
    expect(actionAvailability(agent(), rootless)).toBe(WORKSPACE_UNSET);
  });

  it("says it in a short sentence", () => {
    expect(WORKSPACE_UNSET).toBe("A workspace root is needed");
  });

  it("marks the lack of a root as fixable, and nothing else", () => {
    const m = buildActionsBarModel({
      local: [agent(), agent({ id: "g2", command: "claude\nrm" }), app({ id: "a1", command: "code {target}", ownButton: true })],
      context: rootless,
      states: new Map(),
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
    const m = buildActionsBarModel({ local: [agent()], context: ctx, states: new Map() });
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
    const m = buildActionsBarModel({ local: [agent()], context: ctx, states: new Map() });
    expect(m.buttons[0]?.title).toBe("Run Claude Code");
  });

  it("is drawn as its icon alone when it is the sole one of its agent, whatever the scope", () => {
    const m = buildActionsBarModel({
      local: [agent({ id: "g1" }), agent({ id: "g2", icon: "agent:codex", command: "codex" }), agent({ id: "g3", icon: "agent:codex", command: "codex" })],
      global: [agent({ id: "c1", icon: "agent:gemini", command: "gemini" })],
      context: ctx,
      states: new Map(),
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
    expect(resolveDrop(bar, [], "a", "gg")).toBeNull();
  });
});

describe("paletteActions", () => {
  const build = (states = new Map<string, "running">()) =>
    buildActionsBarModel({
      local: [script({ id: "s1", name: "dev" }), app({ id: "a1", command: "code {filepath}" })],
      global: [script({ id: "g1", name: "lint" })],
      context: ctx,
      states,
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
      context: { ...ctx, vars: { target: "/p/src/a.ts" }, focus: { folder: "", file: "/p/src/a.ts" } },
      states: new Map(),
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
    });
    expect(paletteActions(model).map((i) => i.id)).toEqual(["s1"]);
  });
});

describe("buildActionsBarModel arranging", () => {
  const rows = [
    script({ id: "w1", name: "Build", command: "make", runs: "workspace", ownButton: true }),
    script({ id: "c1", name: "Test", command: "pnpm test {target}", runs: "folder", ownButton: true }),
    script({ id: "f1", name: "Lint", command: "lint {target}", runs: "file", ownButton: true }),
    app({ id: "a1", name: "Zed", command: "zed {target}", accepts: "both", ownButton: true }),
  ];
  const build = (arranging: boolean, context: BarContext = ctx, place?: { file: boolean; folder: boolean }) =>
    buildActionsBarModel({ local: rows, context, states: new Map(), arranging, place });
  const lines = (items: BarItem[]) => items.map((b) => [b.subtitle, b.subtitleLead]);
  const onFolder = { ...ctx, focus: { folder: "/p/src", file: "" } };
  const onFile = { ...ctx, vars: { target: "/p/src/a.ts" }, focus: { folder: "", file: "/p/src/a.ts" } };

  it("names where the root script runs instead of today's value, and nothing for the others", () => {
    const m = build(true, onFolder, { file: false, folder: true });
    expect(lines(m.buttons)).toEqual([["Workspace root", "root"], [null, null]]);
    expect(m.buttons[0]?.title).toBe("Run Build in Workspace root");
    expect(lines(m.contextCombo.workspace)).toEqual([[null, null], [null, null]]);
  });

  it("shows the real root in the Header and no line in the submenu, where the row already names the place", () => {
    const m = build(false, onFolder, { file: false, folder: true });
    expect(lines(m.buttons)).toEqual([["/p", "root"], [null, null]]);
    expect(lines(m.contextCombo.workspace)).toEqual([[null, null], [null, null]]);
    expect(lines(build(false, onFile, { file: true, folder: false }).contextCombo.workspace)).toEqual([
      [null, null],
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
    const m = build(true, rootless);
    expect(m.buttons.find((b) => b.id === "w1")?.disabledReason).toBe(WORKSPACE_UNSET);
  });
});
