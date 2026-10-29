import type { ShortcutHandlers } from "@/modules/shortcuts/lib/useGlobalShortcuts";
import type { ShortcutId } from "@/modules/shortcuts/shortcuts";
import type { RowMenuItemId } from "./rowMenu";

// The shortcuts that act on a tab, and the item of the tab row menu each one is the twin of. With a
// palette open they run that item on the highlighted row instead of acting on the tab behind it.
export const PALETTE_TAB_SHORTCUTS = {
  "tab.close": "close",
  "path.copy": "copy",
  "tab.lock": "lock",
  "tab.hibernate": "hibernateTab",
  "tab.note": "note",
  "tab.rename": "rename",
  "editor.save": "save",
} as const satisfies Partial<Record<ShortcutId, RowMenuItemId>>;

// The shortcuts a palette answers to by itself rather than through a menu item.
const PALETTE_OWN_SHORTCUTS: readonly ShortcutId[] = [
  "tab.new",
  "workspace.close",
  "palette.folderCurrent",
  "palette.folderRoot",
  "palette.folderMain",
  "palette.folderHome",
  "palette.menuAction",
  "palette.worktrees",
];

// Every shortcut an open palette owns: the rest of the app's shortcuts are not its business.
export function isPaletteShortcut(id: ShortcutId): boolean {
  return id in PALETTE_TAB_SHORTCUTS || PALETTE_OWN_SHORTCUTS.includes(id);
}

export function isPaletteTabShortcut(id: ShortcutId): boolean {
  return id in PALETTE_TAB_SHORTCUTS;
}

// The handlers with each tab shortcut offered first to the open palette; with none open, or when it
// declines, the original handler runs.
export function withPaletteTabShortcuts(
  handlers: ShortcutHandlers,
  offer: (item: RowMenuItemId) => boolean,
): ShortcutHandlers {
  const out: ShortcutHandlers = { ...handlers };
  for (const [id, item] of Object.entries(PALETTE_TAB_SHORTCUTS) as [ShortcutId, RowMenuItemId][]) {
    const base = handlers[id];
    out[id] = (e) => {
      if (offer(item)) return;
      base?.(e);
    };
  }
  return out;
}
