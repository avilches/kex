import { describe, expect, it } from "vitest";
import { SHORTCUTS, type ShortcutId } from "@/modules/shortcuts/shortcuts";
import { SWITCHER_SHORTCUTS, shortcutBlockedBySwitcher } from "./switcherGate";

const ALL = SHORTCUTS.map((s) => s.id);

describe("shortcutBlockedBySwitcher", () => {
  it("lets exactly the two cycling shortcuts through while it is open", () => {
    const open = ALL.filter((id) => !shortcutBlockedBySwitcher(id, true));
    expect(open.sort()).toEqual([...SWITCHER_SHORTCUTS].sort());
  });

  it("blocks nothing while it is closed", () => {
    expect(ALL.filter((id) => shortcutBlockedBySwitcher(id, false))).toEqual([]);
  });

  it("keeps Cmd+W away from tab.close while it is open, since W belongs to the switcher then", () => {
    expect(shortcutBlockedBySwitcher("tab.close", true)).toBe(true);
  });

  it("only lists shortcuts that exist, so a rename cannot silently unblock one", () => {
    for (const id of SWITCHER_SHORTCUTS) expect(ALL).toContain(id);
  });

  it("blocks a shortcut added later by default while it is open", () => {
    expect(shortcutBlockedBySwitcher("some.future.shortcut" as ShortcutId, true)).toBe(true);
  });
});
