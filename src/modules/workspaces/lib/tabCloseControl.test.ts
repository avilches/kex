import { describe, expect, it } from "vitest";
import { tabCloseControl } from "./tabCloseControl";
import type { Tab } from "./types";

describe("tabCloseControl", () => {
  it("hibernates an awake terminal instead of closing it", () => {
    expect(tabCloseControl({ id: "t1", kind: "terminal" } as Tab)).toBe("hibernate");
  });

  it("closes a terminal that is already asleep", () => {
    expect(tabCloseControl({ id: "t1", kind: "terminal", hibernation: { at: 1 } } as Tab)).toBe("close");
  });

  it("closes any other kind of tab at once", () => {
    const tabs = [
      { id: "e1", kind: "editor", path: "/a.ts", dirty: false, preview: false },
      { id: "m1", kind: "markdown", path: "/a.md" },
      { id: "b1", kind: "browser", url: "https://example.com" },
    ] as Tab[];
    for (const tab of tabs) expect(tabCloseControl(tab)).toBe("close");
  });
});
