import type { ShortcutId } from "@/modules/shortcuts/shortcuts";
import { PALETTE_TAB_SHORTCUTS } from "./paletteShortcuts";

export type OpenPalette = "none" | "commands" | "folder";

// The two palettes never stack (opening the command palette drops the folder one).
export function openPaletteOf(commandsOpen: boolean, folderOpen: boolean): OpenPalette {
  if (commandsOpen) return "commands";
  return folderOpen ? "folder" : "none";
}

const TAB_AND_WORKSPACE: readonly ShortcutId[] = [
  ...(Object.keys(PALETTE_TAB_SHORTCUTS) as ShortcutId[]),
  "tab.new",
  "workspace.close",
];

// Everything a palette lets through while it is open; any other shortcut, including one added
// later, stays blocked until it is listed here. The folder palette swallows the tab shortcuts
// it has no use for, so it shares the tab list. The three that reopen the command palette let
// its mode change without closing it first.
export const PALETTE_ALLOWED_SHORTCUTS: Record<Exclude<OpenPalette, "none">, readonly ShortcutId[]> = {
  commands: [...TAB_AND_WORKSPACE, "commandPalette.open", "commandPalette.content", "commandPalette.history"],
  folder: [
    ...TAB_AND_WORKSPACE,
    "palette.folderRoot",
    "palette.folderMain",
    "palette.folderHome",
    "palette.menuAction",
    "palette.worktrees",
  ],
};

// Only the folder palette has folder rows to pick, so its shortcuts are dead anywhere else.
export function shortcutBlockedByPalette(id: ShortcutId, palette: OpenPalette): boolean {
  if (palette === "none") return id.startsWith("palette.");
  return !PALETTE_ALLOWED_SHORTCUTS[palette].includes(id);
}

// Ids of the native menu items the frontend reacts to on the `kex:menu` event.
export const MENU_ITEM_IDS = [
  "settings",
  "new_workspace",
  "new_terminal",
  "new_browser",
  "toggle_autosave",
  "close_tab",
  "close_others",
  "close_all",
  "toggle_sidebar",
  "toggle_explorer",
  "toggle_git",
  "toggle_history",
  "toggle_hidden",
  "toggle_sidebar_side",
] as const;

export type MenuItemId = (typeof MENU_ITEM_IDS)[number];

// The shortcut each menu item is the twin of; null for the ones with no shortcut, which a palette
// always blocks because they would act on the workspace behind it.
export const MENU_ITEM_SHORTCUT: Record<MenuItemId, ShortcutId | null> = {
  settings: "settings.open",
  new_workspace: "workspace.new",
  new_terminal: "tab.new",
  new_browser: "tab.newBrowser",
  toggle_autosave: null,
  close_tab: "tab.close",
  close_others: null,
  close_all: null,
  toggle_sidebar: "sidebar.toggle",
  toggle_explorer: "sidebar.showExplorer",
  toggle_git: "sidebar.showGit",
  toggle_history: "sidebar.showHistory",
  toggle_hidden: "explorer.toggleHidden",
  toggle_sidebar_side: null,
};

export function menuItemBlockedByPalette(id: string, palette: OpenPalette): boolean {
  if (palette === "none") return false;
  const shortcut = MENU_ITEM_SHORTCUT[id as MenuItemId];
  if (!shortcut) return true;
  return shortcutBlockedByPalette(shortcut, palette);
}
