import { beforeEach, describe, expect, it } from "vitest";
import { isHibernating, markHibernating, unmarkHibernating } from "./hibernatingTabs";

describe("hibernatingTabs", () => {
  beforeEach(() => unmarkHibernating(["a", "b", "c"]));

  it("tracks marked tabs and releases only the ones asked", () => {
    markHibernating(["a", "b"]);
    expect(isHibernating("a")).toBe(true);
    unmarkHibernating(["a"]);
    expect(isHibernating("a")).toBe(false);
    expect(isHibernating("b")).toBe(true);
  });

  it("does not report unknown tabs", () => {
    expect(isHibernating("c")).toBe(false);
  });
});
