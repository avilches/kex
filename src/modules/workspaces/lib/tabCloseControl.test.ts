import { describe, expect, it } from "vitest";
import { tabMiddleClick } from "./tabCloseControl";
import type { Tab } from "./types";

const awake = { id: "t1", kind: "terminal" } as Tab;
const asleep = { id: "t1", kind: "terminal", hibernation: { at: 1 } } as Tab;
const others = [
  { id: "e1", kind: "editor", path: "/a.ts", dirty: false, preview: false },
  { id: "m1", kind: "markdown", path: "/a.md" },
  { id: "b1", kind: "browser", url: "https://example.com" },
] as Tab[];

describe("tabMiddleClick", () => {
  it("hibernates an awake terminal and closes everything else", () => {
    expect(tabMiddleClick(awake)).toBe("hibernate");
    expect(tabMiddleClick(asleep)).toBe("close");
    for (const tab of others) expect(tabMiddleClick(tab)).toBe("close");
  });
});
