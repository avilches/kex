import { ENTER_KEY, IS_MAC, MOD_PROP } from "@/lib/platform";

/**
 * Single source of truth for keyboard shortcuts.
 */

export type ShortcutId =
  | "commandPalette.open"
  | "commandPalette.content"
  | "commandPalette.history"
  | "palette.folderRoot"
  | "palette.folderMain"
  | "palette.folderHome"
  | "palette.menuAction"
  | "tab.new"
  | "tab.newBrowser"
  | "tab.newEditor"
  | "tab.close"
  | "tab.reopenClosed"
  | "tab.rename"
  | "tab.note"
  | "tab.lock"
  | "tab.hibernate"
  | "tab.wake"
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
  | "search.focus"
  | "explorer.search"
  | "sidebar.toggle"
  | "sidebar.showExplorer"
  | "sidebar.showGit"
  | "sidebar.showHistory"
  | "sidebar.showNotes"
  | "explorer.viewFilesystem"
  | "explorer.viewPinned"
  | "explorer.toggleHidden"
  | "notifications.toggle"
  | "window.new"
  | "workspace.new"
  | "workspace.close"
  | "workspace.rename"
  | "workspace.settings"
  | "nav.prev"
  | "nav.next"
  | "workspace.selectByIndex"
  | "view.zoomIn"
  | "view.zoomOut"
  | "view.zoomReset"
  | "view.zenMode"
  | "settings.open"
  | "editor.undo"
  | "editor.redo"
  | "editor.cycleView"
  | "editor.save"
  | "editor.preview.toggleSplit"
  | "markdown.toggleOutline"
  | "path.copy"
  | "notifications.jumpToLast";

export type ShortcutGroup =
  | "General"
  | "Sidebar"
  | "Explorer"
  | "Tabs"
  | "Panes"
  | "Terminal"
  | "View"
  | "Editor"
  | "Palette";

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
    id: "workspace.rename",
    label: "Rename Workspace",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "r" }],
  },
  {
    id: "workspace.settings",
    label: "Workspace Settings",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "," }],
  },
  {
    id: "tab.hibernate",
    label: "Hibernate Tab",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "z" }],
  },
  {
    id: "tab.wake",
    label: "Restore Hibernated Tab",
    group: "Tabs",
    defaultBindings: [{ key: "Enter" }],
  },
  {
    id: "nav.prev",
    label: "Previous Tab (then Workspace)",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "ArrowUp" }],
  },
  {
    id: "nav.next",
    label: "Next Tab (then Workspace)",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "ArrowDown" }],
  },
  // Only live while the new-terminal palette is open (shortcutsDisabled), so Cmd+1..9 keep
  // jumping to a workspace everywhere else; they sit before workspace.selectByIndex to win there.
  {
    id: "palette.folderRoot",
    label: "New Terminal: Workspace Root",
    group: "Palette",
    defaultBindings: [{ [MOD_PROP]: true, key: "1" }],
  },
  {
    id: "palette.folderMain",
    label: "New Terminal: Main Checkout",
    group: "Palette",
    defaultBindings: [{ [MOD_PROP]: true, key: "2" }],
  },
  {
    id: "palette.folderHome",
    label: "New Terminal: Home",
    group: "Palette",
    defaultBindings: [{ [MOD_PROP]: true, key: "3" }],
  },
  {
    id: "palette.menuAction",
    label: "New Terminal: Run Menu Action 1–9",
    group: "Palette",
    // Wildcard digit like workspace.selectByIndex: with a row menu open, Cmd+1..9 run its Nth Action.
    defaultBindings: [{ [MOD_PROP]: true, key: "1" }],
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
    id: "commandPalette.history",
    label: "Search Command History",
    group: "Terminal",
    // Shell reverse-search (Ctrl+R) goes to the palette's > mode instead; it only
    // fires while a terminal is focused and the shell can receive a command.
    defaultBindings: [{ ctrl: true, key: "r" }],
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
    id: "sidebar.showNotes",
    label: "Show Notes",
    group: "Sidebar",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "n" }],
  },
  {
    id: "explorer.viewFilesystem",
    label: "File System",
    group: "Explorer",
    // No default binding: Ctrl+1/Ctrl+2 are now tab.selectByIndex. Cycle the
    // explorer root with Cmd+E (sidebar.showExplorer); these stay reassignable.
    defaultBindings: [],
  },
  {
    id: "explorer.viewPinned",
    label: "Workspace Root",
    group: "Explorer",
    defaultBindings: [],
  },
  {
    id: "explorer.toggleHidden",
    label: "Toggle Hidden Files",
    group: "Explorer",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "." }],
  },
  {
    id: "explorer.search",
    label: "Search Files",
    group: "Explorer",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "f" }],
  },
  {
    id: "path.copy",
    label: "Copy Path",
    group: "Explorer",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "c" }],
  },
  {
    id: "file.copy",
    label: "Copy File",
    group: "Explorer",
    defaultBindings: [{ [MOD_PROP]: true, key: "c" }],
  },
  {
    id: "file.cut",
    label: "Cut File",
    group: "Explorer",
    defaultBindings: [{ [MOD_PROP]: true, key: "x" }],
  },
  {
    id: "file.paste",
    label: "Paste File",
    group: "Explorer",
    defaultBindings: [{ [MOD_PROP]: true, key: "v" }],
  },
  {
    id: "file.delete",
    label: "Delete File",
    group: "Explorer",
    defaultBindings: [{ key: "Delete" }],
  },
  {
    id: "file.rename",
    label: "Rename File",
    group: "Explorer",
    defaultBindings: [{ key: "F2" }],
  },
  {
    id: "tab.new",
    label: "New Terminal Tab",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, key: "t" }],
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
    label: "Reopen Closed Tab or Workspace",
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
    id: "tab.note",
    label: "Toggle Tab Note",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, key: "b" }],
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
    // macOS - on other platforms Ctrl+K is readline's kill-line, so we leave it
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
  {
    id: "editor.cycleView",
    label: "Cycle editor view",
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
    id: "editor.preview.toggleSplit",
    label: "Toggle split preview",
    group: "Editor",
    defaultBindings: [],
  },
  {
    id: "markdown.toggleOutline",
    label: "Markdown: Toggle Outline",
    group: "Editor",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "o" }],
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
  "Explorer",
  "Tabs",
  "Panes",
  "Terminal",
  "View",
  "Editor",
  "Palette",
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

