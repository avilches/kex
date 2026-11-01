import { describe, expect, it } from "vitest";
import {
  addAction,
  adoptActionAt,
  normalizeAction,
  normalizeActions,
  removeAction,
  reorderActions,
  reorderBefore,
  updateAction,
  withFixedCwd,
} from "./actions";
import type { Action } from "./types";

const act = (id: string, o: Partial<Action> = {}): Action => ({
  id,
  name: id,
  kind: "script",
  command: `run ${id}`,
  runs: "workspace",
  ownButton: false,
  ...o,
});

describe("addAction / updateAction / removeAction", () => {
  it("appends without mutating", () => {
    const list = [act("a")];
    expect(addAction(list, act("b")).map((a) => a.id)).toEqual(["a", "b"]);
    expect(list).toHaveLength(1);
  });

  it("ignores an id that already exists", () => {
    const list = [act("a")];
    expect(addAction(list, act("a", { name: "other" }))).toBe(list);
  });

  it("patches by id and never changes the id", () => {
    const out = updateAction([act("a"), act("b")], "a", { name: "X", id: "zzz" } as Partial<Action>);
    expect(out.map((a) => a.id)).toEqual(["a", "b"]);
    expect(out[0]!.name).toBe("X");
  });

  it("removes by id", () => {
    expect(removeAction([act("a"), act("b")], "a").map((a) => a.id)).toEqual(["b"]);
  });

  it("keeps in memory exactly what normalize would persist", () => {
    const [added] = addAction([], act("a", { name: " A ", command: " ls " }));
    expect(added).toEqual(act("a", { name: "A", command: "ls" }));
    const [app] = updateAction([act("a", { runs: "fixed", cwd: "/x" })], "a", { kind: "app" });
    expect(app).not.toHaveProperty("runs");
    expect(app).not.toHaveProperty("cwd");
  });

  it("refuses an add or an update that would leave an empty command", () => {
    const list = [act("a")];
    expect(addAction(list, act("b", { command: "  " }))).toBe(list);
    const updated = updateAction(list, "a", { command: "   " });
    expect(updated[0]).toEqual(list[0]);
  });
});

describe("reorderActions", () => {
  it("moves one action to the place of another", () => {
    const list = [act("a"), act("b"), act("c")];
    expect(reorderActions(list, "a", "c").map((a) => a.id)).toEqual(["b", "c", "a"]);
    expect(reorderActions(list, "c", "a").map((a) => a.id)).toEqual(["c", "a", "b"]);
  });

  it("returns the same list for unknown ids or a no-op", () => {
    const list = [act("a"), act("b")];
    expect(reorderActions(list, "a", "zz")).toBe(list);
    expect(reorderActions(list, "a", "a")).toBe(list);
  });
});

