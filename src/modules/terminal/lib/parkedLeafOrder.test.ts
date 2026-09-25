import { describe, expect, it } from "vitest";
import { drop, evictOverflow, touch } from "./parkedLeafOrder";

describe("touch", () => {
  it("appends a new id", () => {
    const order: string[] = ["a"];
    touch(order, "b");
    expect(order).toEqual(["a", "b"]);
  });

  it("moves an existing id to the end instead of duplicating it", () => {
    const order = ["a", "b", "c"];
    touch(order, "a");
    expect(order).toEqual(["b", "c", "a"]);
  });
});

describe("drop", () => {
  it("removes an id", () => {
    const order = ["a", "b", "c"];
    drop(order, "b");
    expect(order).toEqual(["a", "c"]);
  });

  it("is a no-op when the id is absent", () => {
    const order = ["a", "b"];
    drop(order, "z");
    expect(order).toEqual(["a", "b"]);
  });
});

describe("evictOverflow", () => {
  it("returns nothing and leaves the order untouched when within budget", () => {
    const order = ["a", "b", "c"];
    expect(evictOverflow(order, 3)).toEqual([]);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("evicts the oldest entries first, beyond the budget", () => {
    const order = ["a", "b", "c", "d"];
    expect(evictOverflow(order, 2)).toEqual(["a", "b"]);
    expect(order).toEqual(["c", "d"]);
  });

  it("evicts everyone at budget zero", () => {
    const order = ["a", "b"];
    expect(evictOverflow(order, 0)).toEqual(["a", "b"]);
    expect(order).toEqual([]);
  });

  it("treats a negative budget as zero", () => {
    const order = ["a", "b"];
    expect(evictOverflow(order, -3)).toEqual(["a", "b"]);
    expect(order).toEqual([]);
  });
});
