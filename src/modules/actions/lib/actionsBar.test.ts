import { describe, expect, it } from "vitest";
import {
  actionAvailability,
  actionRowTitle,
  actionShownAt,
  actionSubtitle,
  actionTarget,
  agentCommandProblem,
  byKind,
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
  ownButtonCandidates,
  ownButtonsThatFit,
  ownButtonWidth,
  paletteActions,
  parseBarZone,
  resolveDrop,
  SETTINGS_LABELS,
  scriptSubtitle,
  twinIds,
  soleIconButtons,
  WORKSPACE_UNSET,
} from "./actionsBar";
import type { BarContext, BarItem, FocusPlace } from "./actionsBar";
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

  it("reports a hibernated focused tab for what depends on it, ahead of every other reason", () => {
    const asleep = { ...ctx, hibernated: true };
    expect(actionAvailability(app({ command: "code {cwd}" }), asleep)).toBe("tab is hibernated");
    expect(actionAvailability(script({ command: "ls {branch}" }), asleep)).toBe("tab is hibernated");
    expect(actionAvailability(script({ cwdMode: "context" }), asleep)).toBe("tab is hibernated");
    expect(actionAvailability(app({ command: "  " }), asleep)).toBe("it has no command");
  });

  it("leaves available what does not depend on the focused tab while it sleeps", () => {
    const asleep = { ...ctx, hibernated: true };
    expect(actionAvailability(app(), asleep)).toBeNull();
    expect(actionAvailability(script(), asleep)).toBeNull();
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
    subtitleLead: null,
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
      local: [script({ id: "s1", ownButton: true }), app({ id: "a1", command: "code {filepath}", ownButton: true })],
      context: ctx,
      states: new Map([["s1", "running"]]),
      activeId: "s1",
    });
    const [s, a] = m.buttons;
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

  it("marks what depends on a hibernated focused tab unavailable but lets a running script be stopped", () => {
    const m = buildActionsBarModel({
      local: [
        script({ id: "s1", ownButton: true }),
        script({ id: "s2", ownButton: true, cwdMode: "context" }),
        app({ id: "a1", ownButton: true, command: "pycharm {cwd}" }),
      ],
      context: { ...ctx, hibernated: true },
      states: new Map([["s1", "running"]]),
      activeId: undefined,
    });
    expect(m.buttons.map((b) => b.disabledReason)).toEqual([null, "tab is hibernated", "tab is hibernated"]);
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
    const zedFile = app({ id: "z2", appId: "zed", name: "Zed {filepath}", command: "zed {filepath}", ownButton: true });
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

  it("keeps the subtitle of the variable in the name, and leaves apps alone", () => {
    expect(scriptSubtitle(script({ name: "Agent {cwd}", cwdMode: "fixed", cwd: "/x" }), ctx).text).toBe("/p");
    expect(scriptSubtitle({ name: "dev", kind: "app" }, ctx).text).toBeNull();
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
    expect(onFolder.menu.workspace.map((i) => i.action.id)).toEqual(["d1", "w1"]);
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
    cwdMode: "context",
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

  it("shows the folder it starts in on its second line", () => {
    const sub = (o: Partial<Action>, c: Parameters<typeof scriptSubtitle>[1] = ctx) => scriptSubtitle(agent(o), c);
    expect(sub({ cwdMode: "workspace" })).toEqual({ text: "/p", startTrim: true, lead: "root" });
    expect(sub({ cwdMode: "context" })).toEqual({ text: "/p", startTrim: true, lead: "tab" });
    expect(sub({ cwdMode: "home" }).text).toBe("Home");
    expect(sub({ cwdMode: "fixed", cwd: "/srv" })).toEqual({ text: "/srv", startTrim: true });
    expect(sub({ cwdMode: "context" }, SETTINGS_LABELS).text).toBe("Current folder");
    expect(sub({ cwdMode: "workspace" }, SETTINGS_LABELS)).toEqual({ text: "Workspace root", startTrim: false, lead: "root" });
  });

  it("names the folder the runner falls back to when the focused tab has none", () => {
    const sub = (o: Partial<Action>, folders: NonNullable<Parameters<typeof scriptSubtitle>[1]>["folders"]) =>
      scriptSubtitle(agent(o), { ...ctx, folders });
    const noFocus = { focusFolder: null, workspaceRoot: "/root", workspaceCwd: "/cwd" };
    expect(sub({ cwdMode: "context" }, noFocus)).toEqual({ text: "/root", startTrim: true, lead: "tab" });
    expect(sub({ cwdMode: "context" }, { ...noFocus, workspaceRoot: null })).toEqual({ text: "/cwd", startTrim: true, lead: "tab" });
    expect(sub({ cwdMode: "context" }, { ...noFocus, focusFolder: "/root/src" })).toEqual({ text: "/root/src", startTrim: true, lead: "tab" });
    expect(sub({ cwdMode: "context" }, { focusFolder: null, workspaceRoot: null, workspaceCwd: null }).text).toBeNull();
    expect(sub({ cwdMode: "context" }, noFocus).text).not.toBe("Current folder");
  });

  it("names the workspace folder the run falls back to for a fixed mode with no folder", () => {
    const folders = { focusFolder: "/root/src", workspaceRoot: "/root", workspaceCwd: "/cwd" };
    expect(scriptSubtitle(agent({ cwdMode: "fixed", cwd: "" }), { ...ctx, folders })).toEqual({ text: "/root", startTrim: true, lead: "root" });
    expect(scriptSubtitle(agent({ cwdMode: "fixed", cwd: "  " }), { ...ctx, folders: { ...folders, workspaceRoot: null } })).toEqual({
      text: "/cwd",
      startTrim: true,
      lead: "root",
    });
    expect(scriptSubtitle(agent({ cwdMode: "fixed" }), SETTINGS_LABELS).text).toBe("Workspace root");
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

describe("twinIds", () => {
  const agent = (o: Partial<Action> = {}): Action => ({
    id: "g1",
    name: "Claude Code",
    kind: "agent",
    command: "claude",
    appId: "claude",
    cwdMode: "workspace",
    ownButton: true,
    ...o,
  });
  const at = (focus: string | null, root: string | null = "/p"): BarContext => ({
    vars: { ...vars, workspace: root ?? "", cwd: focus ?? "" },
    shell: "posix",
    folders: { focusFolder: focus, workspaceRoot: root, workspaceCwd: root },
  });
  const none = new Map<string, "running" | "waiting">();
  const ids = (actions: Action[], c: BarContext | null, states = none, place?: FocusPlace) => [...twinIds(actions, c, states, place)].sort();
  const workspaceAgent = agent({ id: "w" });
  const contextAgent = agent({ id: "c", cwdMode: "context" });

  it("hides the agent in the current folder when it is the workspace one", () => {
    expect(ids([workspaceAgent, contextAgent], at("/p"))).toEqual(["c"]);
    expect(ids([contextAgent, workspaceAgent], at("/p"))).toEqual(["c"]);
  });

  it("shows both once the focus leaves the root", () => {
    expect(ids([workspaceAgent, contextAgent], at("/p/sub"))).toEqual([]);
  });

  it("hides the context agent with a browser focused, which has no folder", () => {
    expect(ids([workspaceAgent, contextAgent], at(null))).toEqual(["c"]);
  });

  it("compares folders the way the runner does, trailing slash included", () => {
    expect(ids([workspaceAgent, contextAgent], at("/p/"))).toEqual(["c"]);
    expect(ids([workspaceAgent, contextAgent], at("/p", "/p/"))).toEqual(["c"]);
  });

  it("hides an app opened on the current folder when the workspace one opens the same", () => {
    const byWorkspace = app({ id: "w", command: "code {workspace}" });
    const byCwd = app({ id: "c", command: "code {cwd}" });
    expect(ids([byWorkspace, byCwd], at("/p"))).toEqual(["c"]);
    expect(ids([byWorkspace, byCwd], at("/p/sub"))).toEqual([]);
  });

  it("hides a script run in the current folder when the workspace one runs in the same", () => {
    const inWorkspace = script({ id: "w", cwdMode: "workspace" });
    const inContext = script({ id: "c", cwdMode: "context" });
    expect(ids([inWorkspace, inContext], at("/p"))).toEqual(["c"]);
    expect(ids([inWorkspace, inContext], at("/p/sub"))).toEqual([]);
  });

  it("hides a dynamic script whose variable expands to the static command", () => {
    const fixed = script({ id: "w", command: "ls {workspace}", cwdMode: "workspace" });
    const dynamic = script({ id: "c", command: "ls {cwd}", cwdMode: "workspace" });
    expect(ids([fixed, dynamic], at("/p"))).toEqual(["c"]);
  });

  it("keeps the context Action while the workspace one is blocked for lack of a root", () => {
    expect(ids([workspaceAgent, contextAgent], at("/p/sub", null))).toEqual([]);
    expect(ids([script({ id: "w" }), script({ id: "c", cwdMode: "context" })], at("/p/sub", null))).toEqual([]);
  });

  it("never hides or keeps a blocked Action", () => {
    const blocked = app({ id: "b", command: "code {workspace}" });
    const dynamic = app({ id: "c", command: "code {cwd}" });
    expect(ids([blocked, dynamic], { ...at("/p"), vars: { ...vars, workspace: "", cwd: "/p" } })).toEqual([]);
  });

  it("keeps two static Actions or two dynamic ones, made on purpose", () => {
    expect(ids([agent({ id: "a" }), agent({ id: "b" })], at("/p"))).toEqual([]);
    expect(ids([agent({ id: "a", cwdMode: "context" }), agent({ id: "b", cwdMode: "context" })], at("/p"))).toEqual([]);
  });

  it("hides the one in the menu, whichever is dynamic, when only one has a button", () => {
    const menu = agent({ id: "m", ownButton: false });
    expect(ids([menu, agent({ id: "b", cwdMode: "context" })], at("/p"))).toEqual(["m"]);
    expect(ids([contextAgent, agent({ id: "m", ownButton: false })], at("/p"))).toEqual(["m"]);
    expect(ids([agent({ id: "m", cwdMode: "context", ownButton: false }), workspaceAgent], at("/p"))).toEqual(["m"]);
  });

  it("hides the dynamic one only when a static one survives, after the menu pass", () => {
    const staticMenu = agent({ id: "sm", ownButton: false });
    const dynamicButton = agent({ id: "db", cwdMode: "context" });
    expect(ids([staticMenu, dynamicButton], at("/p"))).toEqual(["sm"]);
  });

  it("never hides a script that is not idle, and it keeps the others hidden", () => {
    const inWorkspace = script({ id: "w", cwdMode: "workspace", ownButton: true });
    const inContext = script({ id: "c", cwdMode: "context", ownButton: true });
    expect(ids([inWorkspace, inContext], at("/p"), new Map([["c", "running"]]))).toEqual([]);
    expect(ids([inWorkspace, inContext], at("/p"), new Map([["w", "running"]]))).toEqual(["c"]);
    expect(ids([inWorkspace, inContext], at("/p"), new Map([["c", "waiting"]]))).toEqual([]);
    const menu = script({ id: "m", cwdMode: "workspace", ownButton: false });
    expect(ids([menu, inWorkspace], at("/p"), new Map([["m", "running"]]))).toEqual([]);
  });

  it("does nothing without a context, in Settings or while the focused tab is hibernated", () => {
    expect(ids([workspaceAgent, contextAgent], null)).toEqual([]);
    expect(ids([workspaceAgent, contextAgent], { ...at("/p"), labels: true })).toEqual([]);
    expect(ids([workspaceAgent, contextAgent], { ...at("/p"), hibernated: true })).toEqual([]);
  });

  it("leaves alone an Action it cannot compare", () => {
    const broken = script({ id: "x", command: 'echo "{cwd}"', cwdMode: "context" });
    const other = script({ id: "y", command: 'echo "{cwd}"', cwdMode: "workspace" });
    expect(ids([broken, other], at("/p"))).toEqual([]);
    expect(ids([app({ id: "n", command: "code {filepath}" }), app({ id: "m", command: "code {filepath}" })], at("/p"))).toEqual([]);
  });

  it("never compares an Action whose start folder the runner would refuse", () => {
    const broken = script({ id: "b", command: "ls", cwdMode: "fixed", cwd: "\\foo", ownButton: true });
    const working = script({ id: "w", command: "ls", cwdMode: "fixed", cwd: "/foo", ownButton: false });
    expect(ids([broken, working], at("/p"))).toEqual([]);
    const control = script({ id: "k", command: "ls", cwdMode: "fixed", cwd: "/foo\u0001", ownButton: true });
    expect(ids([control, working], at("/p"))).toEqual([]);
  });

  it("never compares anything that starts at the root folder, script or app", () => {
    const rootCtx = at("/", "/");
    expect(ids([script({ id: "a", ownButton: true }), script({ id: "b", cwdMode: "context" })], rootCtx)).toEqual([]);
    expect(ids([app({ id: "c", command: "code /x" }), app({ id: "d", command: "code /x" })], rootCtx)).toEqual([]);
  });

  it("never compares Actions whose start folder is unknown", () => {
    const noFolders: BarContext = { vars: { ...vars, workspace: "", cwd: "/x" }, shell: "posix", folders: { focusFolder: null, workspaceRoot: null, workspaceCwd: null } };
    const dynamic = script({ id: "c", command: "ls {cwd}", cwdMode: "context" });
    const home = script({ id: "h", command: "ls /x", cwdMode: "home" });
    expect(ids([dynamic, home], noFolders)).toEqual([]);
  });

  it("hides the menu copy of a button even when both are static", () => {
    const button = script({ id: "b", ownButton: true });
    const menu = script({ id: "m", ownButton: false });
    expect(ids([button, menu], at("/p"))).toEqual(["m"]);
  });

  it("finds a twin across the workspace and global scopes", () => {
    const model = buildActionsBarModel({
      local: [workspaceAgent],
      global: [{ ...contextAgent, id: "g" }],
      context: at("/p"),
      states: none,
      activeId: undefined,
    });
    expect(model.buttons.map((b) => b.id)).toEqual(["w"]);
  });

  it("leaves at least the static button in a three-way set", () => {
    const staticButton = agent({ id: "s" });
    const dynamicMenu = agent({ id: "dm", cwdMode: "context", ownButton: false });
    const dynamicButton = agent({ id: "db", cwdMode: "context" });
    const hidden = ids([dynamicButton, dynamicMenu, staticButton], at("/p"));
    expect(hidden).toEqual(["db", "dm"]);
  });

  it("does not let an Action the place hides hide another one", () => {
    const file = { file: true, folder: false };
    const byWorkspace = app({ id: "w", command: "code /p" });
    const byCwd = script({ id: "c", command: "code {cwd}", ownButton: true });
    expect(ids([byWorkspace, byCwd], at("/p"), none, file)).toEqual([]);
  });

  it("takes the hidden twin out of the bar, the menu and the fit count", () => {
    const context = at("/p");
    const model = buildActionsBarModel({ local: [workspaceAgent, contextAgent], context, states: none, activeId: undefined });
    expect(model.buttons.map((b) => b.id)).toEqual(["w"]);
    const asMenu = buildActionsBarModel({
      local: [{ ...workspaceAgent, ownButton: false }, { ...contextAgent, ownButton: false }],
      context,
      states: none,
      activeId: undefined,
    });
    expect(asMenu.menu.workspace.map((i) => i.id)).toEqual(["w"]);
    expect(paletteActions(model).map((i) => i.id)).toEqual(["w"]);
    const hidden = twinIds([workspaceAgent, contextAgent], context, none);
    const candidates = ownButtonCandidates([workspaceAgent, contextAgent], [], none, undefined, hidden);
    expect(candidates.map((a) => a.id)).toEqual(["w"]);
    const later = agent({ id: "later", command: "other" });
    const trio = [contextAgent, workspaceAgent, later];
    const room = trio.reduce((n, a) => n + ownButtonWidth(a) + BAR_GAP, 0) + MENUS_RESERVE;
    expect(ownButtonsThatFit(trio, room)).toBe(3);
    expect(ownButtonsThatFit(trio, room, undefined, none, hidden)).toBe(2);
    expect(ownButtonsThatFit(trio, ownButtonWidth(later) * 2 + BAR_GAP * 2 + MENUS_RESERVE, undefined, none, hidden)).toBe(2);
  });
});

describe("buildActionsBarModel arranging", () => {
  const rows = [
    app({ id: "w1", name: "PyCharm {workspace}", command: "pycharm {workspace}", ownButton: true }),
    app({ id: "c1", name: "Zed {cwd}", command: "zed {cwd}", ownButton: true }),
    app({ id: "f1", name: "Code {filepath}", command: "code {filepath}", ownButton: true }),
  ];
  const build = (arranging: boolean, context = ctx) =>
    buildActionsBarModel({ local: rows, context, states: new Map(), activeId: undefined, arranging });

  it("names what each variable stands for instead of today's value", () => {
    const m = build(true);
    expect(m.buttons.map((b) => [b.subtitle, b.subtitleLead])).toEqual([
      ["Workspace root", "root"],
      ["Current folder", "tab"],
      ["Current file", "file"],
    ]);
    expect(m.buttons[0]?.title).toBe("Open PyCharm in Workspace root");
  });

  it("shows the real values otherwise, the pin only on the workspace root", () => {
    const m = build(false);
    expect(m.buttons.map((b) => [b.subtitle, b.subtitleLead])).toEqual([
      [vars.workspace, "root"],
      ["/p", "tab"],
      ["{filepath}", null],
    ]);
  });

  it("keeps the real availability while arranging", () => {
    const rootless = { ...ctx, vars: { ...vars, workspace: "" } };
    expect(build(true, rootless).buttons[0]?.disabledReason).toBe(WORKSPACE_UNSET);
  });
});
