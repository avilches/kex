import { IS_MAC, MOD_PROP } from "@/lib/platform";

/**
 * Single source of truth for keyboard shortcuts.
 */

export type ShortcutId =
  | "commandPalette.open"
  | "commandPalette.content"
  | "tab.new"
  | "tab.newBlock"
  | "tab.newBrowser"
  | "tab.newEditor"
  | "tab.close"
  | "tab.rename"
  | "tab.lock"
  | "tab.focusOnExplorer"
  | "file.rename"
  | "file.copy"
  | "file.cut"
  | "file.paste"
  | "tab.next"
  | "tab.prev"
  | "tab.selectByIndex"
  | "pane.splitRight"
  | "pane.splitDown"
  | "pane.focusUp"
  | "pane.focusDown"
  | "pane.focusLeft"
  | "pane.focusRight"
  | "terminal.clear"
  | "blocks.prev"
  | "blocks.next"
  | "search.focus"
  | "explorer.search"
  | "sidebar.toggle"
  | "sidebar.showExplorer"
  | "sidebar.showGit"
  | "sidebar.showHistory"
  | "explorer.viewFilesystem"
  | "explorer.viewPinned"
  | "explorer.viewTerminal"
  | "explorer.viewGit"
  | "notifications.toggle"
  | "window.new"
  | "workspace.new"
  | "workspace.prev"
  | "workspace.next"
  | "view.zoomIn"
  | "view.zoomOut"
  | "view.zoomReset"
  | "view.zenMode"
  | "settings.open"
  | "editor.undo"
  | "editor.redo"
  | "path.copy"
  | "notifications.jumpToLast";

export type ShortcutGroup =
  | "General"
  | "Sidebar"
  | "Tabs"
  | "Panes"
  | "Terminal"
  | "Search"
  | "View"
  | "Editor";

export type KeyBinding = {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
};

export type Shortcut = {
  id: ShortcutId;
  label: string;
  group: ShortcutGroup;
  defaultBindings: KeyBinding[];
  allowRepeat?: boolean;
};

