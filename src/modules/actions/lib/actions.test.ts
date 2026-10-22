import { describe, expect, it } from "vitest";
import {
  addAction,
  adoptActionAt,
  normalizeActions,
  partitionForHeader,
  promoteToGlobal,
  removeAction,
  reorderActions,
  updateAction,
} from "./actions";
import type { Action } from "./types";

const act = (id: string, o: Partial<Action> = {}): Action => ({
  id,
  name: id,
  runInTerminal: true,
  command: `run ${id}`,
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
    const [app] = updateAction([act("a", { cwdMode: "fixed", cwd: "/x" })], "a", { runInTerminal: false });
    expect(app).not.toHaveProperty("cwdMode");
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

  it("apps never carry a cwd mode or folder", () => {
    const [app] = normalizeActions([act("a", { runInTerminal: false, cwdMode: "fixed", cwd: "/x" })]);
    expect(app).not.toHaveProperty("cwdMode");
    expect(app).not.toHaveProperty("cwd");
  });

  it("a folder only survives with the fixed mode", () => {
    const [s] = normalizeActions([act("a", { cwdMode: "workspace", cwd: "/x" })]);
    expect(s).toHaveProperty("cwdMode", "workspace");
    expect(s).not.toHaveProperty("cwd");
    const [f] = normalizeActions([act("b", { cwdMode: "fixed", cwd: "/x" })]);
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
    const out = normalizeActions([null, 3, { id: "a" }, { id: 7, command: "x" }, { id: "b", command: "x" }]);
    expect(out).toEqual([{ id: "b", name: "x", runInTerminal: false, command: "x", ownButton: false }]);
  });
});

describe("promoteToGlobal", () => {
  it("moves the action and keeps its id", () => {
    const r = promoteToGlobal([act("a"), act("b")], [act("g")], "a", () => "unused");
    expect(r.workspace.map((a) => a.id)).toEqual(["b"]);
    expect(r.global.map((a) => a.id)).toEqual(["g", "a"]);
  });

  it("an id already taken in the global list gets a fresh id, so neither version is lost", () => {
    const r = promoteToGlobal([act("a", { name: "mine" })], [act("a", { name: "old" })], "a", () => "fresh");
    expect(r.workspace).toEqual([]);
    expect(r.global.map((a) => [a.id, a.name])).toEqual([
      ["a", "old"],
      ["fresh", "mine"],
    ]);
  });

  it("is a no-op for an unknown id", () => {
    const w = [act("a")];
    const g = [act("g")];
    const r = promoteToGlobal(w, g, "zz", () => "unused");
    expect(r.workspace).toBe(w);
    expect(r.global).toBe(g);
  });
});

describe("partitionForHeader", () => {
  it("keeps own-button actions in user order and groups the rest by kind", () => {
    const list = [
      act("s1"),
      act("a1", { runInTerminal: false, ownButton: true }),
      act("s2", { ownButton: true }),
      act("a2", { runInTerminal: false }),
    ];
    const p = partitionForHeader(list);
    expect(p.ownButtons.map((a) => a.id)).toEqual(["a1", "s2"]);
    expect(p.scripts.map((a) => a.id)).toEqual(["s1"]);
    expect(p.apps.map((a) => a.id)).toEqual(["a2"]);
  });
});

describe("updateAction appId", () => {
  it("an empty appId clears the preset link, which a missing key cannot do", () => {
    const preset: Action = { id: "a1", name: "Zed", runInTerminal: false, command: "zed {workspace}", appId: "zed", ownButton: false };
    expect(updateAction([preset], "a1", { appId: "" })[0]?.appId).toBeUndefined();
    expect(updateAction([preset], "a1", { ownButton: true })[0]?.appId).toBe("zed");
  });
});

describe("adoptActionAt", () => {
  const mk = (id: string): Action => ({ id, name: id, runInTerminal: false, command: "x", ownButton: false });

  it("goes before the named Action, last when it is unknown or not given", () => {
    const list = [mk("a"), mk("b")];
    expect(adoptActionAt(list, mk("n"), () => "fresh", "b").list.map((x) => x.id)).toEqual(["a", "n", "b"]);
    expect(adoptActionAt(list, mk("n"), () => "fresh", "ghost").list.map((x) => x.id)).toEqual(["a", "b", "n"]);
    expect(adoptActionAt(list, mk("n"), () => "fresh").list.map((x) => x.id)).toEqual(["a", "b", "n"]);
  });

  it("returns the stored Action, with a fresh id when its own is taken", () => {
    const { list, stored } = adoptActionAt([mk("a")], mk("a"), () => "fresh", "a");
    expect(stored.id).toBe("fresh");
    expect(list.map((x) => x.id)).toEqual(["fresh", "a"]);
  });
});
