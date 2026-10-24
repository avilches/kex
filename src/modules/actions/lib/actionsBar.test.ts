import { describe, expect, it } from "vitest";
import {
  actionAvailability,
  actionRowTitle,
  actionShownAt,
  actionSubtitle,
  actionTarget,
  appsFirst,
  barZoneId,
  buildActionsBarModel,
  BAR_GAP,
  COMPACT_WIDTH,
  describeMissing,
  DROP_MENU,
  DROP_MENU_GLOBAL,
  DROP_MENU_WORKSPACE,
  MENU_DRAG_PREFIX,
  isCompactBar,
  menuEntries,
  MENUS_RESERVE,
  ownButtonsThatFit,
  ownButtonWidth,
  parseBarZone,
  resolveDrop,
  SETTINGS_LABELS,
  scriptsFirst,
  scriptSubtitle,
  soleIconButtons,
  WORKSPACE_UNSET,
} from "./actionsBar";
import type { BarItem } from "./actionsBar";
import type { Action } from "./types";

const script = (o: Partial<Action> = {}): Action => ({
  id: "s1",
  name: "dev",
  kind: "script" as const,
  command: "pnpm dev",
  cwdMode: "workspace",
  ownButton: false,
  ...o,
});
const app = (o: Partial<Action> = {}): Action => ({
  id: "a1",
  name: "PyCharm",
  kind: "app" as const,
  command: "pycharm {workspace}",
  ownButton: false,
  ...o,
});

