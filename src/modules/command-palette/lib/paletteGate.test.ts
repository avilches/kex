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
  shortcutSwallowedByPalette,
} from "./paletteGate";
import { isPaletteShortcut, isPaletteTabShortcut } from "./paletteShortcuts";
import { shortcutUnavailableBehindPalette } from "@/modules/workspaces/lib/shortcutContext";

const ALL = SHORTCUTS.map((s) => s.id);

const TABS: ShortcutId[] = [
  "tab.close",
  "path.copy",
  "tab.lock",
  "tab.hibernate",
  "tab.note",
  "tab.rename",
  "editor.save",
  "tab.new",
  "workspace.close",
];
const EXPECTED_COMMANDS: ShortcutId[] = [
  ...TABS,
  "commandPalette.open",
  "commandPalette.content",
  "commandPalette.history",
  "palette.menuAction",
];
const EXPECTED_FOLDER: ShortcutId[] = [
  ...TABS.filter((id) => id !== "tab.new"),
  "palette.folderCurrent",
  "palette.folderRoot",
  "palette.folderMain",
  "palette.folderHome",
  "palette.menuAction",
  "palette.worktrees",
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

  it("lets only palette.menuAction of the palette.* shortcuts through the command palette", () => {
    const open = ALL.filter((id) => id.startsWith("palette.") && !shortcutBlockedByPalette(id, "commands"));
    expect(open).toEqual(["palette.menuAction"]);
  });

  it("keeps Jump to Workspace and Select Tab by digit blocked behind the command palette", () => {
    expect(shortcutBlockedByPalette("workspace.selectByIndex", "commands")).toBe(true);
    expect(shortcutBlockedByPalette("tab.selectByIndex", "commands")).toBe(true);
  });

  it("blocks Focus on Sidebar, which the tab menu of a palette no longer offers", () => {
    expect(shortcutBlockedByPalette("tab.focusOnExplorer", "commands")).toBe(true);
    expect(shortcutBlockedByPalette("tab.focusOnExplorer", "folder")).toBe(true);
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
    const rustOnly = new Set(["quit", "dock_browser", "dock_all_browsers"]);
    const known = new Set<string>(MENU_ITEM_IDS);
    for (const id of built) {
      if (rustOnly.has(id)) continue;
      expect(known.has(id), `menu item ${id} is not in MENU_ITEM_IDS`).toBe(true);
    }
  });
});

describe("shortcutSwallowedByPalette", () => {
  const sleeping = { activeTab: { id: "t", kind: "terminal", hibernation: { at: 1 } } as never, hasWorkspaceRoot: true };
  const awake = { activeTab: { id: "t", kind: "terminal" } as never, hasWorkspaceRoot: true };

  it("swallows everything a palette does not list, whatever the tab behind", () => {
    for (const palette of ["commands", "folder"] as const) {
      for (const id of ALL) {
        if (PALETTE_ALLOWED_SHORTCUTS[palette].includes(id)) continue;
        expect(shortcutSwallowedByPalette(id, palette, isPaletteTabShortcut(id), false), `${palette} ${id}`).toBe(true);
      }
    }
  });

  it("lets a tab shortcut the palette owns through even when the tab behind makes it unavailable", () => {
    expect(shortcutSwallowedByPalette("tab.hibernate", "commands", true, true)).toBe(false);
    expect(shortcutSwallowedByPalette("editor.save", "commands", true, true)).toBe(false);
  });

  it("keeps the tab-context rule when no palette is open", () => {
    expect(shortcutSwallowedByPalette("editor.save", "none", true, true)).toBe(true);
    expect(shortcutSwallowedByPalette("tab.close", "none", true, false)).toBe(false);
  });

  it("blocks the palette-only shortcuts when no palette is open", () => {
    expect(shortcutSwallowedByPalette("palette.worktrees", "none", false, false)).toBe(true);
  });

  it("decides exactly like the two checks App.tsx used to make one after the other", () => {
    for (const palette of ["none", "commands", "folder"] as const) {
      for (const ctx of [awake, sleeping]) {
        for (const id of ALL) {
          const owns = isPaletteTabShortcut(id);
          const unavailable = shortcutUnavailableBehindPalette(id, ctx, { open: false, ownsTabShortcut: owns });
          const before =
            shortcutUnavailableBehindPalette(id, ctx, { open: palette !== "none", ownsTabShortcut: owns }) ||
            shortcutBlockedByPalette(id, palette);
          const now = shortcutSwallowedByPalette(id, palette, owns, unavailable);
          expect(now, `${palette} ${id}`).toBe(before);
        }
      }
    }
  });
});
