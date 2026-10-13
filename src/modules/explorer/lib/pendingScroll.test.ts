import { describe, expect, it } from "vitest";
import { listingsSettled, resolvePendingScroll } from "./pendingScroll";

describe("resolvePendingScroll", () => {
  it("does nothing without a pending value", () => {
    expect(resolvePendingScroll(0, 1000, 200, false)).toEqual({ scrollTo: null, done: true });
  });

  it("applies the value as soon as the list is tall enough", () => {
    expect(resolvePendingScroll(400, 1000, 200, false)).toEqual({ scrollTo: 400, done: true });
  });

  it("keeps waiting while listings are loading and the list is still short", () => {
    expect(resolvePendingScroll(400, 300, 200, false)).toEqual({ scrollTo: null, done: false });
  });

  it("clamps to the real maximum once the listings settle (taller window)", () => {
    expect(resolvePendingScroll(400, 400, 200, true)).toEqual({ scrollTo: 200, done: true });
  });

  it("never scrolls to a negative offset when the list fits", () => {
    expect(resolvePendingScroll(400, 100, 200, true)).toEqual({ scrollTo: 0, done: true });
  });
});

describe("listingsSettled", () => {
  it("is not settled before the root has a listing", () => {
    expect(listingsSettled("/p", {})).toBe(false);
    expect(listingsSettled("/p", { "/p": { status: "loading" } })).toBe(false);
  });

  it("is not settled while any folder is loading or idle", () => {
    expect(
      listingsSettled("/p", { "/p": { status: "loaded" }, "/p/a": { status: "loading" } }),
    ).toBe(false);
    expect(listingsSettled("/p", { "/p": { status: "loaded" }, "/p/a": { status: "idle" } })).toBe(
      false,
    );
  });

  it("is settled once every listing finished, failures included", () => {
    expect(
      listingsSettled("/p", { "/p": { status: "loaded" }, "/p/gone": { status: "error" } }),
    ).toBe(true);
    expect(listingsSettled("/p", { "/p": { status: "error" } })).toBe(true);
  });

  it("is never settled without a root", () => {
    expect(listingsSettled(null, {})).toBe(false);
  });
});
