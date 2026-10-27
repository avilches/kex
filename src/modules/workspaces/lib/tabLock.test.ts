import { describe, expect, it } from "vitest";
import { toggleTabLock } from "./tabLock";
import type { Tab } from "./types";

describe("toggleTabLock", () => {
  it("locks and unlocks a terminal", () => {
    const t = { id: "t", kind: "terminal" } as Tab;
    const locked = toggleTabLock(t);
    expect(locked.locked).toBe(true);
    expect(toggleTabLock(locked).locked).toBe(false);
  });

  it("makes a preview tab permanent when it locks it", () => {
    for (const kind of ["editor", "markdown", "git-diff", "git-commit-file"] as const) {
      const t = { id: "t", kind, preview: true } as Tab;
      expect(toggleTabLock(t)).toMatchObject({ locked: true, preview: false });
    }
  });

  it("leaves the preview flag alone when unlocking and on kinds without one", () => {
    const e = { id: "t", kind: "editor", preview: true, locked: true } as Tab;
    expect(toggleTabLock(e)).toMatchObject({ locked: false, preview: true });
    expect("preview" in toggleTabLock({ id: "b", kind: "browser", url: "" } as Tab)).toBe(false);
  });
});