// The shortcuts that take a whole range of digits. Workspaces use 1-9 (0 stays Reset Zoom);
// tabs use 0-9 (0 = last tab). Only the modifiers of their binding are configurable.
const DIGIT_WILDCARDS: Partial<Record<ShortcutId, RegExp>> = {
  "workspace.selectByIndex": /^[1-9]$/,
  "palette.menuAction": /^[1-9]$/,
  "tab.selectByIndex": /^[0-9]$/,
};

export function isDigitWildcard(id: ShortcutId): boolean {
  return id in DIGIT_WILDCARDS;
}

export type Modifiers = Pick<KeyBinding, "ctrl" | "alt" | "shift" | "meta">;

// What the Settings combo offers for a wildcard shortcut; Win+digit is taken by the OS elsewhere.
export const WILDCARD_MODIFIER_PRESETS: readonly Modifiers[] = IS_MAC
  ? [
      { meta: true },
      { ctrl: true },
      { alt: true },
      { meta: true, alt: true },
      { ctrl: true, alt: true },
      { meta: true, shift: true },
    ]
  : [{ ctrl: true }, { alt: true }, { ctrl: true, alt: true }, { ctrl: true, shift: true }];

export function modifiersOf(b: Modifiers): Modifiers {
  return { ctrl: !!b.ctrl, alt: !!b.alt, shift: !!b.shift, meta: !!b.meta };
}

export function sameModifiers(a: Modifiers, b: Modifiers): boolean {
  return (
    !!a.ctrl === !!b.ctrl &&
    !!a.alt === !!b.alt &&
    !!a.shift === !!b.shift &&
    !!a.meta === !!b.meta
  );
}

// The binding a wildcard shortcut stores for the chosen modifiers; the key "1" is only representative.
export function wildcardBinding(mods: Modifiers): KeyBinding {
  return { ...modifiersOf(mods), key: "1" };
}

