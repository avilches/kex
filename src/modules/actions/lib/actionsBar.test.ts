import { describe, expect, it } from "vitest";
import {
  actionAvailability,
  actionShownAt,
  actionTarget,
  barSubtitle,
  buildActionsBarModel,
  BAR_GAP,
  COMPACT_WIDTH,
  describeMissing,
  isCompactBar,
  menuEntries,
  MENUS_RESERVE,
  ownButtonsThatFit,
  ownButtonWidth,
  WORKSPACE_UNSET,
} from "./actionsBar";
import type { BarItem } from "./actionsBar";
import type { Action } from "./types";

const script = (o: Partial<Action> = {}): Action => ({
  id: "s1",
  name: "dev",
  runInTerminal: true,
  command: "pnpm dev",
  ownButton: false,
  ...o,
});
const app = (o: Partial<Action> = {}): Action => ({
  id: "a1",
  name: "PyCharm",
  runInTerminal: false,
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
      "needs a workspace root",
    );
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
    name: a.name,
    action: a,
    state: "idle",
    active: false,
    stoppable: false,
    disabledReason: null,
    subtitle: null,
    ...over,
  });

  it("gives an idle script one row that runs it", () => {
    expect(menuEntries(idle(script()))).toEqual([{ kind: "main", enabled: true }]);
  });

  it("adds a Stop row, reachable by keyboard, to a running script", () => {
    const entries = menuEntries(idle(script(), { state: "running", stoppable: true }));
    expect(entries).toEqual([
      { kind: "main", enabled: true },
      { kind: "stop", enabled: true },
    ]);
  });

  it("shows a script that is stopping with its Stop row disabled", () => {
    const entries = menuEntries(idle(script(), { state: "waiting" }));
    expect(entries).toEqual([
      { kind: "main", enabled: false },
      { kind: "stop", enabled: false },
    ]);
  });

  it("disables the row of a script or an app that cannot run, with no Stop row", () => {
    expect(menuEntries(idle(script(), { disabledReason: "needs a git branch" }))).toEqual([{ kind: "main", enabled: false }]);
    expect(menuEntries(idle(app(), { disabledReason: "needs an open file" }))).toEqual([{ kind: "main", enabled: false }]);
  });

  it("never gives an app a Stop row", () => {
    expect(menuEntries(idle(app()))).toEqual([{ kind: "main", enabled: true }]);
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
});

