import type { SearchTarget } from "@/modules/header";
import type { SettingsSection } from "@/modules/settings/openSettingsWindow";
import { SETTINGS_SECTIONS } from "@/modules/settings/sections";
import type { ShortcutHandlers } from "@/modules/shortcuts";
import { SHORTCUTS, type ShortcutId } from "@/modules/shortcuts/shortcuts";
import { allPaneIds } from "@/modules/workspaces/lib/splitNode";
import type { SplitNode } from "@/modules/workspaces/lib/types";
import {
  ArrowReloadHorizontalIcon,
  ArrowRight01Icon,
  Cancel01Icon,
  CancelCircleIcon,
  CancelSquareIcon,
  FileEditIcon,
  FileSearchIcon,
  Globe02Icon,
  KeyboardIcon,
  LayoutTwoColumnIcon,
  LayoutTwoRowIcon,
  PaintBoardIcon,
  PlayIcon,
  Refresh01Icon,
  Search01Icon,
  Settings01Icon,
  SidebarLeftIcon,
  SourceCodeIcon,
  TerminalIcon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { commandBlockedWhileHibernated } from "@/modules/workspaces/lib/hibernate";
import type { PaletteItem } from "./types";

export const COMMAND_GROUPS = [
  "General",
  "Tabs",
  "Panes",
  "Terminal",
  "Editor",
  "Sidebar",
  "Explorer",
  "View",
  "Git",
  "Search",
  "Settings",
] as const;

// Explorer labels ("File System", "Workspace Root") only make sense under their group in the
// shortcuts panel; in one flat list they get it back. Other groups already read on their own.
export function paletteTitle(label: string, group: string): string {
  return group === "Explorer" && !label.toLowerCase().includes("explorer") ? `Explorer: ${label}` : label;
}

export const UNLISTED_SHORTCUTS: Readonly<Record<string, string>> = {
  "commandPalette.open": "already inside the palette",
  "file.copy": "acts on the explorer selection, which a closing palette loses",
  "file.cut": "acts on the explorer selection, which a closing palette loses",
  "file.paste": "acts on the explorer selection, which a closing palette loses",
  "file.delete": "acts on the explorer selection, which a closing palette loses",
  "editor.undo": "buffer transaction of the focused editor",
  "editor.redo": "buffer transaction of the focused editor",
  "tab.next": "relative navigation with no target to pick",
  "tab.prev": "relative navigation with no target to pick",
  "pane.focusUp": "relative navigation with no target to pick",
  "pane.focusDown": "relative navigation with no target to pick",
  "pane.focusLeft": "relative navigation with no target to pick",
  "pane.focusRight": "relative navigation with no target to pick",
  "workspace.prev": "relative navigation with no target to pick",
  "workspace.next": "relative navigation with no target to pick",
  "tab.selectByIndex": "handler is parametrised by the digit key",
  "workspace.selectByIndex": "handler is parametrised by the digit key",
};

export type CommandPaletteActionContext = {
  activeWorkspacePaneTree: SplitNode | null;
  workspacePaneLimit: number;
  workspaceCount: number;
  activeId: string;
  searchTarget: SearchTarget;
  explorerRoot: string | null;
  home: string | null;
  openNewTab: () => void;
  openNewWorkspace: () => void;
  openNewEditor: () => void;
  openNewBrowser: () => void;
  openGitGraph: () => void;
  toggleSourceControl: () => void;
  closeActiveTabOrPane: () => void;
  splitPaneRight: () => void;
  splitPaneDown: () => void;
  focusSearch: () => void;
  focusExplorerSearch: () => void;
  toggleSidebar: () => void;
  openSettings: () => void;
  openKeyboardShortcuts: () => void;
  reopenClosedTab: () => void;
  openNewWindow: () => void;
  clearTerminal: () => void;
  toggleZenMode: () => void;
  hasActiveTerminal: boolean;
  hibernated: boolean;
  activePaneTabCount: number;
  hasActiveTab: boolean;
  hasActiveTabTitle: boolean;
  closeOtherTabs: () => void;
  closeAllTabs: () => void;
  resetActiveTabTitle: () => void;
  openWorkspaceProperties: () => void;
  openActionsConfiguration: () => void;
  shortcutHandlers: ShortcutHandlers;
  isShortcutAvailable: (id: ShortcutId) => boolean;
  openSettingsSection: (section: SettingsSection) => void;
  hasActiveTabNote: boolean;
  removeActiveTabNote: () => void;
  splitBrowserRight: () => void;
  splitBrowserDown: () => void;
};

const noop = () => {};

export function createCommandItems(
  ctx: CommandPaletteActionContext,
): PaletteItem[] {
  const activePaneCount = ctx.activeWorkspacePaneTree
    ? allPaneIds(ctx.activeWorkspacePaneTree).length
    : 0;
  const onlyOneWorkspace = ctx.workspaceCount < 2;
  const noWorkspaceRoot = !ctx.explorerRoot && !ctx.home;
  const splitDisabled =
    activePaneCount >= ctx.workspacePaneLimit ? "Pane limit" : undefined;
  const closeDisabled =
    onlyOneWorkspace && activePaneCount < 2 ? "Last workspace" : undefined;

  const base: PaletteItem[] = [
    {
      id: "settings.open",
      title: "Open settings",
      group: "General",
      keywords: ["preferences", "config"],
      icon: Settings01Icon,
      shortcutId: "settings.open",
      run: ctx.openSettings,
    },
    {
      id: "theme.pick",
      title: "Change theme...",
      group: "General",
      keywords: ["theme", "appearance", "color", "dark", "light"],
      icon: PaintBoardIcon,
      run: noop,
    },
    {
      id: "shortcuts.open",
      title: "Keyboard shortcuts",
      group: "General",
      keywords: ["keys", "keybindings", "settings"],
      icon: KeyboardIcon,
      run: ctx.openKeyboardShortcuts,
    },
    {
      id: "tab.new",
      title: "New terminal tab",
      group: "Tabs",
      keywords: ["shell", "terminal", "new tab", "pane"],
      icon: TerminalIcon,
      shortcutId: "tab.new",
      run: ctx.openNewTab,
    },
    {
      id: "workspace.new",
      title: "New workspace",
      group: "Tabs",
      keywords: ["workspace", "sidebar", "new"],
      icon: TerminalIcon,
      shortcutId: "workspace.new",
      run: ctx.openNewWorkspace,
    },
    {
      id: "window.new",
      title: "New window",
      group: "General",
      keywords: ["window", "new", "open"],
      icon: TerminalIcon,
      shortcutId: "window.new",
      run: ctx.openNewWindow,
    },
    {
      id: "tab.reopenClosed",
      title: "Reopen closed tab or workspace",
      group: "Tabs",
      keywords: ["reopen", "undo close", "restore tab", "restore workspace"],
      icon: ArrowReloadHorizontalIcon,
      shortcutId: "tab.reopenClosed",
      run: ctx.reopenClosedTab,
    },
    {
      id: "terminal.clear",
      title: "Clear terminal",
      group: "Tabs",
      keywords: ["clear", "clean", "reset", "terminal"],
      icon: Refresh01Icon,
      shortcutId: "terminal.clear",
      disabledReason: ctx.hasActiveTerminal ? undefined : "No active terminal",
      run: ctx.clearTerminal,
    },
    {
      id: "view.zenMode",
      title: "Toggle full pane",
      group: "View",
      keywords: ["zen", "fullscreen", "focus", "expand", "pane"],
      icon: UnfoldMoreIcon,
      shortcutId: "view.zenMode",
      disabledReason: activePaneCount > 1 ? undefined : "Single pane",
      run: ctx.toggleZenMode,
    },
    {
      id: "tab.newEditor",
      title: "New editor tab",
      group: "Tabs",
      keywords: ["file", "editor", "create"],
      icon: FileEditIcon,
      shortcutId: "tab.newEditor",
      disabledReason: noWorkspaceRoot ? "No workspace root" : undefined,
      run: ctx.openNewEditor,
    },
    {
      id: "tab.newBrowser",
      title: "New browser tab",
      group: "Tabs",
      keywords: ["browser", "web", "localhost", "preview"],
      icon: Globe02Icon,
      shortcutId: "tab.newBrowser",
      run: ctx.openNewBrowser,
    },
    {
      id: "tab.close",
      title: "Close tab or pane",
      group: "Tabs",
      keywords: ["close", "remove", "pane"],
      icon: Cancel01Icon,
      shortcutId: "tab.close",
      disabledReason: closeDisabled,
      run: ctx.closeActiveTabOrPane,
    },
    {
      id: "tab.closeOthers",
      title: "Close other tabs",
      group: "Tabs",
      keywords: ["close", "others", "tabs", "pane"],
      icon: CancelCircleIcon,
      disabledReason: ctx.activePaneTabCount > 1 ? undefined : "Single tab",
      run: ctx.closeOtherTabs,
    },
    {
      id: "tab.closeAll",
      title: "Close all tabs",
      group: "Tabs",
      keywords: ["close", "all", "tabs", "pane"],
      icon: CancelSquareIcon,
      disabledReason: ctx.activePaneTabCount > 0 ? undefined : "No tabs",
      run: ctx.closeAllTabs,
    },
    {
      id: "tab.moveToWorkspace",
      title: "Move tab to workspace...",
      group: "Tabs",
      keywords: ["move", "tab", "workspace", "send"],
      icon: ArrowRight01Icon,
      disabledReason: ctx.hasActiveTab ? undefined : "No active tab",
      run: noop,
    },
    {
      id: "tab.resetTitle",
      title: "Reset tab title",
      group: "Tabs",
      keywords: ["reset", "title", "name", "tab"],
      icon: ArrowReloadHorizontalIcon,
      disabledReason: ctx.hasActiveTabTitle ? undefined : "No custom title",
      run: ctx.resetActiveTabTitle,
    },
    {
      id: "pane.splitRight",
      title: "Split pane right",
      group: "Panes",
      keywords: ["terminal", "pane", "split", "right", "column"],
      icon: LayoutTwoColumnIcon,
      shortcutId: "pane.splitRight",
      disabledReason: splitDisabled,
      run: ctx.splitPaneRight,
    },
    {
      id: "pane.splitDown",
      title: "Split pane down",
      group: "Panes",
      keywords: ["terminal", "pane", "split", "down", "row"],
      icon: LayoutTwoRowIcon,
      shortcutId: "pane.splitDown",
      disabledReason: splitDisabled,
      run: ctx.splitPaneDown,
    },
    {
      id: "git.graph",
      title: "Open git graph",
      group: "Git",
      keywords: ["git", "graph", "history", "log", "commits"],
      icon: SourceCodeIcon,
      run: ctx.openGitGraph,
    },
    {
      id: "git.source",
      title: "Toggle Git panel",
      group: "Git",
      keywords: ["git", "source control", "changes", "staging", "diff"],
      icon: SourceCodeIcon,
      run: ctx.toggleSourceControl,
    },
    {
      id: "search.content",
      title: "Find content in files",
      group: "Search",
      keywords: ["grep", "ripgrep", "text", "contents", "search in files"],
      icon: FileSearchIcon,
      shortcutId: "commandPalette.content",
      trailing: "#",
      run: noop,
    },
    {
      id: "history.open",
      title: "Search command history",
      group: "Search",
      keywords: ["history", "shell", "rerun", "previous commands"],
      icon: TerminalIcon,
      trailing: ">",
      run: noop,
    },
    {
      id: "search.focus",
      title: "Find in current tab",
      group: "Search",
      keywords: ["find", "terminal", "editor", "current"],
      icon: Search01Icon,
      shortcutId: "search.focus",
      disabledReason: ctx.searchTarget ? undefined : "No searchable view",
      run: ctx.focusSearch,
    },
    {
      id: "explorer.search",
      title: "Search files by name",
      group: "Search",
      keywords: ["explorer", "workspace", "file", "open"],
      icon: Search01Icon,
      shortcutId: "explorer.search",
      disabledReason: ctx.explorerRoot ? undefined : "No workspace root",
      run: ctx.focusExplorerSearch,
    },
    {
      id: "sidebar.toggle",
      title: "Toggle sidebar",
      group: "View",
      keywords: ["sidebar", "panel", "right", "toggle"],
      icon: SidebarLeftIcon,
      shortcutId: "sidebar.toggle",
      run: ctx.toggleSidebar,
    },
    {
      id: "workspace.properties",
      title: "Workspace properties",
      group: "General",
      keywords: ["workspace", "settings", "name", "root", "properties", "configure"],
      icon: Settings01Icon,
      run: ctx.openWorkspaceProperties,
    },
    {
      id: "workspace.runScripts",
      title: "Configure workspace actions",
      group: "General",
      keywords: ["run", "script", "scripts", "actions", "action", "app", "configure", "configuration", "commands"],
      icon: PlayIcon,
      run: ctx.openActionsConfiguration,
    },
    {
      id: "tab.note.remove",
      title: "Remove tab note",
      group: "Tabs",
      keywords: ["note", "delete", "clear"],
      icon: Cancel01Icon,
      disabledReason: ctx.hasActiveTabNote ? undefined : "No note on this tab",
      run: ctx.removeActiveTabNote,
    },
    {
      id: "pane.splitBrowserRight",
      title: "Split pane right with a browser",
      group: "Panes",
      keywords: ["browser", "web", "split", "right"],
      icon: Globe02Icon,
      disabledReason: splitDisabled,
      run: ctx.splitBrowserRight,
    },
    {
      id: "pane.splitBrowserDown",
      title: "Split pane down with a browser",
      group: "Panes",
      keywords: ["browser", "web", "split", "down"],
      icon: Globe02Icon,
      disabledReason: splitDisabled,
      run: ctx.splitBrowserDown,
    },
  ];

  const covered = new Set<string>(
    base.map((i) => i.shortcutId).filter((id): id is ShortcutId => !!id),
  );
  const generated: PaletteItem[] = SHORTCUTS.filter(
    (s) => !covered.has(s.id) && !(s.id in UNLISTED_SHORTCUTS),
  ).map((s) => {
    const handler = ctx.shortcutHandlers[s.id];
    return {
      id: s.id,
      title: paletteTitle(s.label, s.group),
      group: s.group,
      shortcutId: s.id,
      disabledReason: handler && ctx.isShortcutAvailable(s.id) ? undefined : "Not available here",
      run: () => handler?.(new KeyboardEvent("keydown")),
    };
  });
  const settings: PaletteItem[] = SETTINGS_SECTIONS.map((section) => ({
    id: `settings.section.${section.id}`,
    title: `${section.label} settings`,
    group: "Settings",
    keywords: ["settings", "preferences", "options", section.id],
    icon: section.icon,
    run: () => ctx.openSettingsSection(section.id),
  }));
  const all = [...base, ...generated, ...settings];
  if (!ctx.hibernated) return all;
  return all.map((item) =>
    commandBlockedWhileHibernated(item.id) ? { ...item, disabledReason: "Workspace hibernated" } : item,
  );
}
