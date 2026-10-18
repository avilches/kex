import { describe, expect, it } from "vitest";
import {
  actionAvailability,
  buildActionsBarModel,
  COMPACT_WIDTH,
  describeMissing,
  isCompactBar,
} from "./actionsBar";
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

const vars = { cwd: "/p", dir: "p", workspace: "/p", file: "", path: "", branch: "", repo: "", host: "mac" };
const ctx = { vars, shell: "posix" as const };

describe("describeMissing", () => {
  it("names what a variable needs in plain words", () => {
    expect(describeMissing(["path"])).toBe("needs an open file");
    expect(describeMissing(["file"])).toBe("needs an open file");
    expect(describeMissing(["workspace"])).toBe("needs a workspace root");
    expect(describeMissing(["cwd"])).toBe("needs a folder");
    expect(describeMissing(["branch"])).toBe("needs a git branch");
    expect(describeMissing(["repo"])).toBe("needs a git repository");
  });

  it("joins several needs and falls back to the variable name", () => {
    expect(describeMissing(["path", "workspace"])).toBe("needs an open file and a workspace root");
    expect(describeMissing(["host"])).toBe("{host} has no value here");
  });
});

describe("actionAvailability", () => {
  it("is available when every variable has a value", () => {
    expect(actionAvailability(app(), ctx)).toBeNull();
    expect(actionAvailability(script(), ctx)).toBeNull();
  });

  it("explains the missing variable of an app", () => {
    expect(actionAvailability(app({ command: "code {path}" }), ctx)).toBe("needs an open file");
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

describe("buildActionsBarModel", () => {
  const actions = [
    script({ id: "s1", name: "dev", ownButton: true }),
    app({ id: "a1", name: "PyCharm", ownButton: true }),
    script({ id: "s2", name: "test" }),
    app({ id: "a2", name: "Zed" }),
    script({ id: "s3", name: "build", ownButton: true }),
  ];

  it("keeps own buttons in user order, scripts and apps mixed", () => {
    const m = buildActionsBarModel({ actions, context: ctx, states: new Map(), activeId: undefined, compact: false });
    expect(m.buttons.map((b) => b.id)).toEqual(["s1", "a1", "s3"]);
    expect(m.scripts.map((b) => b.id)).toEqual(["s2"]);
    expect(m.apps.map((b) => b.id)).toEqual(["a2"]);
    expect(m.empty).toBe(false);
  });

  it("moves own buttons into their menus when compact", () => {
    const m = buildActionsBarModel({ actions, context: ctx, states: new Map(), activeId: undefined, compact: true });
    expect(m.buttons).toEqual([]);
    expect(m.scripts.map((b) => b.id)).toEqual(["s1", "s2", "s3"]);
    expect(m.apps.map((b) => b.id)).toEqual(["a1", "a2"]);
  });

  it("carries the run state, the active mark and the disabled reason", () => {
    const m = buildActionsBarModel({
      actions: [script({ id: "s1", ownButton: true }), app({ id: "a1", command: "code {path}", ownButton: true })],
      context: ctx,
      states: new Map([["s1", "running"]]),
      activeId: "s1",
      compact: false,
    });
    const [s, a] = m.buttons;
    expect(s).toMatchObject({ state: "running", active: true, disabledReason: null, stoppable: true });
    expect(a).toMatchObject({ state: "idle", active: false, disabledReason: "needs an open file", stoppable: false });
  });

  it("never lets a running script be disabled: it must stay stoppable", () => {
    const m = buildActionsBarModel({
      actions: [script({ id: "s1", command: "make {branch}", ownButton: true })],
      context: ctx,
      states: new Map([["s1", "running"]]),
      activeId: undefined,
      compact: false,
    });
    expect(m.buttons[0]).toMatchObject({ state: "running", disabledReason: null, stoppable: true });
  });

  it("reports empty only when there are no Actions at all", () => {
    expect(buildActionsBarModel({ actions: [], context: ctx, states: new Map(), activeId: undefined, compact: false }).empty).toBe(true);
  });

  it("labels an unnamed Action", () => {
    const m = buildActionsBarModel({
      actions: [app({ name: "  ", ownButton: true })],
      context: ctx,
      states: new Map(),
      activeId: undefined,
      compact: false,
    });
    expect(m.buttons[0]?.name).toBe("Action");
  });
});
