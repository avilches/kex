import { describe, expect, it } from "vitest";
import { tabEndButtons, tabMiddleClick } from "./tabCloseControl";
import type { Tab } from "./types";

const awake = { id: "t1", kind: "terminal" } as Tab;
const asleep = { id: "t1", kind: "terminal", hibernation: { at: 1 } } as Tab;
const others = [
  { id: "e1", kind: "editor", path: "/a.ts", dirty: false, preview: false },
  { id: "m1", kind: "markdown", path: "/a.md" },
  { id: "b1", kind: "browser", url: "https://example.com" },
] as Tab[];

describe("tabEndButtons", () => {
  it("gives an awake terminal both a hibernate and a close button", () => {
    expect(tabEndButtons(awake)).toEqual(["hibernate", "close"]);
  });

  it("gives a sleeping terminal only the close button", () => {
    expect(tabEndButtons(asleep)).toEqual(["close"]);
  });

  it("gives any other kind of tab only the close button", () => {
    for (const tab of others) expect(tabEndButtons(tab)).toEqual(["close"]);
  });
});

describe("tabMiddleClick", () => {
  it("hibernates an awake terminal and closes everything else", () => {
    expect(tabMiddleClick(awake)).toBe("hibernate");
    expect(tabMiddleClick(asleep)).toBe("close");
    for (const tab of others) expect(tabMiddleClick(tab)).toBe("close");
  });
});
