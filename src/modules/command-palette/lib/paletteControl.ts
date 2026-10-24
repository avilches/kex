// The global shortcut listener runs before any keydown handler of a palette, so the shortcuts a
// palette reacts to (Cmd+T, Cmd+W, Cmd+Shift+C) reach it through this registry instead.
export type PaletteShortcut = "newTab" | "copyPath" | "closeTab";

// Returns true when the palette took the shortcut, even if it had nothing to do: a shortcut
// pressed over an open palette must not act on the tab behind it.
export type PaletteShortcutHandler = (action: PaletteShortcut) => boolean;

let current: PaletteShortcutHandler | null = null;

export function registerPaletteControl(handler: PaletteShortcutHandler): () => void {
  current = handler;
  return () => {
    if (current === handler) current = null;
  };
}

export function runPaletteShortcut(action: PaletteShortcut): boolean {
  return current ? current(action) : false;
}