export const SHORTCUTS: Shortcut[] = [
  {
    id: "commandPalette.open",
    label: "Open command palette",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, key: "p" }],
  },
  {
    id: "commandPalette.content",
    label: "Find in files",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "p" }],
  },
  {
    id: "settings.open",
    label: "Open settings",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, key: "," }],
  },
  {
    id: "sidebar.toggle",
    label: "Toggle Sidebar",
    group: "Sidebar",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "b" }],
  },
  {
    id: "sidebar.showExplorer",
    label: "Show Explorer",
    group: "Sidebar",
    defaultBindings: [{ [MOD_PROP]: true, key: "e" }],
  },
  {
    id: "sidebar.showGit",
    label: "Show Git Changes",
    group: "Sidebar",
    defaultBindings: [{ [MOD_PROP]: true, key: "g" }],
  },
  {
    id: "sidebar.showHistory",
    label: "Show Git History",
    group: "Sidebar",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "h" }],
  },
  {
    id: "explorer.viewFilesystem",
    label: "Explorer: File System",
    group: "Sidebar",
    defaultBindings: [{ ctrl: true, key: "1" }],
  },
  {
    id: "explorer.viewPinned",
    label: "Explorer: Workspace Root",
    group: "Sidebar",
    defaultBindings: [{ ctrl: true, key: "2" }],
  },
  {
    id: "explorer.viewTerminal",
    label: "Explorer: Follow Terminal",
    group: "Sidebar",
    defaultBindings: [{ ctrl: true, key: "3" }],
  },
  {
    id: "explorer.viewGit",
    label: "Explorer: Follow Git Root",
    group: "Sidebar",
    defaultBindings: [{ ctrl: true, key: "4" }],
  },
  {
    id: "path.copy",
    label: "Copy path",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "c" }],
  },
  {
    id: "file.copy",
    label: "Copy file",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, key: "c" }],
  },
  {
    id: "file.cut",
    label: "Cut file",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, key: "x" }],
  },
  {
    id: "file.paste",
    label: "Paste file",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, key: "v" }],
  },
  {
    id: "file.rename",
    label: "Rename file",
    group: "General",
    defaultBindings: [{ key: "F2" }],
  },
  {
    id: "tab.new",
    label: "New terminal tab",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, key: "t" }],
  },
  {
    id: "tab.newBlock",
    label: "New Blocks terminal",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "t" }],
  },
  {
    id: "tab.newBrowser",
    label: "New browser tab",
    group: "Tabs",
    // Cmd/Ctrl+P now opens the command palette, so the browser moves here.
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "o" }],
  },
  {
    id: "tab.newEditor",
    label: "New editor tab",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, key: "o" }],
  },
  {
    id: "tab.close",
    label: "Close tab or pane",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, key: "w" }],
  },
  {
    id: "tab.rename",
    label: "Rename tab",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, key: "r" }],
  },
  {
    id: "tab.lock",
    label: "Lock tab (prevent close)",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "l" }],
  },
  {
    id: "tab.focusOnExplorer",
    label: "Focus tab file or folder in explorer",
    group: "Tabs",
    defaultBindings: [{ key: "F4" }],
  },
  {
    id: "pane.splitRight",
    label: "Split pane right",
    group: "Panes",
    defaultBindings: [{ [MOD_PROP]: true, key: "d" }],
  },
  {
    id: "pane.splitDown",
    label: "Split pane down",
    group: "Panes",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "d" }],
  },
  {
    id: "pane.focusUp",
    label: "Focus pane above",
    group: "Panes",
    defaultBindings: IS_MAC
      ? [{ meta: true, ctrl: true, key: "ArrowUp" }]
      : [{ ctrl: true, alt: true, key: "ArrowUp" }],
  },
  {
    id: "pane.focusDown",
    label: "Focus pane below",
    group: "Panes",
    defaultBindings: IS_MAC
      ? [{ meta: true, ctrl: true, key: "ArrowDown" }]
      : [{ ctrl: true, alt: true, key: "ArrowDown" }],
  },
  {
    id: "pane.focusLeft",
    label: "Focus pane to the left",
    group: "Panes",
    defaultBindings: IS_MAC
      ? [{ meta: true, ctrl: true, key: "ArrowLeft" }]
      : [{ ctrl: true, alt: true, key: "ArrowLeft" }],
  },
  {
    id: "pane.focusRight",
    label: "Focus pane to the right",
    group: "Panes",
    defaultBindings: IS_MAC
      ? [{ meta: true, ctrl: true, key: "ArrowRight" }]
      : [{ ctrl: true, alt: true, key: "ArrowRight" }],
  },
  {
    id: "terminal.clear",
    label: "Clear terminal",
    group: "Terminal",
    // macOS Terminal's ⌘K (clear scrollback, keep the prompt). Default only on
    // macOS — on other platforms Ctrl+K is readline's kill-line, so we leave it
    // unbound and let users assign their own in settings.
    defaultBindings: IS_MAC ? [{ meta: true, key: "k" }] : [],
  },
  {
    id: "blocks.prev",
    label: "Previous command block",
    group: "Terminal",
    defaultBindings: [{ [MOD_PROP]: true, key: "ArrowUp" }],
    allowRepeat: true,
  },
  {
    id: "blocks.next",
    label: "Next command block",
    group: "Terminal",
    defaultBindings: [{ [MOD_PROP]: true, key: "ArrowDown" }],
    allowRepeat: true,
  },
  {
    id: "tab.next",
    label: "Next tab",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "ArrowRight" }],
  },
  {
    id: "tab.prev",
    label: "Previous tab",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "ArrowLeft" }],
  },
  {
    id: "tab.selectByIndex",
    label: "Jump to tab 1–9",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, key: "1" }],
  },
  {
    id: "explorer.search",
    label: "Search files",
    group: "Search",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "f" }],
  },
  {
    id: "search.focus",
    label: "Find",
    group: "Search",
    defaultBindings: [{ [MOD_PROP]: true, key: "f" }],
  },
  {
    id: "notifications.toggle",
    label: "Notifications",
    group: "View",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "i" }],
  },
  {
    id: "notifications.jumpToLast",
    label: "Jump to latest notification",
    group: "View",
    defaultBindings: [{ [MOD_PROP]: true, key: "i" }],
  },
  {
    id: "workspace.new",
    label: "New workspace",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, key: "n" }],
  },
  {
    id: "window.new",
    label: "New window",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "n" }],
  },
  {
    id: "workspace.prev",
    label: "Previous workspace",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "ArrowUp" }],
  },
  {
    id: "workspace.next",
    label: "Next workspace",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "ArrowDown" }],
  },
  {
    id: "view.zoomIn",
    label: "Zoom in",
    group: "View",
    defaultBindings: [
      { [MOD_PROP]: true, key: "=" },
      { [MOD_PROP]: true, shift: true, key: "+" },
    ],
    allowRepeat: true,
  },
  {
    id: "view.zoomOut",
    label: "Zoom out",
    group: "View",
    defaultBindings: [
      { [MOD_PROP]: true, key: "-" },
      { [MOD_PROP]: true, shift: true, key: "_" },
    ],
    allowRepeat: true,
  },
  {
    id: "view.zoomReset",
    label: "Reset zoom",
    group: "View",
    defaultBindings: [{ [MOD_PROP]: true, key: "0" }],
  },
  {
    id: "view.zenMode",
    label: "Toggle zen mode",
    group: "View",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "z" }],
  },
  // Editor entries are display-only: CodeMirror's historyKeymap binds these
  // keys natively. We register them here so the shortcuts dialog can surface
  // them — they don't have App-level handlers, so `useGlobalShortcuts` falls
  // through without `preventDefault`, leaving CodeMirror to handle the event.
  // Also excluded from the customization UI in ShortcutsSection.
  {
    id: "editor.undo",
    label: "Undo",
    group: "Editor",
    defaultBindings: [{ [MOD_PROP]: true, key: "z" }],
  },
  {
    id: "editor.redo",
    label: "Redo",
    group: "Editor",
    defaultBindings: [{ [MOD_PROP]: true, key: "y" }],
  },
];

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  "General",
  "Sidebar",
  "Tabs",
  "Panes",
  "Terminal",
  "View",
  "Search",
  "Editor",
];