function wildcardRangeLabel(id: ShortcutId): string {
  return id === "tab.selectByIndex" ? "0–9" : "1–9";
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

  // The index shortcuts only own their modifiers: ANY digit of their range is a
  // hit (the handler reads e.key for the actual index) and the binding key is ignored.
  const range = id && DIGIT_WILDCARDS[id];
  if (range) {
    if (!range.test(e.key)) return false;
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
  const sc = SHORTCUTS_BY_ID.get(id);
  if (!sc) return false;
  const bindings = userShortcuts?.[id] || sc.defaultBindings;
  return bindings.some((b) => matchBinding(e, b, id));
}

/**
 * Builds a KeyBinding from a keydown. On macOS, Option transforms alpha keys
 * (Option+B gives "∫"), so e.code recovers the real key when alt is held.
 */
export function bindingFromEvent(e: KeyboardEvent): KeyBinding {
  const key =
    e.altKey && /^Key[A-Z]$/.test(e.code)
      ? e.code.slice(3).toLowerCase()
      : e.key;
  return {
    key,
    ctrl: e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
    meta: e.metaKey,
  };
}

/**
 * Every shortcut whose effective bindings (user overrides win over defaults)
 * match the event, so the Settings finder reports exactly what the app would run.
 */
export function shortcutsForEvent(
  e: KeyboardEvent,
  userShortcuts?: Record<ShortcutId, KeyBinding[]>,
): Shortcut[] {
  return SHORTCUTS.filter((s) =>
    (userShortcuts?.[s.id] ?? s.defaultBindings).some((b) =>
      matchBinding(e, b, s.id),
    ),
  );
}

/**
 * Display helpers
 */
export function getBindingTokens(binding?: KeyBinding, wildcardOf?: ShortcutId): string[] {
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
  else if (keyLabel === "Enter") keyLabel = ENTER_KEY;
  else if (keyLabel.length === 1) keyLabel = keyLabel.toUpperCase();

  tokens.push(wildcardOf && isDigitWildcard(wildcardOf) ? wildcardRangeLabel(wildcardOf) : keyLabel);
  return tokens;
}

export const SHORTCUTS_BY_ID = new Map(SHORTCUTS.map((s) => [s.id, s]));

export function getShortcutLabel(
  id: ShortcutId,
  userShortcuts: Partial<Record<ShortcutId, KeyBinding[]>>,
  separator = " ",
): string | null {
  const shortcut = SHORTCUTS_BY_ID.get(id);
  if (!shortcut) return null;
  const bindings = userShortcuts[id] ?? shortcut.defaultBindings;
  const tokens = getBindingTokens(bindings?.[0]);
  return tokens.length ? tokens.join(separator) : null;
}

// Palette slots that share Cmd+digit with the menu-action wildcard on purpose: with a row menu
// open the slot's key runs the menu action instead (FolderPalette), so they never compete.
const PALETTE_DIGIT_SLOTS: readonly ShortcutId[] = [
  "palette.folderRoot",
  "palette.folderMain",
  "palette.folderHome",
  "palette.menuAction",
];

function bindingsCollide(a: KeyBinding, aId: ShortcutId, b: KeyBinding, bId: ShortcutId): boolean {
  if (!sameModifiers(a, b)) return false;
  const wa = DIGIT_WILDCARDS[aId];
  const wb = DIGIT_WILDCARDS[bId];
  if (wa && wb) return true;
  if (wa) return wa.test(b.key);
  if (wb) return wb.test(a.key);
  return a.key.toLowerCase() === b.key.toLowerCase();
}

/**
 * The shortcut that already uses `binding`, as `currentId` would bind it. A wildcard claims every
 * digit of its range, so it collides with any literal digit under the same modifiers.
 */
export function findShortcutConflict(
  binding: KeyBinding,
  currentId: ShortcutId,
  userShortcuts: Record<ShortcutId, KeyBinding[]>,
): Shortcut | null {
  const current = SHORTCUTS_BY_ID.get(currentId);
  for (const s of SHORTCUTS) {
    if (s.id === currentId) continue;
    // A palette shortcut is only live while its palette is open, so it never competes with the index jumps.
    if (
      (s.group === "Palette" && current?.id.endsWith("selectByIndex")) ||
      (current?.group === "Palette" && s.id.endsWith("selectByIndex"))
    )
      continue;
    if (PALETTE_DIGIT_SLOTS.includes(s.id) && PALETTE_DIGIT_SLOTS.includes(currentId)) continue;
    const bindings = s.id in userShortcuts ? userShortcuts[s.id] : s.defaultBindings;
    if (bindings.some((b) => bindingsCollide(b, s.id, binding, currentId))) return s;
  }
  return null;
}
