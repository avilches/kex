import { describe, expect, it } from "vitest";
import { planReveal } from "./revealPlan";

describe("planReveal", () => {
  it("settles at once when the content has no height, because no transition would run", () => {
    expect(planReveal(0, false)).toBe("settle");
  });

  it("settles at once under reduced motion", () => {
    expect(planReveal(120, true)).toBe("settle");
  });

  it("animates when there is content and motion is allowed", () => {
    expect(planReveal(120, false)).toBe("animate");
  });
});