describe("normalizeActions", () => {
  it("trims, drops empty commands and keeps the order", () => {
    const out = normalizeActions([act("a", { name: " A ", command: "  ls  " }), act("b", { command: "   " })]);
    expect(out).toEqual([act("a", { name: "A", command: "ls" })]);
  });

  it("drops duplicated ids keeping the first", () => {
    const out = normalizeActions([act("a"), act("a", { name: "dup" })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe("a");
  });

  it("keeps each of the three kinds", () => {
    const out = normalizeActions([act("a", { kind: "app" }), act("b", { kind: "script" }), act("c", { kind: "agent" })]);
    expect(out.map((x) => x.kind)).toEqual(["app", "script", "agent"]);
  });

  it("drops an entry with no valid kind", () => {
    expect(normalizeActions([{ id: "a", name: "a", command: "x", terminal: true, ownButton: false }])).toEqual([]);
    expect(normalizeActions([act("b", { kind: "bogus" as never })])).toEqual([]);
  });

  it("scripts keep where they run and the fixed folder", () => {
    const [x] = normalizeActions([act("a", { kind: "script", runs: "fixed", cwd: "/x" })]);
    expect(x).toMatchObject({ runs: "fixed", cwd: "/x" });
  });

  it("agents never carry a place or folder: they have none of their own", () => {
    const [agent] = normalizeActions([act("a", { kind: "agent", runs: "fixed", cwd: "/x" })]);
    expect(agent).toMatchObject({ kind: "agent" });
    expect(agent).not.toHaveProperty("runs");
    expect(agent).not.toHaveProperty("cwd");
  });

  it("apps never carry a place or folder", () => {
    const [app] = normalizeActions([act("a", { kind: "app", runs: "fixed", cwd: "/x" })]);
    expect(app).not.toHaveProperty("runs");
    expect(app).not.toHaveProperty("cwd");
  });

  it("a folder only survives with the fixed mode", () => {
    const [s] = normalizeActions([act("a", { runs: "workspace", cwd: "/x" })]);
    expect(s).toHaveProperty("runs", "workspace");
    expect(s).not.toHaveProperty("cwd");
    const [f] = normalizeActions([act("b", { runs: "fixed", cwd: "/x" })]);
    expect(f).toHaveProperty("cwd", "/x");
  });

  it("falls back to the command, never the id, when the name is blank", () => {
    expect(normalizeActions([act("ac-9f3", { name: " ", command: "pnpm dev" })])[0]!.name).toBe("pnpm dev");
  });

  it("rejects non-arrays", () => {
    expect(normalizeActions(undefined)).toEqual([]);
    expect(normalizeActions("x" as unknown)).toEqual([]);
  });

  it("clearing the name of a saved action keeps the name it had", () => {
    const out = updateAction([act("a", { name: "Dev server" })], "a", { name: "  " });
    expect(out[0]!.name).toBe("Dev server");
  });

  it("clearing the name of an action that never had one keeps the command as its label", () => {
    const out = updateAction([act("a", { name: "pnpm dev", command: "pnpm dev" })], "a", { name: "" });
    expect(out[0]!.name).toBe("pnpm dev");
  });

  it("drops malformed entries", () => {
    const out = normalizeActions([null, 3, { id: "a" }, { id: 7, command: "x" }, { id: "b", kind: "app", command: "x" }]);
    expect(out).toEqual([{ id: "b", name: "x", kind: "app", command: "x", accepts: "folder", ownButton: false }]);
  });

  describe("what an app accepts", () => {
    const app = (accepts: unknown) => ({ id: "a", kind: "app", command: "zed {target}", accepts });

    it("keeps file, folder and both", () => {
      for (const accepts of ["file", "folder", "both"] as const) {
        expect(normalizeActions([app(accepts)])[0]).toMatchObject({ accepts });
      }
    });

    it("falls back to a folder when it is missing or means nothing", () => {
      for (const accepts of [undefined, "", "files", 3, null, {}]) {
        expect(normalizeActions([app(accepts)])[0]).toMatchObject({ accepts: "folder" });
      }
    });

    it("belongs to apps only: a script or an agent never carries it", () => {
      for (const kind of ["script", "agent"] as const) {
        const [x] = normalizeActions([{ id: "a", kind, command: "claude", runs: "workspace", accepts: "both" }]);
        expect(x).not.toHaveProperty("accepts");
      }
    });

    it("is stable: normalizing twice changes nothing", () => {
      const once = normalizeActions([app("both")]);
      expect(normalizeActions(once)).toEqual(once);
    });

    it("is set through updateAction", () => {
      const list = normalizeActions([app("folder")]);
      expect(updateAction(list, "a", { accepts: "both" })[0]).toMatchObject({ accepts: "both" });
    });
  });
});


describe("adoptActionAt, apps with the same command", () => {
  const app = (id: string, command: string, o: Partial<Action> = {}): Action => ({
    id,
    name: id,
    kind: "app",
    command,
    ownButton: false,
    ...o,
  });

  it("overwrites the app that has the command, in its place and with its id, keeping the incoming name", () => {
    const list = [app("a", "code ."), app("b", "zed .")];
    const r = adoptActionAt(list, app("n", " zed . ", { name: "Zed (moved)", ownButton: true }), () => "fresh", "a");
    expect(r.merged).toBe(true);
    expect(r.list.map((x) => [x.id, x.name, x.ownButton])).toEqual([
      ["a", "a", false],
      ["b", "Zed (moved)", true],
    ]);
    expect(r.stored.id).toBe("b");
  });

  it("never merges a different command, nor a script", () => {
    const list = [app("a", "code .")];
    expect(adoptActionAt(list, app("n", "code -n ."), () => "fresh").merged).toBe(false);
    const script = { ...app("s", "code ."), kind: "script" as const };
    expect(adoptActionAt(list, script, () => "fresh").list).toHaveLength(2);
    expect(adoptActionAt([script], app("n", "code ."), () => "fresh").list).toHaveLength(2);
    expect(adoptActionAt([script], { ...script, id: "t" }, () => "fresh").list).toHaveLength(2);
  });

});

describe("adoptActionAt", () => {
  const mk = (id: string): Action => ({ id, name: id, kind: "app", command: `open ${id}`, ownButton: false });

  it("goes before the named Action, last when it is unknown or not given", () => {
    const list = [mk("a"), mk("b")];
    expect(adoptActionAt(list, mk("n"), () => "fresh", "b").list.map((x) => x.id)).toEqual(["a", "n", "b"]);
    expect(adoptActionAt(list, mk("n"), () => "fresh", "ghost").list.map((x) => x.id)).toEqual(["a", "b", "n"]);
    expect(adoptActionAt(list, mk("n"), () => "fresh").list.map((x) => x.id)).toEqual(["a", "b", "n"]);
  });

  it("returns the stored Action, with a fresh id when its own is taken", () => {
    const { list, stored } = adoptActionAt([mk("a")], { ...mk("a"), command: "open other" }, () => "fresh", "a");
    expect(stored.id).toBe("fresh");
    expect(list.map((x) => x.id)).toEqual(["fresh", "a"]);
  });
});

describe("reorderBefore", () => {
  const mk = (id: string): Action => ({ id, name: id, kind: "app", command: "x", ownButton: false });
  const ids = (l: Action[]) => l.map((a) => a.id);

  it("puts the Action right before another whichever side it came from, or last", () => {
    const list = [mk("a"), mk("b"), mk("c"), mk("d")];
    expect(ids(reorderBefore(list, "a", "c"))).toEqual(["b", "a", "c", "d"]);
    expect(ids(reorderBefore(list, "d", "b"))).toEqual(["a", "d", "b", "c"]);
    expect(ids(reorderBefore(list, "a"))).toEqual(["b", "c", "d", "a"]);
  });

  it("leaves the list alone for an unknown Action or itself", () => {
    const list = [mk("a"), mk("b")];
    expect(reorderBefore(list, "ghost", "a")).toBe(list);
    expect(reorderBefore(list, "a", "a")).toBe(list);
  });
});

describe("clearing the fixed folder of a script", () => {
  const fixed = act("a", { kind: "script", command: "make", runs: "fixed", cwd: "/old" } as Partial<Action>);

  it("survives the JSON trip a workspace edit makes between windows", () => {
    const patch = JSON.parse(JSON.stringify(withFixedCwd(fixed, "   "))) as Action;
    expect("cwd" in patch).toBe(true);
    const [updated] = updateAction([fixed], "a", patch);
    expect(updated?.runs).toBe("fixed");
  });

  it("an undefined folder would not: the old one survives the same trip", () => {
    const patch = JSON.parse(JSON.stringify({ ...fixed, cwd: undefined })) as Action;
    const [updated] = updateAction([fixed], "a", patch);
    expect(updated?.cwd).toBe("/old");
  });

  it("keeps a folder that was typed, trimmed", () => {
    const [updated] = updateAction([fixed], "a", JSON.parse(JSON.stringify(withFixedCwd(fixed, " /new "))) as Action);
    expect(updated?.cwd).toBe("/new");
  });
});

describe("an agent command pasted with a tab", () => {
  it("turns the tab into a space so it is not typed as a completion request", () => {
    const out = normalizeAction({ id: "g", name: "G", kind: "agent", command: "claude\t--model\tx", ownButton: true });
    expect(out?.command).toBe("claude --model x");
  });
});
