import type { RowMenuItemId } from "./rowMenu";

// The global shortcut listener runs before any keydown handler of a palette, so the shortcuts a
// palette reacts to (Cmd+T, Cmd+Shift+W, Cmd+1..9 and the ones that act on a tab) reach it through
// this registry instead. `paletteShortcuts.ts` lists which ones they are.
export type PaletteShortcut =
  | "newTab"
  // A shortcut that has a twin item in the tab menu; the item id says which.
  | "tabItem"
  | "closeWorkspace"
  | "folderRoot"
  | "folderMain"
  | "folderHome"
  | "menuAction";

// Returns true when the palette took the shortcut, even if it had nothing to do: a shortcut
// pressed over an open palette must not act on the tab behind it.
// `digit` is the 1-9 key of the folder and menu-action shortcuts; `item` the tab menu item of "tabItem".
export type PaletteShortcutHandler = (
  action: PaletteShortcut,
  digit?: number,
  item?: RowMenuItemId,
) => boolean;

let current: PaletteShortcutHandler | null = null;

export function registerPaletteControl(handler: PaletteShortcutHandler): () => void {
  current = handler;
  return () => {
    if (current === handler) current = null;
  };
}

export function runPaletteShortcut(action: PaletteShortcut, digit?: number): boolean {
  return current ? current(action, digit) : false;
}

export function runPaletteTabItem(item: RowMenuItemId): boolean {
  return current ? current("tabItem", undefined, item) : false;
}
