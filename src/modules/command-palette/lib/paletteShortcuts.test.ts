import { describe, expect, it, vi } from "vitest";
import { SHORTCUTS, type ShortcutId } from "@/modules/shortcuts/shortcuts";
import {
  isPaletteShortcut,
  isPaletteTabShortcut,
  PALETTE_TAB_SHORTCUTS,
  withPaletteTabShortcuts,
} from "./paletteShortcuts";
import { tabMenuItems } from "./rowMenu";
import type { TabEntry } from "./tabEntries";

const key = {} as KeyboardEvent;

describe("PALETTE_TAB_SHORTCUTS", () => {
  it("maps each shortcut to the tab menu item that shows the same shortcut", () => {
    const entry = {
      tabId: "t",
      kind: "editor",
      cwd: "/p",
      detail: "/p/a.ts",
      workspaceRoot: "/p",
      hibernated: false,
      agentSession: undefined,
      tab: { id: "t", kind: "editor", path: "/p/a.ts", dirty: true, note: "n" },
    } as unknown as TabEntry;
    const terminal = {
      ...entry,
      kind: "terminal",
      tab: { id: "t", kind: "terminal", cwd: "/p" },
    } as unknown as TabEntry;
    const items = [
      ...tabMenuItems(entry, { autofocusMode: "manual" }),
      ...tabMenuItems(terminal, { autofocusMode: "manual" }),
    ];
    for (const [shortcutId, itemId] of Object.entries(PALETTE_TAB_SHORTCUTS)) {
      const item = items.find((i) => i.id === itemId);
      expect(item, `${shortcutId} needs a ${itemId} item`).toBeDefined();
      expect(item?.shortcutId).toBe(shortcutId);
    }
  });

  it("only names shortcuts that exist", () => {
    const known = new Set(SHORTCUTS.map((s) => s.id));
    for (const id of Object.keys(PALETTE_TAB_SHORTCUTS)) expect(known.has(id as ShortcutId)).toBe(true);
  });

  it("answers for the palette-owned shortcuts and for no other", () => {
    for (const id of Object.keys(PALETTE_TAB_SHORTCUTS) as ShortcutId[]) {
      expect(isPaletteShortcut(id)).toBe(true);
      expect(isPaletteTabShortcut(id)).toBe(true);
    }
    for (const id of ["tab.new", "workspace.close", "palette.folderRoot", "palette.menuAction"] as const) {
      expect(isPaletteShortcut(id)).toBe(true);
      expect(isPaletteTabShortcut(id)).toBe(false);
    }
    for (const id of ["tab.rename", "tab.next", "workspace.new", "editor.undo"] as const) {
      expect(isPaletteShortcut(id)).toBe(false);
    }
  });
});

describe("withPaletteTabShortcuts", () => {
  it("offers each tab shortcut to the palette with its item and does not run the handler when taken", () => {
    const handlers = Object.fromEntries(
      Object.keys(PALETTE_TAB_SHORTCUTS).map((id) => [id, vi.fn()]),
    );
    const offered: string[] = [];
    const wrapped = withPaletteTabShortcuts(handlers, (item) => {
      offered.push(item);
      return true;
    });
    for (const id of Object.keys(PALETTE_TAB_SHORTCUTS) as ShortcutId[]) wrapped[id]?.(key);
    expect(offered).toEqual(Object.values(PALETTE_TAB_SHORTCUTS));
    for (const fn of Object.values(handlers)) expect(fn).not.toHaveBeenCalled();
  });

  it("runs the original handler when no palette takes the shortcut", () => {
    const lock = vi.fn();
    const wrapped = withPaletteTabShortcuts({ "tab.lock": lock }, () => false);
    wrapped["tab.lock"]?.(key);
    expect(lock).toHaveBeenCalledWith(key);
  });

  it("leaves the other handlers alone", () => {
    const rename = vi.fn();
    const offer = vi.fn(() => true);
    const wrapped = withPaletteTabShortcuts({ "tab.rename": rename }, offer);
    wrapped["tab.rename"]?.(key);
    expect(rename).toHaveBeenCalledTimes(1);
    expect(offer).not.toHaveBeenCalled();
  });
});