export function bindingsEqual(a: KeyBinding, b: KeyBinding): boolean {
  return (
    a.key.toLowerCase() === b.key.toLowerCase() &&
    !!a.ctrl === !!b.ctrl &&
    !!a.shift === !!b.shift &&
    !!a.alt === !!b.alt &&
    !!a.meta === !!b.meta
  );
}

/**
 * Matching logic: checks if a KeyboardEvent matches a KeyBinding.
 */
export function matchBinding(
  e: KeyboardEvent,
  binding: KeyBinding,
  id?: ShortcutId
): boolean {
  // On macOS, Option/Alt transforms alpha keys (e.g. Option+B → "∫"), so when
  // the binding includes alt, compare against e.code ("KeyB") rather than e.key.
  const eventKey = (binding.alt && /^Key[A-Z]$/.test(e.code))
    ? e.code.slice(3).toLowerCase()
    : e.key.toLowerCase();
  const bindingKey = binding.key.toLowerCase();

  // Special case for Jump to Tab 1-9: only match if both the event key and
  // the binding key are digits 1-9 and they match exactly.
  if (id === "tab.selectByIndex") {
    if (!/^[1-9]$/.test(e.key) || !/^[1-9]$/.test(binding.key)) return false;
    if (eventKey !== bindingKey) return false;
  } else if (eventKey !== bindingKey) {
    return false;
  }

  return (
    !!e.ctrlKey === !!binding.ctrl &&
    !!e.shiftKey === !!binding.shift &&
    !!e.altKey === !!binding.alt &&
    !!e.metaKey === !!binding.meta
  );
}

/**
 * Resolves the effective bindings for a shortcut id (user overrides win over
 * defaults) and checks whether the event matches any of them. Use this instead
 * of comparing raw key strings so component-local handlers respect the
 * user-configured keymap.
 */
export function matchesShortcut(
  e: KeyboardEvent,
  id: ShortcutId,
  userShortcuts?: Record<ShortcutId, KeyBinding[]>,
): boolean {
  const sc = SHORTCUTS.find((s) => s.id === id);
  if (!sc) return false;
  const bindings = userShortcuts?.[id] || sc.defaultBindings;
  return bindings.some((b) => matchBinding(e, b, id));
}

/**
 * Display helpers
 */
export function getBindingTokens(binding?: KeyBinding): string[] {
  if (!binding) return [];
  const tokens: string[] = [];
  if (IS_MAC) {
    if (binding.ctrl) tokens.push("⌃");
    if (binding.alt) tokens.push("⌥");
    if (binding.shift) tokens.push("⇧");
    if (binding.meta) tokens.push("⌘");
  } else {
    if (binding.ctrl) tokens.push("Ctrl");
    if (binding.alt) tokens.push("Alt");
    if (binding.shift) tokens.push("Shift");
    if (binding.meta) tokens.push("Win");
  }

  let keyLabel = binding.key;
  if (keyLabel === " ") keyLabel = "Space";
  else if (keyLabel === "ArrowUp") keyLabel = "↑";
  else if (keyLabel === "ArrowDown") keyLabel = "↓";
  else if (keyLabel === "ArrowLeft") keyLabel = "←";
  else if (keyLabel === "ArrowRight") keyLabel = "→";
  else if (keyLabel.length === 1) keyLabel = keyLabel.toUpperCase();

  tokens.push(keyLabel);
  return tokens;
}

export const SHORTCUTS_BY_ID = new Map(SHORTCUTS.map((s) => [s.id, s]));

export function getShortcutLabel(
  id: ShortcutId,
  userShortcuts: Partial<Record<ShortcutId, KeyBinding[]>>,
): string | null {
  const shortcut = SHORTCUTS_BY_ID.get(id);
  if (!shortcut) return null;
  const bindings = userShortcuts[id] ?? shortcut.defaultBindings;
  const tokens = getBindingTokens(bindings?.[0]);
  return tokens.length ? tokens.join(" ") : null;
}
