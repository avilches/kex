import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SHORTCUTS, type ShortcutId } from "@/modules/shortcuts/shortcuts";
import {
  MENU_ITEM_IDS,
  MENU_ITEM_SHORTCUT,
  menuItemBlockedByPalette,
  openPaletteOf,
  PALETTE_ALLOWED_SHORTCUTS,
  shortcutBlockedByPalette,
} from "./paletteGate";
import { isPaletteShortcut } from "./paletteShortcuts";

const ALL = SHORTCUTS.map((s) => s.id);

const TABS: ShortcutId[] = [
  "tab.close",
  "path.copy",
  "tab.lock",
  "tab.hibernate",
  "tab.note",
  "editor.save",
  "tab.focusOnExplorer",
  "tab.toggleAutofocus",
  "tab.new",
  "workspace.close",
];
const EXPECTED_COMMANDS: ShortcutId[] = [
  ...TABS,
  "commandPalette.open",
  "commandPalette.content",
  "commandPalette.history",
];
const EXPECTED_FOLDER: ShortcutId[] = [
  ...TABS,
  "palette.folderRoot",
  "palette.folderMain",
  "palette.folderHome",
  "palette.menuAction",
];

describe("shortcutBlockedByPalette", () => {
  it("lets through exactly the listed shortcuts with the command palette open", () => {
    const open = ALL.filter((id) => !shortcutBlockedByPalette(id, "commands"));
    expect(open.sort()).toEqual([...EXPECTED_COMMANDS].sort());
  });

  it("lets through exactly the listed shortcuts with the New terminal palette open", () => {
    const open = ALL.filter((id) => !shortcutBlockedByPalette(id, "folder"));
    expect(open.sort()).toEqual([...EXPECTED_FOLDER].sort());
  });

  it("blocks only the palette shortcuts when no palette is open", () => {
    const blocked = ALL.filter((id) => shortcutBlockedByPalette(id, "none"));
    expect(blocked.sort()).toEqual(ALL.filter((id) => id.startsWith("palette.")).sort());
  });

  it("only allows shortcuts that exist, so a rename cannot silently unblock one", () => {
    for (const list of Object.values(PALETTE_ALLOWED_SHORTCUTS)) {
      for (const id of list) expect(ALL).toContain(id);
    }
  });

  it("allows everything the palettes own", () => {
    for (const id of ALL.filter(isPaletteShortcut)) {
      const folderRow = id.startsWith("palette.");
      expect(shortcutBlockedByPalette(id, folderRow ? "folder" : "commands")).toBe(false);
    }
  });

  it("blocks the text editing shortcuts so the input keeps its keys", () => {
    for (const id of ["editor.undo", "editor.redo", "file.copy", "file.cut", "file.paste", "file.delete"] as ShortcutId[]) {
      expect(shortcutBlockedByPalette(id, "commands")).toBe(true);
      expect(shortcutBlockedByPalette(id, "folder")).toBe(true);
    }
  });
});

describe("openPaletteOf", () => {
  it("prefers the command palette and falls back to none", () => {
    expect(openPaletteOf(true, true)).toBe("commands");
    expect(openPaletteOf(false, true)).toBe("folder");
    expect(openPaletteOf(false, false)).toBe("none");
  });
});

describe("menuItemBlockedByPalette", () => {
  it("never blocks with no palette open", () => {
    for (const id of MENU_ITEM_IDS) expect(menuItemBlockedByPalette(id, "none")).toBe(false);
  });

  it("lets only close_tab and new_terminal through an open palette", () => {
    for (const palette of ["commands", "folder"] as const) {
      const open = MENU_ITEM_IDS.filter((id) => !menuItemBlockedByPalette(id, palette));
      expect(open.sort()).toEqual(["close_tab", "new_terminal"]);
    }
  });

  it("blocks an unknown menu id", () => {
    expect(menuItemBlockedByPalette("whatever", "commands")).toBe(true);
  });

  it("names a real shortcut for every item that has one", () => {
    for (const id of MENU_ITEM_IDS) {
      const s = MENU_ITEM_SHORTCUT[id];
      if (s) expect(ALL).toContain(s);
    }
  });

  it("covers every item id the Rust menu builds, except the ones Rust handles itself", () => {
    const rust = readFileSync("src-tauri/src/lib.rs", "utf8");
    const built = [...rust.matchAll(/with_id\("([a-z_]+)"/g)].map((m) => m[1]);
    const rustOnly = new Set(["quit", "new_window", "dock_browser", "dock_all_browsers"]);
    const known = new Set<string>(MENU_ITEM_IDS);
    for (const id of built) {
      if (rustOnly.has(id)) continue;
      expect(known.has(id), `menu item ${id} is not in MENU_ITEM_IDS`).toBe(true);
    }
  });
});
