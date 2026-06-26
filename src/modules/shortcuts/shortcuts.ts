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
  | "tab.reopenClosed"
  | "tab.rename"
  | "tab.lock"
  | "tab.focusOnExplorer"
  | "tab.toggleAutofocus"
  | "file.rename"
  | "file.copy"
  | "file.cut"
  | "file.paste"
  | "file.delete"
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
  | "terminal.scratchpad"
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
  | "explorer.toggleHidden"
  | "notifications.toggle"
  | "window.new"
  | "workspace.new"
  | "workspace.close"
  | "workspace.prev"
  | "workspace.next"
  | "workspace.selectByIndex"
  | "view.zoomIn"
  | "view.zoomOut"
  | "view.zoomReset"
  | "view.zenMode"
  | "settings.open"
  | "editor.undo"
  | "editor.redo"
  | "editor.markdown.toggleView"
  | "editor.save"
  | "editor.html.toggleView"
  | "editor.preview.toggleSplit"
  | "path.copy"
  | "notifications.jumpToLast";

export type ShortcutGroup =
  | "General"
  | "Sidebar"
  | "Tabs"
  | "Panes"
  | "Terminal"
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
    id: "window.new",
    label: "New Window",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "n" }],
  },
  {
    id: "workspace.new",
    label: "New Workspace",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, key: "n" }],
  },
  {
    id: "workspace.close",
    label: "Close Workspace",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "w" }],
  },
  {
    id: "workspace.prev",
    label: "Previous Workspace",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "ArrowUp" }],
  },
  {
    id: "workspace.next",
    label: "Next Workspace",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "ArrowDown" }],
  },
  {
    id: "workspace.selectByIndex",
    label: "Jump to Workspace 1–9",
    group: "General",
    // Wildcard digit: Cmd+1..9 jump to that workspace. The "1" is just the
    // representative binding; matchBinding treats any 1-9 as a hit (see the
    // workspace.selectByIndex special case). Cmd+0 is left to Reset Zoom.
    defaultBindings: [{ meta: true, key: "1" }],
  },
  {
    id: "commandPalette.open",
    label: "Open Command Palette",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, key: "p" }],
  },
  {
    id: "commandPalette.content",
    label: "Find in Files",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "p" }],
  },
  {
    id: "settings.open",
    label: "Open Settings",
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
    label: "Explorer (cycle root)",
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
    // No default binding: Ctrl+1/Ctrl+2 are now tab.selectByIndex. Cycle the
    // explorer root with Cmd+E (sidebar.showExplorer); these stay reassignable.
    defaultBindings: [],
  },
  {
    id: "explorer.viewPinned",
    label: "Explorer: Workspace Root",
    group: "Sidebar",
    defaultBindings: [],
  },
  {
    id: "explorer.toggleHidden",
    label: "Explorer: Toggle Hidden Files",
    group: "Sidebar",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "." }],
  },
  {
    id: "explorer.search",
    label: "Search Files",
    group: "Sidebar",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "f" }],
  },
  {
    id: "path.copy",
    label: "Copy Path",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "c" }],
  },
  {
    id: "file.copy",
    label: "Copy File",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, key: "c" }],
  },
  {
    id: "file.cut",
    label: "Cut File",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, key: "x" }],
  },
  {
    id: "file.paste",
    label: "Paste File",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, key: "v" }],
  },
  {
    id: "file.delete",
    label: "Delete File",
    group: "General",
    defaultBindings: [{ key: "Delete" }],
  },
  {
    id: "file.rename",
    label: "Rename File",
    group: "General",
    defaultBindings: [{ key: "F2" }],
  },
  {
    id: "tab.new",
    label: "New Terminal Tab",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, key: "t" }],
  },
  {
    id: "tab.newBlock",
    label: "New Blocks Terminal",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, key: "b" }],
  },
  {
    id: "tab.newBrowser",
    label: "New Browser Tab",
    group: "Tabs",
    // Cmd/Ctrl+P now opens the command palette, so the browser moves here.
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "o" }],
  },
  {
    id: "tab.newEditor",
    label: "New Editor Tab",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, key: "o" }],
  },
  {
    id: "tab.close",
    label: "Close Tab or Pane",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, key: "w" }],
  },
  {
    id: "tab.reopenClosed",
    label: "Reopen Closed Tab",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "t" }],
  },
  {
    id: "tab.rename",
    label: "Rename Tab",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, key: "r" }],
  },
  {
    id: "tab.lock",
    label: "Lock Tab (Prevent Close)",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "l" }],
  },
  {
    id: "tab.focusOnExplorer",
    label: "Focus Tab File or Folder in Explorer",
    group: "Tabs",
    defaultBindings: [{ key: "F4" }],
  },
  {
    id: "tab.toggleAutofocus",
    label: "Toggle Tab Autofocus",
    group: "Tabs",
    defaultBindings: [{ shift: true, key: "F4" }],
  },
  {
    id: "pane.splitRight",
    label: "Split Pane Right",
    group: "Panes",
    defaultBindings: [{ [MOD_PROP]: true, key: "d" }],
  },
  {
    id: "pane.splitDown",
    label: "Split Pane Down",
    group: "Panes",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "d" }],
  },
  {
    id: "pane.focusUp",
    label: "Focus Pane Above",
    group: "Panes",
    defaultBindings: IS_MAC
      ? [{ meta: true, ctrl: true, key: "ArrowUp" }]
      : [{ ctrl: true, alt: true, key: "ArrowUp" }],
  },
  {
    id: "pane.focusDown",
    label: "Focus Pane Below",
    group: "Panes",
    defaultBindings: IS_MAC
      ? [{ meta: true, ctrl: true, key: "ArrowDown" }]
      : [{ ctrl: true, alt: true, key: "ArrowDown" }],
  },
  {
    id: "pane.focusLeft",
    label: "Focus Pane to the Left",
    group: "Panes",
    defaultBindings: IS_MAC
      ? [{ meta: true, ctrl: true, key: "ArrowLeft" }]
      : [{ ctrl: true, alt: true, key: "ArrowLeft" }],
  },
  {
    id: "pane.focusRight",
    label: "Focus Pane to the Right",
    group: "Panes",
    defaultBindings: IS_MAC
      ? [{ meta: true, ctrl: true, key: "ArrowRight" }]
      : [{ ctrl: true, alt: true, key: "ArrowRight" }],
  },
  {
    id: "terminal.clear",
    label: "Clear Terminal",
    group: "Terminal",
    // macOS Terminal's ⌘K (clear scrollback, keep the prompt). Default only on
    // macOS — on other platforms Ctrl+K is readline's kill-line, so we leave it
    // unbound and let users assign their own in settings.
    defaultBindings: IS_MAC ? [{ meta: true, key: "k" }] : [],
  },
  {
    id: "terminal.scratchpad",
    label: "Toggle Scratchpad Bar",
    group: "Terminal",
    defaultBindings: IS_MAC ? [{ meta: true, key: "u" }] : [],
  },
  {
    id: "blocks.prev",
    label: "Previous Command Block",
    group: "Terminal",
    defaultBindings: [{ [MOD_PROP]: true, key: "ArrowUp" }],
    allowRepeat: true,
  },
  {
    id: "blocks.next",
    label: "Next Command Block",
    group: "Terminal",
    defaultBindings: [{ [MOD_PROP]: true, key: "ArrowDown" }],
    allowRepeat: true,
  },
  {
    id: "tab.next",
    label: "Next Tab",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "ArrowRight" }],
  },
  {
    id: "tab.prev",
    label: "Previous Tab",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "ArrowLeft" }],
  },
  {
    id: "tab.selectByIndex",
    label: "Jump to Tab 1–9 (0 = last)",
    group: "Tabs",
    // Wildcard digit: Ctrl+1..9 select that tab in the active pane, Ctrl+0
    // selects the last one. The "1" is just the representative binding.
    defaultBindings: [{ ctrl: true, key: "1" }],
  },
  {
    id: "search.focus",
    label: "Find",
    group: "Tabs",
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
    label: "Jump to Latest Notification",
    group: "View",
    defaultBindings: [{ [MOD_PROP]: true, key: "i" }],
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
    label: "Reset Zoom",
    group: "View",
    defaultBindings: [{ [MOD_PROP]: true, key: "0" }],
  },
  {
    id: "view.zenMode",
    label: "Toggle Full Pane",
    group: "View",
    defaultBindings: [{ key: "F5" }],
  },
  // Editor entries are display-only: CodeMirror's historyKeymap binds these
  // keys natively. We register them here so the shortcuts dialog can surface
  // them — they don't have App-level handlers, so `useGlobalShortcuts` falls
  // through without `preventDefault`, leaving CodeMirror to handle the event.
  // Also excluded from the customization UI in ShortcutsSection.
  {
    id: "editor.markdown.toggleView",
    label: "Toggle Markdown Preview",
    group: "Editor",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "v" }],
  },
  {
    id: "editor.save",
    label: "Save file",
    group: "Editor",
    defaultBindings: [{ [MOD_PROP]: true, key: "s" }],
  },
  {
    id: "editor.html.toggleView",
    label: "Toggle HTML preview",
    group: "Editor",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "v" }],
  },
  {
    id: "editor.preview.toggleSplit",
    label: "Toggle split preview",
    group: "Editor",
    defaultBindings: [],
  },
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

  // Special case for the index shortcuts: the binding key is just a
  // representative digit; ANY digit in range counts as a hit (the handler
  // reads e.key for the actual index). Workspaces use 1-9 (0 stays Reset Zoom);
  // tabs use 0-9 (0 = last tab).
  if (id === "workspace.selectByIndex") {
    if (!/^[1-9]$/.test(e.key) || !/^[0-9]$/.test(binding.key)) return false;
  } else if (id === "tab.selectByIndex") {
    if (!/^[0-9]$/.test(e.key) || !/^[0-9]$/.test(binding.key)) return false;
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