const vars = { cwd: "/p", dir: "p", workspace: "/p", filename: "", filepath: "", branch: "", repo: "", host: "mac" };
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
      "Set a root to this workspace",
    );
  });

  it("blocks a command with no variables while the workspace has no root, never a folder-bound one", () => {
    const rootless = { ...ctx, vars: { ...vars, workspace: "" } };
    expect(actionAvailability(script({ command: "pnpm dev" }), rootless)).toBe("Set a root to this workspace");
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

  it("reports a hibernated workspace instead of doing nothing, ahead of every other reason", () => {
    const asleep = { ...ctx, hibernated: true };
    expect(actionAvailability(app(), asleep)).toBe("workspace is hibernated");
    expect(actionAvailability(script(), asleep)).toBe("workspace is hibernated");
    expect(actionAvailability(app({ command: "code {filepath}" }), asleep)).toBe("workspace is hibernated");
    expect(actionAvailability(app({ command: "  " }), asleep)).toBe("it has no command");
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
    subtitle: null,
    subtitleTrim: false,
    title: null,
    iconOnly: false,
    ...over,
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

  it("does not spend a slot on an Action the place hides", () => {
    const hidden = script({ id: "hidden", name: "One", command: "agent {cwd}" });
    const visible = script({ id: "visible", name: "Two" });
    const room = [hidden, visible].reduce((n, a) => n + ownButtonWidth(a) + BAR_GAP, 0) + MENUS_RESERVE;
    const file = { file: true, folder: false };
    const folder = { file: false, folder: true };
    expect(ownButtonsThatFit([hidden, visible], room, file)).toBe(1);
    expect(ownButtonsThatFit([hidden, visible], room, folder)).toBe(2);
    const running = new Map([["hidden", "running" as const]]);
    expect(ownButtonsThatFit([hidden, visible], room, file, running)).toBe(2);
    expect(ownButtonsThatFit([hidden, visible], room, folder, running)).toBe(2);
  });

  it("a hidden own button never folds a visible one out of the bar", () => {
    const hidden = script({ id: "hidden", command: "agent {cwd}", ownButton: true });
    const visible = script({ id: "visible", ownButton: true });
    const m = buildActionsBarModel({
      local: [hidden, visible],
      context: ctx,
      states: new Map(),
      activeId: undefined,
      ownButtonsShown: 1,
      place: { file: true, folder: false },
    });
    expect(m.buttons.map((b) => b.id)).toEqual(["visible"]);
    expect(m.menu.workspace).toEqual([]);
  });
});

describe("buildActionsBarModel", () => {
  const actions = [
    script({ id: "s1", name: "dev", ownButton: true }),
    app({ id: "a1", name: "PyCharm", ownButton: true }),
    script({ id: "s2", name: "test" }),
    app({ id: "a2", name: "Zed" }),
    script({ id: "s3", name: "build", ownButton: true }),
  ];


  it("puts apps before scripts, each kind in user order", () => {
    const m = buildActionsBarModel({ local: actions, context: ctx, states: new Map(), activeId: undefined });
    expect(m.buttons.map((b) => b.id)).toEqual(["a1", "s1", "s3"]);
    expect(m.menu.workspace.map((b) => b.id)).toEqual(["a2", "s2"]);
    expect(m.empty).toBe(false);
  });

  it("moves every own button into its menu when none fits", () => {
    const m = buildActionsBarModel({ local: actions, context: ctx, states: new Map(), activeId: undefined, ownButtonsShown: 0 });
    expect(m.buttons).toEqual([]);
    expect(m.menu.workspace.map((b) => b.id)).toEqual(["a1", "a2", "s1", "s2", "s3"]);
  });

  it("folds only the own buttons beyond the count that fits, keeping user order in the menus", () => {
    const m = buildActionsBarModel({ local: actions, context: ctx, states: new Map(), activeId: undefined, ownButtonsShown: 2 });
    expect(m.buttons.map((b) => b.id)).toEqual(["a1", "s1"]);
    expect(m.menu.workspace.map((b) => b.id)).toEqual(["a2", "s2", "s3"]);
  });

  it("carries the run state, the active mark and the disabled reason", () => {
    const m = buildActionsBarModel({
      local: [script({ id: "s1", ownButton: true }), app({ id: "a1", command: "code {filepath}", ownButton: true })],
      context: ctx,
      states: new Map([["s1", "running"]]),
      activeId: "s1",
    });
    const [a, s] = m.buttons;
    expect(s).toMatchObject({ state: "running", active: true, disabledReason: null, stoppable: true });
    expect(a).toMatchObject({ state: "idle", active: false, disabledReason: "needs an open file", stoppable: false });
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

  it("marks every Action of a hibernated workspace unavailable but lets a running script be stopped", () => {
    const m = buildActionsBarModel({
      local: [script({ id: "s1", ownButton: true }), script({ id: "s2", ownButton: true }), app({ id: "a1", ownButton: true })],
      context: { ...ctx, hibernated: true },
      states: new Map([["s1", "running"]]),
      activeId: undefined,
    });
    expect(m.buttons.map((b) => b.disabledReason)).toEqual(["workspace is hibernated", null, "workspace is hibernated"]);
  });

  it("reports empty only when there are no Actions at all", () => {
    expect(buildActionsBarModel({ local: [], context: ctx, states: new Map(), activeId: undefined }).empty).toBe(true);
  });

  it("pools non-own Actions into one menu, workspace scope first and then global", () => {
    const m = buildActionsBarModel({
      local: [script({ id: "s1", name: "dev" }), app({ id: "a0", name: "Zed", ownButton: true })],
      global: [script({ id: "s2", name: "top" }), app({ id: "a1", name: "Code" })],
      context: ctx,
      states: new Map(),
      activeId: undefined,
    });
    expect(m.menu.workspace.map((b) => b.id)).toEqual(["s1"]);
    expect(m.menu.global.map((b) => b.id)).toEqual(["a1", "s2"]);
    expect(m.empty).toBe(false);
  });

  it("draws a button as its icon alone only when it is the sole button of its app", () => {
    const zedWs = app({ id: "z1", appId: "zed", name: "Zed {workspace}", ownButton: true });
    const zedFile = app({ id: "z2", appId: "zed", name: "Zed {filepath}", command: "zed {filepath}", ownButton: true });
    const code = app({ id: "c1", appId: "code", name: "Code {workspace}", ownButton: true });
    const custom = app({ id: "u1", name: "Mine", ownButton: true });
    const dev = script({ id: "s1", ownButton: true });
    const m = buildActionsBarModel({ local: [zedWs, zedFile, code], global: [custom, dev], context: ctx, states: new Map(), activeId: undefined });
    expect(m.buttons.map((b) => [b.id, b.iconOnly])).toEqual([
      ["z1", false],
      ["z2", false],
      ["c1", true],
      ["u1", false],
      ["s1", false],
    ]);
    expect(soleIconButtons([zedWs, zedFile, code])).toEqual(new Set(["c1"]));
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

describe("actionShownAt", () => {
  const place = { file: true, folder: false };
  it("shows file Actions on a file, folder Actions in a folder and workspace Actions everywhere", () => {
    expect(actionShownAt("file", place)).toBe(true);
    expect(actionShownAt("folder", place)).toBe(false);
    expect(actionShownAt("workspace", place)).toBe(true);
    expect(actionShownAt("workspace", "all")).toBe(true);
  });
});

describe("actionSubtitle", () => {
  it("shows the root for the workspace variable, Workspace in Settings, and the file name alone for the file", () => {
    expect(actionSubtitle("PyCharm {workspace}", ctx)).toEqual({ text: vars.workspace, startTrim: true });
    expect(actionSubtitle("PyCharm {workspace}", SETTINGS_LABELS)).toEqual({ text: "Workspace", startTrim: false });
    expect(actionSubtitle("Code {filepath}", { ...ctx, vars: { ...vars, filepath: "/p/a.ts" } })).toEqual({
      text: "a.ts",
      startTrim: false,
    });
  });

  it("keeps the path of a folder Action and marks it for a start cut", () => {
    expect(actionSubtitle("Agent {cwd}", ctx)).toEqual({ text: "/p", startTrim: true });
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
    expect(scriptSubtitle(script(), ctx)).toEqual({ text: "Home", startTrim: false });
    expect(scriptSubtitle(script({ cwdMode: "workspace" }), ctx)).toEqual({ text: "Workspace", startTrim: false });
    expect(scriptSubtitle(script({ cwdMode: "context" }), ctx)).toEqual({ text: "/p", startTrim: true });
    expect(scriptSubtitle(script({ cwdMode: "fixed", cwd: "/srv/app" }), ctx)).toEqual({ text: "/srv/app", startTrim: true });
  });

  it("uses the generic words in Settings, which has no folder to show", () => {
    expect(scriptSubtitle(script({ cwdMode: "context" }), SETTINGS_LABELS).text).toBe("Current folder");
    expect(scriptSubtitle(script({ cwdMode: "workspace" }), SETTINGS_LABELS).text).toBe("Workspace");
  });

  it("falls back to the generic words with no folder, and says when the root is missing", () => {
    expect(scriptSubtitle(script({ cwdMode: "context" }), { ...ctx, vars: { ...vars, cwd: "" } }).text).toBe("Current folder");
    expect(scriptSubtitle(script({ cwdMode: "workspace" }), { ...ctx, vars: { ...vars, workspace: "" } }).text).toBe(WORKSPACE_UNSET);
    expect(scriptSubtitle(script({ cwdMode: "fixed" }), ctx).text).toBeNull();
  });

  it("keeps the subtitle of the variable in the name, and leaves apps alone", () => {
    expect(scriptSubtitle(script({ name: "Agent {cwd}", cwdMode: "fixed", cwd: "/x" }), ctx).text).toBe("/p");
    expect(scriptSubtitle({ name: "dev", kind: "app" as const }, ctx).text).toBeNull();
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

describe("buildActionsBarModel place", () => {
  const fileAction = app({ id: "f1", command: "code {filepath}", name: "Code {filepath}" });
  const folderAction = script({ id: "d1", command: "agent {cwd}", name: "Agent {cwd}" });
  const wsAction = app({ id: "w1", command: "pycharm {workspace}" });

  it("shows file Actions on a file and folder Actions on a terminal", () => {
    const onFile = buildActionsBarModel({
      local: [fileAction, folderAction, wsAction],
      context: { ...ctx, vars: { ...vars, filepath: "/p/a.ts", filename: "a.ts" } },
      states: new Map(),
      activeId: undefined,
      place: { file: true, folder: false },
    });
    expect(onFile.menu.workspace.map((i) => i.action.id)).toEqual(["f1", "w1"]);

    const onFolder = buildActionsBarModel({
      local: [fileAction, folderAction, wsAction],
      context: ctx,
      states: new Map(),
      activeId: undefined,
      place: { file: false, folder: true },
    });
    expect(onFolder.menu.workspace.map((i) => i.action.id)).toEqual(["w1", "d1"]);
  });

  it("keeps a running script visible whatever the focused tab is", () => {
    const model = buildActionsBarModel({
      local: [folderAction],
      context: ctx,
      states: new Map([["d1", "running"]]),
      activeId: "d1",
      place: { file: true, folder: false },
    });
    expect(model.menu.workspace).toHaveLength(1);
    expect(model.menu.workspace[0]).toMatchObject({ stoppable: true, disabledReason: null });
  });

  it("resolves the second line to what the place says and adds a Run row title", () => {
    const model = buildActionsBarModel({
      local: [fileAction],
      context: { ...ctx, vars: { ...vars, filepath: "/p/a.ts", filename: "a.ts" } },
      states: new Map(),
      activeId: undefined,
      place: { file: true, folder: false },
    });
    expect(model.menu.workspace[0]?.subtitle).toBe("a.ts");
    expect(model.menu.workspace[0]?.title).toBe("Open a.ts with Code");
  });
});

describe("appsFirst and scriptsFirst", () => {
  const mixed = [script({ id: "s1" }), app({ id: "a1" }), script({ id: "s2" }), app({ id: "a2" })];

  it("partition by kind and keep the order inside each kind", () => {
    expect(appsFirst(mixed).map((a) => a.id)).toEqual(["a1", "a2", "s1", "s2"]);
    expect(scriptsFirst(mixed).map((a) => a.id)).toEqual(["s1", "s2", "a1", "a2"]);
  });
});

describe("Settings labels", () => {
  it("say what the variable stands for in the subtitle and the hover, never the raw template", () => {
    expect(actionSubtitle("Rust {cwd}", SETTINGS_LABELS)).toEqual({ text: "Current Directory", startTrim: true });
    expect(actionSubtitle("Code {filepath}", SETTINGS_LABELS).text).toBe("Current File");
    expect(actionRowTitle("Rust {cwd}", false, null, SETTINGS_LABELS)).toBe("Open Rust in Current Directory");
    expect(actionRowTitle("Code {filepath}", false, null, SETTINGS_LABELS)).toBe("Open Current File with Code");
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
    kind: "agent" as const,
    command: "claude",
    appId: "claude",
    cwdMode: "context",
    ownButton: true,
    ...o,
  });

  it("orders the Header apps, agents, scripts and Settings scripts, apps, agents", () => {
    const mixed = [agent({ id: "g1" }), script({ id: "s1" }), app({ id: "a1" }), agent({ id: "g2" }), script({ id: "s2" })];
    expect(appsFirst(mixed).map((a) => a.id)).toEqual(["a1", "g1", "g2", "s1", "s2"]);
    expect(scriptsFirst(mixed).map((a) => a.id)).toEqual(["s1", "s2", "a1", "g1", "g2"]);
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

  it("shows the folder it starts in on its second line", () => {
    const sub = (o: Partial<Action>, c: Parameters<typeof scriptSubtitle>[1] = ctx) => scriptSubtitle(agent(o), c);
    expect(sub({ cwdMode: "workspace" })).toEqual({ text: "/p", startTrim: true });
    expect(sub({ cwdMode: "context" })).toEqual({ text: "/p", startTrim: true });
    expect(sub({ cwdMode: "home" }).text).toBe("Home");
    expect(sub({ cwdMode: "fixed", cwd: "/srv" })).toEqual({ text: "/srv", startTrim: true });
    expect(sub({ cwdMode: "context" }, SETTINGS_LABELS).text).toBe("Current directory");
    expect(sub({ cwdMode: "workspace" }, SETTINGS_LABELS).text).toBe("Workspace");
  });

  it("is grey with the root message when it starts in a rootless workspace", () => {
    const rootless = { ...ctx, vars: { ...vars, workspace: "" } };
    const m = buildActionsBarModel({ local: [agent({ cwdMode: "workspace" })], context: rootless, states: new Map(), activeId: undefined });
    expect(m.buttons[0]).toMatchObject({ disabledReason: WORKSPACE_UNSET, subtitle: WORKSPACE_UNSET });
    expect(actionAvailability(agent({ cwdMode: "context" }), rootless)).toBeNull();
  });

  it("reads braces and quotes literally, and refuses a control character", () => {
    expect(actionAvailability(agent({ command: "claude {x} 'a" }), ctx)).toBeNull();
    expect(actionAvailability(agent({ command: "claude\nrm" }), ctx)).toMatch(/control character/);
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