describe("buildActionsBarModel", () => {
  const actions = [
    script({ id: "s1", name: "dev", ownButton: true }),
    app({ id: "a1", name: "PyCharm", ownButton: true }),
    script({ id: "s2", name: "test" }),
    app({ id: "a2", name: "Zed" }),
    script({ id: "s3", name: "build", ownButton: true }),
  ];


  it("keeps own buttons in user order, scripts and apps mixed", () => {
    const m = buildActionsBarModel({ local: actions, context: ctx, states: new Map(), activeId: undefined });
    expect(m.buttons.map((b) => b.id)).toEqual(["s1", "a1", "s3"]);
    expect(m.scripts.map((b) => b.id)).toEqual(["s2"]);
    expect(m.apps.map((b) => b.id)).toEqual(["a2"]);
    expect(m.empty).toBe(false);
  });

  it("moves every own button into its menu when none fits", () => {
    const m = buildActionsBarModel({ local: actions, context: ctx, states: new Map(), activeId: undefined, ownButtonsShown: 0 });
    expect(m.buttons).toEqual([]);
    expect(m.scripts.map((b) => b.id)).toEqual(["s1", "s2", "s3"]);
    expect(m.apps.map((b) => b.id)).toEqual(["a1", "a2"]);
  });

  it("folds only the own buttons beyond the count that fits, keeping user order in the menus", () => {
    const m = buildActionsBarModel({ local: actions, context: ctx, states: new Map(), activeId: undefined, ownButtonsShown: 2 });
    expect(m.buttons.map((b) => b.id)).toEqual(["s1", "a1"]);
    expect(m.scripts.map((b) => b.id)).toEqual(["s2", "s3"]);
    expect(m.apps.map((b) => b.id)).toEqual(["a2"]);
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

  it("marks every Action of a hibernated workspace unavailable but lets a running script be stopped", () => {
    const m = buildActionsBarModel({
      local: [script({ id: "s1", ownButton: true }), script({ id: "s2", ownButton: true }), app({ id: "a1", ownButton: true })],
      context: { ...ctx, hibernated: true },
      states: new Map([["s1", "running"]]),
      activeId: undefined,
    });
    expect(m.buttons.map((b) => b.disabledReason)).toEqual([null, "workspace is hibernated", "workspace is hibernated"]);
  });

  it("reports empty only when there are no Actions at all", () => {
    expect(buildActionsBarModel({ local: [], context: ctx, states: new Map(), activeId: undefined }).empty).toBe(true);
  });

  it("keeps the global Actions apart in their own menu sections", () => {
    const m = buildActionsBarModel({
      local: [script({ id: "s1", name: "dev" })],
      global: [script({ id: "s2", name: "top" }), app({ id: "a1", name: "Zed" })],
      context: ctx,
      states: new Map(),
      activeId: undefined,
    });
    expect(m.scripts.map((b) => b.id)).toEqual(["s1"]);
    expect(m.scriptsGlobal.map((b) => b.id)).toEqual(["s2"]);
    expect(m.apps).toEqual([]);
    expect(m.appsGlobal.map((b) => b.id)).toEqual(["a1"]);
    expect(m.empty).toBe(false);
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
    expect(m.appsGlobal.map((b) => b.id)).toEqual(["a1"]);
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

describe("barSubtitle", () => {
  it("resolves the name variable to the value of this place", () => {
    expect(barSubtitle("Code {filepath}", { ...ctx, vars: { ...vars, filepath: "/p/a.ts" } })).toBe("/p/a.ts");
    expect(barSubtitle("Agent {cwd}", ctx)).toBe("/p");
  });

  it("says when the workspace root is missing and hides the line for other empty values", () => {
    const empty = { ...ctx, vars: { ...vars, workspace: "" } };
    expect(barSubtitle("PyCharm {workspace}", empty)).toBe(WORKSPACE_UNSET);
    expect(barSubtitle("Make {branch}", ctx)).toBeNull();
  });

  it("keeps the template for unknown variables and skips actions without a suffix", () => {
    expect(barSubtitle("X {stage}", ctx)).toBe("{stage}");
    expect(barSubtitle("dev", ctx)).toBeNull();
    expect(barSubtitle("PyCharm {workspace}", null)).toBe(WORKSPACE_UNSET);
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
    expect(onFile.scripts).toHaveLength(0);
    expect(onFile.apps.map((i) => i.action.id)).toEqual(["f1", "w1"]);

    const onFolder = buildActionsBarModel({
      local: [fileAction, folderAction, wsAction],
      context: ctx,
      states: new Map(),
      activeId: undefined,
      place: { file: false, folder: true },
    });
    expect(onFolder.scripts.map((i) => i.action.id)).toEqual(["d1"]);
    expect(onFolder.apps.map((i) => i.action.id)).toEqual(["w1"]);
  });

  it("keeps a running script visible whatever the focused tab is", () => {
    const model = buildActionsBarModel({
      local: [folderAction],
      context: ctx,
      states: new Map([["d1", "running"]]),
      activeId: "d1",
      place: { file: true, folder: false },
    });
    expect(model.scripts).toHaveLength(1);
    expect(model.scripts[0]).toMatchObject({ stoppable: true, disabledReason: null });
  });

  it("resolves the second line to the value of the place", () => {
    const model = buildActionsBarModel({
      local: [fileAction],
      context: { ...ctx, vars: { ...vars, filepath: "/p/a.ts", filename: "a.ts" } },
      states: new Map(),
      activeId: undefined,
      place: { file: true, folder: false },
    });
    expect(model.apps[0]?.subtitle).toBe("/p/a.ts");
  });
});
