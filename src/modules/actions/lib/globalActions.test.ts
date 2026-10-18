import { describe, expect, it } from "vitest";
import { createGlobalActions } from "./globalActions";
import type { Action } from "./types";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

const act = (id: string, name = id): Action => ({
  id,
  name,
  runInTerminal: false,
  command: `open ${id}`,
  ownButton: false,
});

// A disk that is slow to echo: `read` is what the preferences store shows, which only
// follows the writes after the fact.
function harness(opts: { failOn?: number } = {}) {
  let echoed: Action[] = [];
  const writes: Action[][] = [];
  const gate: Array<() => void> = [];
  const deps = {
    read: () => echoed,
    write: (list: Action[]) =>
      new Promise<void>((resolve, reject) => {
        writes.push(list);
        const n = writes.length;
        gate.push(() => (n === opts.failOn ? reject(new Error("disk full")) : resolve()));
      }),
    makeId: () => `fresh-${writes.length}`,
  };
  return {
    store: createGlobalActions(deps),
    writes,
    echo: (list: Action[]) => {
      echoed = list;
    },
    finish: async (i: number) => {
      await tick();
      gate[i]!();
      await tick();
    },
  };
}

describe("createGlobalActions", () => {
  it("two adds before the store echoes keep both", async () => {
    const h = harness();
    const first = h.store.add(act("a"));
    const second = h.store.add(act("b"));
    expect(h.store.get().map((a) => a.id)).toEqual(["a", "b"]);
    await h.finish(0);
    await first;
    await h.finish(1);
    await second;
    expect(h.writes[h.writes.length - 1]!.map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("serializes the writes: the second starts after the first ends", async () => {
    const h = harness();
    void h.store.add(act("a"));
    void h.store.add(act("b"));
    await tick();
    expect(h.writes).toHaveLength(1);
    await h.finish(0);
    expect(h.writes).toHaveLength(2);
  });

  it("a failed write rejects and takes the action back out of the list", async () => {
    const h = harness({ failOn: 1 });
    const result = h.store.add(act("a"));
    const settled = expect(result).rejects.toThrow("disk full");
    await h.finish(0);
    await settled;
    expect(h.store.get()).toEqual([]);
  });

  it("a failed write does not drop an action added after it", async () => {
    const h = harness({ failOn: 1 });
    const failed = h.store.add(act("a"));
    const kept = h.store.add(act("b"));
    const settled = expect(failed).rejects.toThrow();
    await h.finish(0);
    await settled;
    await h.finish(1);
    await kept;
    expect(h.store.get().map((a) => a.id)).toEqual(["b"]);
    expect(h.writes[h.writes.length - 1]!.map((a) => a.id)).toEqual(["b"]);
  });

  it("an id already global gets a fresh one and both survive", async () => {
    const h = harness();
    h.echo([act("a", "old")]);
    const p = h.store.add(act("a", "mine"));
    expect(h.store.get().map((a) => [a.id, a.name])).toEqual([
      ["a", "old"],
      ["fresh-0", "mine"],
    ]);
    await h.finish(0);
    expect((await p).id).toBe("fresh-0");
  });

  it("goes back to the preferences store once it reports anything after the writes", async () => {
    const h = harness();
    const p = h.store.add(act("a"));
    await h.finish(0);
    await p;
    expect(h.store.get().map((a) => a.id)).toEqual(["a"]);
    h.echo([act("a")]);
    expect(h.store.get().map((a) => a.id)).toEqual(["a"]);
    h.echo([act("a"), act("other-window")]);
    expect(h.store.get().map((a) => a.id)).toEqual(["a", "other-window"]);
  });

  it("another window's change that differs from what was written is not overwritten by the next add", async () => {
    const h = harness();
    const first = h.store.add(act("a"));
    await h.finish(0);
    await first;
    h.echo([act("a"), act("x")]);
    const second = h.store.add(act("b"));
    await h.finish(1);
    await second;
    expect(h.writes[h.writes.length - 1]!.map((a) => a.id)).toEqual(["a", "x", "b"]);
  });

  it("after a failed write the store is the truth when the disk differs", async () => {
    const h = harness({ failOn: 1 });
    const result = h.store.add(act("a"));
    const settled = expect(result).rejects.toThrow("disk full");
    await h.finish(0);
    await settled;
    h.echo([act("x")]);
    expect(h.store.get().map((a) => a.id)).toEqual(["x"]);
  });
});

describe("createGlobalActions.change", () => {
  const ids = (list: Action[]) => list.map((a) => a.id);

  it("applies the function to the latest list, including changes still in flight", async () => {
    const h = harness();
    const added = h.store.add(act("a"));
    const removed = h.store.change((list) => list.filter((a) => a.id !== "a"));
    expect(ids(h.store.get())).toEqual([]);
    await h.finish(0);
    await h.finish(1);
    await Promise.all([added, removed]);
    expect(ids(h.writes[h.writes.length - 1]!)).toEqual([]);
    expect(ids(h.store.get())).toEqual([]);
  });

  it("two changes before the store echoes both land", async () => {
    const h = harness();
    h.echo([act("a"), act("b")]);
    const first = h.store.change((list) => list.filter((a) => a.id !== "a"));
    const second = h.store.change((list) => list.filter((a) => a.id !== "b"));
    await h.finish(0);
    await h.finish(1);
    await Promise.all([first, second]);
    expect(ids(h.writes[h.writes.length - 1]!)).toEqual([]);
  });

  it("a change that leaves the list as it was writes nothing", async () => {
    const h = harness();
    h.echo([act("a")]);
    const result = await h.store.change((list) => list);
    expect(h.writes).toEqual([]);
    expect(ids(result.after)).toEqual(["a"]);
  });

  it("normalizes what the function returns, so an invalid action never reaches the disk", async () => {
    const h = harness();
    const p = h.store.change((list) => [...list, { ...act("bad"), command: "  " }, act("ok")]);
    await h.finish(0);
    await p;
    expect(ids(h.writes[0]!)).toEqual(["ok"]);
  });

  it("a failed write goes back to the list before the change and rejects", async () => {
    const h = harness({ failOn: 1 });
    h.echo([act("a")]);
    const result = h.store.change((list) => list.filter((a) => a.id !== "a"));
    const settled = expect(result).rejects.toThrow("disk full");
    await h.finish(0);
    await settled;
    expect(ids(h.store.get())).toEqual(["a"]);
  });

  it("reports which actions the change removed, so the caller can drop their runtime state", async () => {
    const h = harness();
    h.echo([act("a"), act("b")]);
    const p = h.store.change((list) => list.filter((a) => a.id !== "b"));
    await h.finish(0);
    const { before, after } = await p;
    expect(ids(before)).toEqual(["a", "b"]);
    expect(ids(after)).toEqual(["a"]);
  });
});
